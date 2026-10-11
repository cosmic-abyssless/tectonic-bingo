// The + Discord step of the delivery chain (CONTEXT.md "Notification", docs/adr/0003-discord-dms-not-web-push.md): a DM
// from the clan's bot when no open tab reaches the user. Only DMs fold: the first Notification of a group (user, Bingo,
// kind) opens a window (a Site admin setting per kind), and when it ends one DM goes out for all of them. The window's
// DM is dropped if the user opens the site meanwhile (they've had the toasts), if it's no longer true (a Pairing
// request answered, a pick made), or if it couldn't go out within two hours of its event. On a dev server DMs never
// reach Discord: they're written to the fake sink (the DM log, sink true) that the dev tools list.
import { and, asc, desc, eq, inArray, lt, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DiscordAPIError, REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import {
  DEFAULT_FOLDING_WINDOWS,
  NOTIFICATION_CATALOGUE,
  isDiscordKindOn,
  isNotificationKind,
  type DevDmSinkEntry,
  type FoldingWindows,
  type NotificationData,
  type NotificationKind,
} from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, notificationDmLog, notificationDmQueue, notifications, siteSettings, users } from "../db/schema";
import { isDevModeActive } from "../devMode";
import { audit, diffFields, markAuditedNoop } from "../audit/record";
import { now as clockNow } from "../clock";
import { log } from "../log";
import { userPresence } from "../ws";
import { ServiceError } from "./errors";
import { discordUnreachableSince, getSettings, setDiscordUnreachable, setDmHandoff, INBOX_DAYS, type StoredNotification } from "./notificationService";
import { stillTrue } from "./notificationDispatch";
import { dmScreenshot, SCREENSHOT_KINDS, type DmImage } from "./dmScreenshot";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

/** A DM not sent within this long of when it was due is dropped. */
export const DM_STALE_MS = 2 * 60 * 60 * 1000;
/** How often the round looks for DMs that are due. */
export const DM_ROUND_MS = 15_000;
/** The longest a folding window may be set to. */
export const MAX_FOLDING_MINUTES = 24 * 60;
/** Discord's "Cannot send messages to this user": they don't take DMs from server members, or left the server. */
export const DISCORD_CANNOT_DM = 50007;

const FOLDING_KEY = "notificationFolding";

// ---------------------------------------------------------------------------
// Folding windows (a Site admin setting)
// ---------------------------------------------------------------------------

/** The folding windows in force: the stored ones over the defaults. Read on every DM, so a change applies at once. */
export function getFoldingWindows(db: Queryable): FoldingWindows {
  const row = db.select().from(siteSettings).where(eq(siteSettings.key, FOLDING_KEY)).get();
  const out: FoldingWindows = { ...DEFAULT_FOLDING_WINDOWS };
  if (!row) return out;
  try {
    for (const [kind, minutes] of Object.entries(JSON.parse(row.valueJson) as Record<string, unknown>)) {
      if (isNotificationKind(kind) && typeof minutes === "number" && Number.isFinite(minutes)) out[kind] = minutes;
    }
  } catch {
    // A bad value reads as the defaults.
  }
  return out;
}

/** Replaces the folding windows given (minutes, 0 to MAX_FOLDING_MINUTES; 0 sends at once). */
export function updateFoldingWindows(db: Db, input: unknown, userId: string): FoldingWindows {
  if (!input || typeof input !== "object") throw new ServiceError(400, "Folding windows must be an object of minutes per kind");
  const patch: FoldingWindows = {};
  for (const [kind, minutes] of Object.entries(input)) {
    if (!isNotificationKind(kind)) throw new ServiceError(400, `There's no notification kind "${kind}"`);
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0 || minutes > MAX_FOLDING_MINUTES) throw new ServiceError(400, `${NOTIFICATION_CATALOGUE[kind].label}'s window must be a whole number of minutes from 0 to ${MAX_FOLDING_MINUTES}`);
    patch[kind] = minutes;
  }
  return db.transaction((tx) => {
    const before = getFoldingWindows(tx);
    const next = { ...before, ...patch };
    const label = (w: FoldingWindows) => Object.fromEntries(Object.entries(w).map(([k, v]) => [NOTIFICATION_CATALOGUE[k as NotificationKind].label, v ?? 0]));
    const changes = diffFields(label(before), label(next));
    if (!changes) {
      markAuditedNoop();
      return before;
    }
    const valueJson = JSON.stringify(next);
    tx.insert(siteSettings)
      .values({ key: FOLDING_KEY, valueJson, updatedByUserId: userId, updatedAt: clockNow() })
      .onConflictDoUpdate({ target: siteSettings.key, set: { valueJson, updatedByUserId: userId, updatedAt: clockNow() } })
      .run();
    audit(tx, {
      action: "notification_folding.updated",
      bingoId: null,
      entity: { type: "site_settings", id: FOLDING_KEY, label: "Notification folding" },
      details: { changes: changes as { before: Record<string, number>; after: Record<string, number> } },
    });
    return next;
  });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** Sends a DM to a Discord user, with an image attached when given. Throws DmError. Tests pass a fake. */
export interface DiscordDmApi {
  send(discordId: string, content: string, image?: DmImage): Promise<void>;
}

export class DmError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message);
  }
}

class RestDiscordDmApi implements DiscordDmApi {
  private readonly rest: REST;
  private readonly channels = new Map<string, string>();
  constructor(token: string) {
    this.rest = new REST({ version: "10", retries: 1 }).setToken(token);
  }
  async send(discordId: string, content: string, image?: DmImage): Promise<void> {
    try {
      let channelId = this.channels.get(discordId);
      if (!channelId) {
        channelId = ((await this.rest.post(Routes.userChannels(), { body: { recipient_id: discordId } })) as { id: string }).id;
        this.channels.set(discordId, channelId);
      }
      const body = { content, allowed_mentions: { parse: [] } };
      await this.rest.post(Routes.channelMessages(channelId), image ? { body, files: [{ name: image.name, data: image.data, contentType: "image/webp" }] } : { body });
    } catch (err) {
      if (err instanceof DiscordAPIError) throw new DmError(`Discord: ${err.message}`, typeof err.code === "number" ? err.code : null);
      throw new DmError(`Couldn't reach Discord: ${err instanceof Error ? err.message : String(err)}`, null);
    }
  }
}

let restApi: RestDiscordDmApi | null = null;
let testApi: DiscordDmApi | null | undefined;

/** Tests swap the Discord side out (undefined: back to the real one). */
export function setDiscordDmApiForTests(api: DiscordDmApi | null | undefined): void {
  testApi = api;
}

/** The bot, or null without DISCORD_BOT_TOKEN. Never on a dev server, whose DMs go to the fake sink. */
function discordDmApi(): DiscordDmApi | null {
  if (testApi !== undefined) return testApi;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return (restApi ??= new RestDiscordDmApi(token));
}

/** Whether DMs go to the fake sink instead of Discord: on every dev server. */
function usesSink(): boolean {
  return testApi === undefined && isDevModeActive();
}

/** Whether the + Discord step can be offered: the bot's token is set, or this is a dev server (the fake sink). */
export function discordDmsAvailable(): boolean {
  return usesSink() || discordDmApi() !== null;
}

function siteUrl(path: string | null): string {
  const base = (process.env.CLIENT_URL ?? "").replace(/\/$/, "");
  return path ? `${base}${path}` : base || "";
}

/** One DM's text: the Notification's own words, or the kind's fold for several, and a link to the site. A DM about one drop of the recipient's own Team also carries its screenshot (dmScreenshot.ts). */
export function dmText(rows: StoredNotification[], bingoName: string | null): string {
  const first = rows[0]!;
  const kind = first.kind as NotificationKind;
  const fold = NOTIFICATION_CATALOGUE[kind]?.fold;
  const text =
    rows.length > 1 && fold
      ? fold(rows.map((r) => JSON.parse(r.dataJson) as NotificationData), bingoName)
      : `**${first.title}**${first.body ? `\n${first.body}` : ""}${rows.length > 1 ? `\n(and ${rows.length - 1} more)` : ""}`;
  const link = siteUrl(first.link);
  return link ? `${text}\n${link}` : text;
}

/** Sends (or, on a dev server, sinks) one DM and logs it. A 50007 marks the user unreachable. Null if it went, else why not. */
async function sendDm(db: Db, user: { id: string; discordId: string }, kind: NotificationKind, bingoId: string | null, text: string, count: number, image?: DmImage): Promise<string | null> {
  const sentAt = new Date();
  if (usesSink()) {
    // The sink keeps text only: it notes the image, so a generated DM shows it would have carried one.
    const logged = image ? `${text}\n[screenshot attached, ${Math.round(image.data.length / 1024)} KB]` : text;
    db.insert(notificationDmLog).values({ userId: user.id, bingoId, kind, text: logged, count, sink: true, sentAt }).run();
    return null;
  }
  const api = discordDmApi();
  if (!api) return "Discord DMs aren't set up on this server";
  try {
    await api.send(user.discordId, text, image);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (err instanceof DmError && err.code === DISCORD_CANNOT_DM) {
      setDiscordUnreachable(db, user.id, sentAt);
      log.info("discord dm refused: marked unreachable", { userId: user.id });
      return reason;
    }
    // Discord refusing for another reason (a bad token, missing permissions, rate limits) is the bot's problem, not the
    // user's, and stops everyone's DMs: Sentry hears of it. Not reaching Discord at all is usually a blip.
    if (err instanceof DmError && err.code !== null) log.error("discord dm refused", { err, code: err.code, userId: user.id });
    else log.warn("discord dm failed", { err, userId: user.id });
    return reason;
  }
  db.insert(notificationDmLog).values({ userId: user.id, bingoId, kind, text, count, sink: false, sentAt }).run();
  return null;
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/**
 * Queues a Notification for a DM (delivery's handoff, for a user at + Discord whom no tab reaches). It joins the open
 * window of its (user, Bingo, kind), if one is still open at the time it happened; else it opens one, due after the
 * kind's window (at once for a kind with none).
 */
export function queueDm(db: Db, notification: StoredNotification, devClock: boolean): void {
  if (discordUnreachableSince(db, notification.userId)) return;
  const at = notification.createdAt;
  const sameGroup = and(
    eq(notificationDmQueue.userId, notification.userId),
    notification.bingoId ? eq(notificationDmQueue.bingoId, notification.bingoId) : undefined,
    eq(notificationDmQueue.kind, notification.kind),
  );
  const open = db.select().from(notificationDmQueue).where(sameGroup).orderBy(desc(notificationDmQueue.sendAt)).limit(1).get();
  if (open && open.sendAt.getTime() > at.getTime() && (open.bingoId ?? null) === (notification.bingoId ?? null)) {
    const ids = [...(JSON.parse(open.notificationIdsJson) as string[]), notification.id];
    db.update(notificationDmQueue).set({ notificationIdsJson: JSON.stringify(ids) }).where(eq(notificationDmQueue.id, open.id)).run();
    return;
  }
  const minutes = getFoldingWindows(db)[notification.kind as NotificationKind] ?? 0;
  db.insert(notificationDmQueue)
    .values({
      userId: notification.userId,
      bingoId: notification.bingoId,
      kind: notification.kind,
      notificationIdsJson: JSON.stringify([notification.id]),
      firstEventAt: at,
      sendAt: new Date(at.getTime() + minutes * 60_000),
      devClock,
    })
    .run();
  // Nothing to wait for: sent on the next round, a few seconds away.
}

/** The user opened the site: the DMs waiting for them are dropped, as they've had the toasts. */
export function cancelPendingDms(db: Queryable, userId: string): number {
  return db.delete(notificationDmQueue).where(eq(notificationDmQueue.userId, userId)).run().changes;
}

/** Sends every DM that's due (by the real clock), dropping those no longer worth sending. Returns how many went. */
export async function runDmRound(db: Db, now = new Date()): Promise<number> {
  const due = db.select().from(notificationDmQueue).where(lte(notificationDmQueue.sendAt, now)).orderBy(asc(notificationDmQueue.sendAt)).all();
  let sent = 0;
  for (const item of due) {
    // Taken off the queue first, so a slow send can't go out twice from the next round.
    if (db.delete(notificationDmQueue).where(eq(notificationDmQueue.id, item.id)).run().changes === 0) continue;
    if (!item.devClock && now.getTime() - item.sendAt.getTime() > DM_STALE_MS) continue;
    const settings = getSettings(db, item.userId);
    // Turned down meanwhile: not at + Discord any more, or this kind kept off Discord.
    if (settings.level !== "discord" || !isDiscordKindOn(item.kind as NotificationKind, settings.discordKinds) || discordUnreachableSince(db, item.userId)) continue;
    if (!item.devClock && userPresence(item.userId).visible) continue;
    const ids = JSON.parse(item.notificationIdsJson) as string[];
    const rows = ids.length ? db.select().from(notifications).where(inArray(notifications.id, ids)).orderBy(asc(notifications.createdAt)).all() : [];
    const kind = item.kind as NotificationKind;
    const live = rows.filter((r) => stillTrue(db, kind, r.bingoId, (JSON.parse(r.dataJson) as NotificationData).ref));
    if (live.length === 0) continue;
    const user = db.select({ id: users.id, discordId: users.discordId }).from(users).where(eq(users.id, item.userId)).get();
    if (!user) continue;
    const bingoName = item.bingoId ? (db.select({ name: bingos.name }).from(bingos).where(eq(bingos.id, item.bingoId)).get()?.name ?? null) : null;
    // A DM about one drop of their own Team carries its screenshot; a fold of several doesn't.
    const submissionId = live.length === 1 && SCREENSHOT_KINDS.has(kind) ? (JSON.parse(live[0]!.dataJson) as NotificationData).submissionId : undefined;
    const image = submissionId ? ((await dmScreenshot(db, submissionId)) ?? undefined) : undefined;
    if ((await sendDm(db, user, kind, item.bingoId, dmText(live, bingoName), live.length, image)) === null) sent++;
  }
  return sent;
}

/**
 * A test DM: Try again (settings) for a user Discord refused, and Send a test DM for a Site admin checking that DMs go
 * out at all. Sent, the user is reachable again; refused (50007), they're (still) unreachable. A failure says what
 * Discord said, so a Site admin sees a bot-side problem (a bad token, missing access) at once.
 */
export async function sendTestDm(db: Db, user: { id: string; discordId: string }): Promise<{ ok: boolean; message: string }> {
  if (!discordDmsAvailable()) throw new ServiceError(400, "Discord DMs aren't set up on this server");
  setDiscordUnreachable(db, user.id, null);
  const failed = await sendDm(db, user, "bingo_open", null, `**Test from Tectonic Bingo**\nNotifications will reach you here.${siteUrl(null) ? `\n${siteUrl("/settings/notifications")}` : ""}`, 1);
  if (failed === null) return { ok: true, message: usesSink() ? "Sent to the fake sink (this is a dev server): see Site admin > Test data." : "Sent. Check your Discord DMs." };
  if (discordUnreachableSince(db, user.id)) return { ok: false, message: "Discord won't let the bot DM you. Allow DMs from server members and try again." };
  return { ok: false, message: `Couldn't send it: ${failed}` };
}

/** Drops DM log entries past the Inbox's age. */
export function pruneDmLog(db: Queryable, now: Date): number {
  return db.delete(notificationDmLog).where(lt(notificationDmLog.sentAt, new Date(now.getTime() - INBOX_DAYS * 86_400_000))).run().changes;
}

/** The dev server's fake sink, newest first. */
export function listDmSink(db: Queryable, limit = 200): DevDmSinkEntry[] {
  return db
    .select({ log: notificationDmLog, user: { discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName } })
    .from(notificationDmLog)
    .innerJoin(users, eq(users.id, notificationDmLog.userId))
    .where(eq(notificationDmLog.sink, true))
    .orderBy(desc(notificationDmLog.sentAt))
    .limit(limit)
    .all()
    .map((r) => ({
      id: r.log.id,
      userId: r.log.userId,
      userName: r.user.discordGlobalName ?? r.user.discordUsername,
      kind: r.log.kind as NotificationKind,
      bingoId: r.log.bingoId,
      text: r.log.text,
      count: r.log.count,
      sentAt: r.log.sentAt.toISOString(),
    }));
}

/** Hands delivery's Discord step to the queue. Called once at startup (and by tests). */
export function installDmHandoff(): void {
  setDmHandoff(queueDm);
}
