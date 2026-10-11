// Notifications (CONTEXT.md "Notification", "Inbox"): each user's settings, their Inbox, and getting a new one to them
// by the delivery chain (docs/adr/0003-discord-dms-not-web-push.md). What makes a Notification is
// notificationDispatch.ts (from the audit log) and notificationScheduler.ts (the kinds no request makes).
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  DEFAULT_QUEUE_THRESHOLD,
  NOTIFICATION_KINDS,
  QUEUE_THRESHOLDS,
  isKindOn,
  isNotificationKind,
  levelAtLeast,
  type NotificationData,
  type NotificationEntry,
  type NotificationGroup,
  type NotificationKind,
  type NotificationLevel,
  type NotificationSettings,
  type QueueThreshold,
} from "@bingo/shared";
import * as schema from "../db/schema";
import { bingoModerators, bingoStaff, notificationSettings, notifications, signups, teamMembers, teams, users } from "../db/schema";
import { now as clockNow } from "../clock";
import { getAuditContext } from "../audit/context";
import { sendToUser, userPresence } from "../ws";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

/** How long an Inbox keeps a Notification. */
export const INBOX_DAYS = 30;
const INBOX_PAGE = 50;

const DEFAULT_SETTINGS: NotificationSettings = { level: "off", kinds: {}, queueThresholdMinutes: DEFAULT_QUEUE_THRESHOLD, catchUpEnabled: true };

type SettingsRow = typeof notificationSettings.$inferSelect;

function parseKinds(json: string): NotificationSettings["kinds"] {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter(([k, v]) => isNotificationKind(k) && typeof v === "boolean")) as NotificationSettings["kinds"];
  } catch {
    return {};
  }
}

function toSettings(row: SettingsRow | undefined): NotificationSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const threshold = (QUEUE_THRESHOLDS as readonly number[]).includes(row.queueThresholdMinutes) ? (row.queueThresholdMinutes as QueueThreshold) : DEFAULT_QUEUE_THRESHOLD;
  return { level: row.level, kinds: parseKinds(row.kindsJson), queueThresholdMinutes: threshold, catchUpEnabled: row.catchUpEnabled };
}

export function getSettings(db: Queryable, userId: string): NotificationSettings {
  return toSettings(db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).get());
}

/** Only the kinds that differ from their default are kept, so a later change of default still reaches the rest. */
function storedKinds(kinds: NotificationSettings["kinds"]): NotificationSettings["kinds"] {
  return Object.fromEntries(Object.entries(kinds).filter(([k, v]) => isNotificationKind(k) && typeof v === "boolean" && isKindOn(k, {}) !== v));
}

export interface SettingsPatch {
  level?: unknown;
  kinds?: unknown;
  queueThresholdMinutes?: unknown;
  catchUpEnabled?: unknown;
}

/** Changes what's given; the kinds given are merged over the stored ones. Throws a 400 for anything malformed. */
export function updateSettings(db: Queryable, userId: string, patch: SettingsPatch): NotificationSettings {
  const current = getSettings(db, userId);
  const next: NotificationSettings = { ...current, kinds: { ...current.kinds } };
  if (patch.level !== undefined) {
    if (!["off", "app", "browser", "discord"].includes(patch.level as string)) throw new ServiceError(400, "level must be off, app, browser or discord");
    next.level = patch.level as NotificationLevel;
  }
  if (patch.kinds !== undefined) {
    if (typeof patch.kinds !== "object" || patch.kinds === null) throw new ServiceError(400, "kinds must be an object");
    for (const [kind, on] of Object.entries(patch.kinds)) {
      if (!isNotificationKind(kind) || typeof on !== "boolean") throw new ServiceError(400, `Unknown notification kind or value: ${kind}`);
      next.kinds[kind] = on;
    }
  }
  if (patch.queueThresholdMinutes !== undefined) {
    if (!(QUEUE_THRESHOLDS as readonly unknown[]).includes(patch.queueThresholdMinutes)) throw new ServiceError(400, `queueThresholdMinutes must be one of ${QUEUE_THRESHOLDS.join(", ")}`);
    next.queueThresholdMinutes = patch.queueThresholdMinutes as QueueThreshold;
  }
  if (patch.catchUpEnabled !== undefined) {
    if (typeof patch.catchUpEnabled !== "boolean") throw new ServiceError(400, "catchUpEnabled must be true or false");
    next.catchUpEnabled = patch.catchUpEnabled;
  }
  next.kinds = storedKinds(next.kinds);
  const values = {
    level: next.level,
    kindsJson: JSON.stringify(next.kinds),
    queueThresholdMinutes: next.queueThresholdMinutes,
    catchUpEnabled: next.catchUpEnabled,
    updatedAt: clockNow(),
  };
  db.insert(notificationSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: notificationSettings.userId, set: values })
    .run();
  return next;
}

/** Sets every kind off but `only`, keeping the Level as given (the Mod panel migration's Keep them). */
export function setOnlyKinds(db: Queryable, userId: string, level: NotificationLevel, only: NotificationKind[]): NotificationSettings {
  const kinds = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, only.includes(k)])) as NotificationSettings["kinds"];
  return updateSettings(db, userId, { level, kinds });
}

export function discordUnreachableSince(db: Queryable, userId: string): Date | null {
  return db.select({ at: notificationSettings.discordUnreachableSince }).from(notificationSettings).where(eq(notificationSettings.userId, userId)).get()?.at ?? null;
}

export function setDiscordUnreachable(db: Queryable, userId: string, since: Date | null): void {
  db.update(notificationSettings).set({ discordUnreachableSince: since }).where(eq(notificationSettings.userId, userId)).run();
}

/**
 * The groups of kinds a user sees on the settings page: those of roles they hold in some Bingo (Player: any Signup or
 * Team; Captain: leads a Team; Moderator: a Moderator anywhere, or a site admin; Admin or Staff: a site admin, or Staff
 * anywhere), plus site-wide.
 */
export function groupsFor(db: Queryable, user: { id: string; isAdmin: boolean }): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const hasSignup = !!db.select({ id: signups.id }).from(signups).where(eq(signups.userId, user.id)).limit(1).get();
  const onTeam = db.select({ isCaptain: teamMembers.isCaptain, isCoCaptain: teamMembers.isCoCaptain }).from(teamMembers).where(eq(teamMembers.userId, user.id)).all();
  if (hasSignup || onTeam.length > 0) groups.push("player");
  if (onTeam.some((m) => m.isCaptain || m.isCoCaptain)) groups.push("captain");
  const isMod = !!db.select({ id: bingoModerators.userId }).from(bingoModerators).where(eq(bingoModerators.userId, user.id)).limit(1).get();
  if (isMod || user.isAdmin) groups.push("moderator");
  const isStaff = !!db.select({ id: bingoStaff.userId }).from(bingoStaff).where(eq(bingoStaff.userId, user.id)).limit(1).get();
  if (isStaff || user.isAdmin) groups.push("admin");
  groups.push("site");
  return groups;
}

// ---------------------------------------------------------------------------
// Who gets a kind
// ---------------------------------------------------------------------------

/**
 * Of `userIds`, those who'd get a Notification of `kind`: Notifications on (any Level but Off) and the kind on, minus
 * `actorUserId` (never about something they did themselves), with their settings.
 */
export function optedIn(db: Queryable, userIds: Iterable<string>, kind: NotificationKind, actorUserId: string | null): Map<string, NotificationSettings> {
  const ids = [...new Set(userIds)].filter((id) => id !== actorUserId);
  const out = new Map<string, NotificationSettings>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = db.select().from(notificationSettings).where(inArray(notificationSettings.userId, ids.slice(i, i + 500))).all();
    for (const row of rows) {
      const settings = toSettings(row);
      if (settings.level !== "off" && isKindOn(kind, settings.kinds)) out.set(row.userId, settings);
    }
  }
  return out;
}

/** Everyone with Notifications on and `kind` on, for a site-wide kind (only clan members: nobody else can see a Bingo). */
export function everyoneOptedIn(db: Queryable, kind: NotificationKind, actorUserId: string | null): Map<string, NotificationSettings> {
  const rows = db
    .select({ settings: notificationSettings })
    .from(notificationSettings)
    .innerJoin(users, eq(users.id, notificationSettings.userId))
    .where(and(sql`${notificationSettings.level} != 'off'`, eq(users.inGuild, true)))
    .all();
  return optedIn(db, rows.map((r) => r.settings.userId), kind, actorUserId);
}

export function siteAdminIds(db: Queryable): string[] {
  return db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).all().map((r) => r.id);
}

/** A Bingo's Moderators: its own, and every site admin (who may moderate any Bingo). */
export function moderatorIds(db: Queryable, bingoId: string): string[] {
  const own = db.select({ id: bingoModerators.userId }).from(bingoModerators).where(eq(bingoModerators.bingoId, bingoId)).all().map((r) => r.id);
  return [...new Set([...own, ...siteAdminIds(db)])];
}

export function staffIds(db: Queryable, bingoId: string): string[] {
  return db.select({ id: bingoStaff.userId }).from(bingoStaff).where(eq(bingoStaff.bingoId, bingoId)).all().map((r) => r.id);
}

export function teamMemberIds(db: Queryable, teamId: string): string[] {
  return db.select({ id: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).all().map((r) => r.id);
}

/** Everyone on a Team of the Bingo: its Players once Teams are set. */
export function bingoPlayerIds(db: Queryable, bingoId: string): string[] {
  return db
    .select({ id: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teams.bingoId, bingoId))
    .all()
    .map((r) => r.id);
}

/** Each Team's Captain and co-captain. */
export function teamLeadIds(db: Queryable, bingoId: string, teamId?: string): string[] {
  return db
    .select({ id: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teams.bingoId, bingoId), teamId ? eq(teams.id, teamId) : undefined, sql`(${teamMembers.isCaptain} = 1 or ${teamMembers.isCoCaptain} = 1)`))
    .all()
    .map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Making and delivering
// ---------------------------------------------------------------------------

export interface NewNotification {
  userId: string;
  bingoId: string | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: NotificationData;
  /** Set by the scheduler's kinds: one thing is told once (a second with the same key is dropped). */
  dedupeKey?: string;
  at: Date;
}

export type StoredNotification = typeof notifications.$inferSelect;

/**
 * Stores each Notification whose user has Notifications and its kind on (re-checked here, so a caller can't send one to
 * someone who didn't opt in). Returns the ones stored; deliver() them once the caller's transaction has committed.
 */
export function storeNotifications(db: Queryable, items: NewNotification[]): StoredNotification[] {
  const stored: StoredNotification[] = [];
  const byKind = new Map<NotificationKind, NewNotification[]>();
  for (const item of items) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
  for (const [kind, group] of byKind) {
    const allowed = optedIn(db, group.map((g) => g.userId), kind, null);
    for (const item of group) {
      if (!allowed.has(item.userId)) continue;
      const row = db
        .insert(notifications)
        .values({
          userId: item.userId,
          bingoId: item.bingoId,
          kind: item.kind,
          title: item.title,
          body: item.body ?? null,
          link: item.link ?? null,
          dataJson: JSON.stringify(item.data ?? {}),
          dedupeKey: item.dedupeKey ?? null,
          createdAt: item.at,
        })
        .onConflictDoNothing()
        .returning()
        .get();
      if (row) stored.push(row);
    }
  }
  return stored;
}

/** What delivery hands the Discord step: one Notification for a user at + Discord whom no open tab reaches. */
export type DmHandoff = (db: Db, notification: StoredNotification, devClock: boolean) => void;
let dmHandoff: DmHandoff | null = null;
/** Set by notificationDm.ts at startup, so this module needn't import the Discord side. */
export function setDmHandoff(handoff: DmHandoff | null): void {
  dmHandoff = handoff;
}

/**
 * The delivery chain (CONTEXT.md "Notification"): every Notification is in the Inbox already; on top, the first that
 * applies: a toast on each tab in view; else, at + Browser, a browser notification on the hidden tabs whose browser
 * allowed them; else, at + Discord, a DM. Each of the user's tabs is told its Inbox changed either way. `devClock`: they
 * were made on a dev server's spoofed clock (the test data generator), which the DM queue's staleness rule leaves out.
 */
export function deliver(db: Db, stored: StoredNotification[], { devClock = !!getAuditContext()?.now }: { devClock?: boolean } = {}): void {
  const byUser = new Map<string, StoredNotification[]>();
  for (const n of stored) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  for (const [userId, list] of byUser) {
    const level = getSettings(db, userId).level;
    const ids = list.map((n) => n.id);
    const presence = userPresence(userId);
    if (presence.visible) {
      sendToUser(userId, (p) => ({ type: "notifications", ids, deliver: !p || p.visible ? "toast" : "none" }));
      continue;
    }
    if (levelAtLeast(level, "browser") && presence.hiddenWithPermission) {
      sendToUser(userId, (p) => ({ type: "notifications", ids, deliver: p && !p.visible && p.notifications === "granted" ? "browser" : "none" }));
      continue;
    }
    sendToUser(userId, () => ({ type: "notifications", ids, deliver: "none" }));
    if (level === "discord" && dmHandoff) for (const n of list) dmHandoff(db, n, devClock);
  }
}

/** storeNotifications then deliver, for a caller outside any transaction. `devClock`: see deliver. */
export function notify(db: Db, items: NewNotification[], opts: { devClock?: boolean } = {}): StoredNotification[] {
  const stored = storeNotifications(db, items);
  deliver(db, stored, opts);
  return stored;
}

// ---------------------------------------------------------------------------
// The Inbox
// ---------------------------------------------------------------------------

function toEntry(row: StoredNotification): NotificationEntry {
  return {
    id: row.id,
    bingoId: row.bingoId,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export function getInbox(db: Queryable, userId: string): { notifications: NotificationEntry[]; unread: number } {
  const rows = db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt), desc(sql`rowid`)).limit(INBOX_PAGE).all();
  const unread = db.select({ n: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))).get()?.n ?? 0;
  return { notifications: rows.map(toEntry), unread };
}

/** Opening the Inbox marks everything in it read. */
export function markAllRead(db: Queryable, userId: string): number {
  return db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))).run().changes;
}

export function getNotificationsByIds(db: Queryable, userId: string, ids: string[]): NotificationEntry[] {
  if (ids.length === 0) return [];
  return db.select().from(notifications).where(and(eq(notifications.userId, userId), inArray(notifications.id, ids))).all().map(toEntry);
}

/** Drops Inbox entries past INBOX_DAYS. */
export function pruneInbox(db: Queryable, now: Date): number {
  return db.delete(notifications).where(lt(notifications.createdAt, new Date(now.getTime() - INBOX_DAYS * 86_400_000))).run().changes;
}

/** A Bingo's Notifications, when it's deleted (bingoService.deleteBingo). */
export function deleteForBingo(db: Queryable, bingoId: string): void {
  db.delete(notifications).where(eq(notifications.bingoId, bingoId)).run();
  db.delete(schema.notificationDmQueue).where(eq(schema.notificationDmQueue.bingoId, bingoId)).run();
  db.delete(schema.notificationOffers).where(eq(schema.notificationOffers.bingoId, bingoId)).run();
  db.delete(schema.bingoPresence).where(eq(schema.bingoPresence.bingoId, bingoId)).run();
}
