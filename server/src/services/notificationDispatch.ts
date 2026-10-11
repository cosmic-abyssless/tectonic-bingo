// Turns what happened into Notifications (CONTEXT.md "Notification"). Almost everything a kind is about is already
// written to the audit log by the write that did it, so the dispatcher reads the log: every entry past its cursor is
// mapped to zero or more Notifications, per recipient, and the cursor moves on. It runs as each mutating request
// finishes (audit/middleware.ts) and on the scheduler's round (for entries no request made: a Bingo going Live by itself).
//
// Adding a kind: its catalogue entry (shared/notifications.ts) and a case below.
//
// The rules every case keeps: a Notification only says what its recipient could already see in the app (Team kinds go
// to that Team only; nothing is said of a Tile before the Board is Live), never tells someone what they did themselves
// (the entry's actor is left out), a Finished Bingo sends only "went Finished", and a Historical one nothing.
import { and, asc, eq, gt, inArray, max, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { NOTIFICATION_CATALOGUE, STAGE_LABEL, describeClaims, type AuditAction, type AuditDetailsMap, type NotificationKind } from "@bingo/shared";
import * as schema from "../db/schema";
import { auditLog, bingoLines, bingos, nodeEdges, notificationCursor, signupPairings, submissions, teams, tiles, users } from "../db/schema";
import { log } from "../log";
import { rsnsInBingo } from "./playerNames";
import { lineLabel } from "./scoringService";
import { getDraftState } from "./draftService";
import { getCutReviewPreview } from "./cutReviewService";
import { getAllSubmissionsForBingo } from "./submissionService";
import {
  bingoPlayerIds,
  deliver,
  everyoneOptedIn,
  inboxChanged,
  markReviewedRead,
  moderatorIds,
  optedIn,
  siteAdminIds,
  staffIds,
  storeNotifications,
  teamLeadIds,
  teamMemberIds,
  type NewNotification,
  type StoredNotification,
} from "./notificationService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;
type Entry = typeof auditLog.$inferSelect;
type Bingo = typeof bingos.$inferSelect;

const CURSOR_KEY = "audit";
/** How many entries one pass reads at most: a burst (a test data run) is worked through over several. */
const BATCH = 500;

/**
 * Reads every audit entry past the cursor, stores the Notifications they make and moves the cursor past them, in one
 * transaction (two servers during a deploy can't both send the same one), then delivers what was stored. The first run
 * on a database only places the cursor at the log's end. Returns how many Notifications were made.
 */
export function drainAuditLog(db: Db, { devClock = false }: { devClock?: boolean } = {}): number {
  let made = 0;
  for (;;) {
    const { stored, seenBy, more } = db.transaction((tx) => {
      const cursor = tx.select().from(notificationCursor).where(eq(notificationCursor.key, CURSOR_KEY)).get();
      if (!cursor) {
        const last = tx.select({ id: max(auditLog.id) }).from(auditLog).get()?.id ?? 0;
        tx.insert(notificationCursor).values({ key: CURSOR_KEY, lastAuditId: last }).run();
        return { stored: [] as StoredNotification[], seenBy: [] as string[], more: false };
      }
      const entries = tx.select().from(auditLog).where(gt(auditLog.id, cursor.lastAuditId)).orderBy(asc(auditLog.id)).limit(BATCH).all();
      if (entries.length === 0) return { stored: [] as StoredNotification[], seenBy: [] as string[], more: false };
      const items: NewNotification[] = [];
      const bingoCache = new Map<string, Bingo | null>();
      for (const entry of entries) {
        try {
          items.push(...notificationsFor(tx, entry, bingoCache));
        } catch (err) {
          // One entry that can't be mapped must never hold up every one after it.
          log.warn("notification mapping failed", { err, auditId: entry.id, action: entry.action });
        }
      }
      const stored = storeNotifications(tx, items);
      // A reviewed Submission is no longer waiting: every Moderator's Notification of it is read (after storing, so
      // one made and reviewed within this batch is too).
      const reviewed = entries.filter((e) => (e.action === "submission.approved" || e.action === "submission.rejected") && e.entityId).map((e) => e.entityId!);
      const seenBy = markReviewedRead(tx, reviewed);
      tx.update(notificationCursor).set({ lastAuditId: entries[entries.length - 1]!.id }).where(eq(notificationCursor.key, CURSOR_KEY)).run();
      return { stored, seenBy, more: entries.length === BATCH };
    });
    deliver(db, stored, { devClock });
    inboxChanged(seenBy);
    made += stored.length;
    if (!more) return made;
  }
}

/** Places the cursor at the end of the log, if it isn't placed yet (at startup, before anything can be written). */
export function initAuditCursor(db: Db): void {
  drainAuditLog(db);
}

// ---------------------------------------------------------------------------
// Mapping one entry
// ---------------------------------------------------------------------------

function details<A extends AuditAction>(entry: Entry, _action: A): AuditDetailsMap[A] {
  return JSON.parse(entry.details) as AuditDetailsMap[A];
}

const boardLink = (bingo: Bingo, tileId?: string | null) => `/b/${bingo.slug}${tileId ? `?tile=${tileId}` : ""}`;

/** One Notification of `kind` to each of `userIds` who opted in, the entry's actor left out. */
function toEach(db: Queryable, entry: Entry, kind: NotificationKind, userIds: Iterable<string>, make: (userId: string) => Omit<NewNotification, "userId" | "kind" | "at">): NewNotification[] {
  return [...optedIn(db, userIds, kind, entry.actorUserId).keys()].map((userId) => ({ ...make(userId), userId, kind, at: entry.createdAt }));
}

function anyoneOptedIn(db: Queryable, entry: Entry, kind: NotificationKind, userIds: Iterable<string>): boolean {
  return optedIn(db, userIds, kind, entry.actorUserId).size > 0;
}

function playerName(db: Queryable, bingoId: string, userId: string): string {
  return rsnsInBingo(db, bingoId, [userId]).get(userId) ?? db.select({ name: sql<string>`coalesce(${users.discordGlobalName}, ${users.discordUsername})` }).from(users).where(eq(users.id, userId)).get()?.name ?? "Someone";
}

function teamName(db: Queryable, teamId: string | null): string | null {
  return teamId ? (db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId)).get()?.name ?? null) : null;
}

export function notificationsFor(db: Queryable, entry: Entry, bingoCache = new Map<string, Bingo | null>()): NewNotification[] {
  const action = entry.action as AuditAction;

  // Site-level entries.
  if (action === "bug_report.created") {
    const d = details(entry, "bug_report.created");
    return toEach(db, entry, "bug_report_filed", siteAdminIds(db), () => ({
      bingoId: null,
      title: "Bug report filed",
      body: d.description.length > 140 ? `${d.description.slice(0, 137)}...` : d.description,
      link: "/admin?tab=bugs",
    }));
  }
  if (!entry.bingoId) return [];

  let bingo = bingoCache.get(entry.bingoId);
  if (bingo === undefined) {
    bingo = db.select().from(bingos).where(eq(bingos.id, entry.bingoId)).get() ?? null;
    bingoCache.set(entry.bingoId, bingo);
  }
  if (!bingo || bingo.historical) return [];
  // A Finished Bingo sends only that it went Finished.
  if (bingo.stage === "complete" && !(action === "stage.changed" && details(entry, "stage.changed").to === "complete")) return [];

  switch (action) {
    case "submission.created":
      return submissionCreated(db, entry, bingo);
    case "submission.approved":
      return submissionApproved(db, entry, bingo);
    case "submission.rejected": {
      const d = details(entry, "submission.rejected");
      const what = d.kind === "proof" ? "Proof screenshot" : "drop";
      return toEach(db, entry, "drop_rejected", [d.submittedByUserId], () => ({
        bingoId: bingo.id,
        title: `Your ${what}${d.tileName ? ` on "${d.tileName}"` : ""} was rejected`,
        body: d.reviewerNotes ? `"${d.reviewerNotes}"` : "No note was left.",
        link: boardLink(bingo),
        data: { submissionId: entry.entityId ?? undefined },
      }));
    }
    case "pairing.requested": {
      const d = details(entry, "pairing.requested");
      const target = db.select({ id: users.id }).from(users).where(eq(users.discordId, d.targetDiscordId)).get();
      if (!target) return [];
      return toEach(db, entry, "pairing_request", [target.id], () => ({
        bingoId: bingo.id,
        title: "Pairing request",
        body: `${playerName(db, bingo.id, d.requesterUserId)} asked to be your Duo in ${bingo.name}.`,
        link: boardLink(bingo),
        data: { ref: entry.entityId ?? undefined },
      }));
    }
    case "pairing.accepted":
    case "pairing.declined": {
      const d = details(entry, action) as AuditDetailsMap["pairing.declined"];
      const answer = action === "pairing.accepted" ? "accepted" : "declined";
      const by = entry.actorUserId ? playerName(db, bingo.id, entry.actorUserId) : "Your partner";
      return toEach(db, entry, "pairing_request", [d.requesterUserId], () => ({
        bingoId: bingo.id,
        title: `Duo request ${answer}`,
        body: `${by} ${answer} your Duo request in ${bingo.name}.`,
        link: boardLink(bingo),
      }));
    }
    case "draft.started":
      return [...toEach(db, entry, "draft_starting", teamLeadIds(db, bingo.id), () => ({ bingoId: bingo.id, title: "The Draft has started", body: bingo.name, link: `/b/${bingo.slug}/draft` })), ...onTheClock(db, entry, bingo)];
    case "draft.pick": {
      const d = details(entry, "draft.pick");
      const team = teamName(db, entry.teamId);
      return [
        ...toEach(db, entry, "drafted", d.userIds, () => ({ bingoId: bingo.id, title: "You were drafted", body: `${team ?? "A Team"} picked you in ${bingo.name}.`, link: `/b/${bingo.slug}/draft` })),
        ...onTheClock(db, entry, bingo),
      ];
    }
    case "draft.order_set":
    case "draft.order_shuffled":
    case "draft.pick_undone":
      return onTheClock(db, entry, bingo);
    case "stage.changed":
      return stageChanged(db, entry, bingo);
    case "signup.created": {
      if (details(entry, "signup.created").reactivated) return [];
      const name = entry.entityLabel ?? "Someone";
      return toEach(db, entry, "new_signups", moderatorIds(db, bingo.id), () => ({
        bingoId: bingo.id,
        title: "New signup",
        body: `${name} signed up for ${bingo.name}.`,
        link: `/b/${bingo.slug}/mod?tab=signups`,
        data: { name },
      }));
    }
    case "signup.buyin_marked": {
      const d = details(entry, "signup.buyin_marked");
      const by = entry.actorUserId ? playerName(db, bingo.id, entry.actorUserId) : "Someone";
      return toEach(db, entry, "buyin_marked", [...staffIds(db, bingo.id), ...siteAdminIds(db)], () => ({
        bingoId: bingo.id,
        title: d.received ? "Buy-in marked received" : "Buy-in marked not received",
        body: `${by} marked ${entry.entityLabel ?? "a signup"}'s Buy-in${d.collectedByName ? `, collected by ${d.collectedByName}` : ""}.`,
        link: `/b/${bingo.slug}/buyins`,
      }));
    }
    default:
      return [];
  }
}

function submissionCreated(db: Queryable, entry: Entry, bingo: Bingo): NewNotification[] {
  const d = details(entry, "submission.created");
  const team = teamName(db, entry.teamId);
  const out = toEach(db, entry, "submissions_waiting", moderatorIds(db, bingo.id), () => ({
    bingoId: bingo.id,
    title: "Submission waiting",
    body: `${team ? `${team}: ` : ""}${d.kind === "proof" ? "a Proof screenshot" : describeClaims(d)} on "${d.tileName}"`,
    link: `/b/${bingo.slug}/mod?tab=submissions`,
    data: { since: entry.createdAt.toISOString(), submissionId: entry.entityId ?? undefined },
  }));
  // A drop flagged for a missing Proof screenshot tells the Player it's credited to (unless they posted it themselves).
  if (d.kind !== "proof" && entry.entityId) {
    const submission = db.select({ userId: submissions.submittedByUserId }).from(submissions).where(eq(submissions.id, entry.entityId)).get();
    if (submission && tileNeedsProof(db, d.tileId) && anyoneOptedIn(db, entry, "proof_needed", [submission.userId])) {
      const row = getAllSubmissionsForBingo(db as Db, bingo.id, "pending").find((s) => s.submission.id === entry.entityId);
      const missing = row?.proofChecks.filter((c) => c.flag === "missing") ?? [];
      if (missing.length > 0) {
        out.push(
          ...toEach(db, entry, "proof_needed", [submission.userId], () => ({
            bingoId: bingo.id,
            title: "Proof screenshot needed",
            body: `Your drop on "${d.tileName}" has no approved Proof screenshot${missing[0]!.requirement.note ? ` (${missing[0]!.requirement.note})` : ""}. Post one so it counts.`,
            link: boardLink(bingo, d.tileId),
          })),
        );
      }
    }
  }
  return out;
}

/** Whether a Tile, or any of its Tasks, needs a Proof screenshot: the cheap check before working out a drop's flags. */
function tileNeedsProof(db: Queryable, tileId: string): boolean {
  const tile = db.select({ requiresProof: tiles.requiresProof, nodeId: tiles.nodeId }).from(tiles).where(eq(tiles.id, tileId)).get();
  if (!tile) return false;
  if (tile.requiresProof) return true;
  return !!db
    .select({ id: nodeEdges.childId })
    .from(nodeEdges)
    .innerJoin(schema.nodes, eq(schema.nodes.id, nodeEdges.childId))
    .where(and(eq(nodeEdges.parentId, tile.nodeId), eq(schema.nodes.requiresProof, true)))
    .limit(1)
    .get();
}

function submissionApproved(db: Queryable, entry: Entry, bingo: Bingo): NewNotification[] {
  const d = details(entry, "submission.approved");
  // A Team's progress is news only while it's Live: before then the Board may be sealed, and nobody plays.
  if (!entry.teamId || bingo.stage !== "live") return [];
  const members = teamMemberIds(db, entry.teamId);
  const out: NewNotification[] = [];
  if (d.kind !== "proof") {
    const name = playerName(db, bingo.id, d.submittedByUserId);
    out.push(
      ...toEach(db, entry, "team_drop_approved", members, (userId) => ({
        bingoId: bingo.id,
        title: userId === d.submittedByUserId ? "Your drop was approved" : `${name}'s drop was approved`,
        body: `${d.tileName ? `"${d.tileName}"` : "A drop"}${d.taskLabels.length ? ` (${d.taskLabels.join(", ")})` : ""}${d.pointsDelta ? `, +${d.pointsDelta} points` : ""}`,
        link: boardLink(bingo),
        data: { name, points: d.pointsDelta, submissionId: entry.entityId ?? undefined },
      })),
    );
  }
  const done = d.newlyCompletedNodeIds;
  if (done.length === 0) return out;
  const completedTiles = db.select({ id: tiles.id, name: tiles.name, nodeId: tiles.nodeId }).from(tiles).where(and(eq(tiles.bingoId, bingo.id), inArray(tiles.nodeId, done))).all();
  const closedLines = db.select().from(bingoLines).where(and(eq(bingoLines.bingoId, bingo.id), inArray(bingoLines.nodeId, done))).all();
  for (const tile of completedTiles) {
    const lines = closedLines.map(lineLabel);
    out.push(
      ...toEach(db, entry, "team_tile_completed", members, () => ({
        bingoId: bingo.id,
        title: `Your Team completed "${tile.name}"`,
        body: lines.length ? `And closed ${lines.join(", ")}.` : null,
        link: boardLink(bingo, tile.id),
        data: { name: tile.name },
      })),
    );
  }
  // Parts: the immediate children of a Tile's root node (CONTEXT.md "Part").
  const partRows = db
    .select({ partId: nodeEdges.childId, partLabel: schema.nodes.label, tileId: tiles.id, tileName: tiles.name })
    .from(nodeEdges)
    .innerJoin(tiles, eq(tiles.nodeId, nodeEdges.parentId))
    .innerJoin(schema.nodes, eq(schema.nodes.id, nodeEdges.childId))
    .where(and(eq(tiles.bingoId, bingo.id), inArray(nodeEdges.childId, done)))
    .all();
  for (const part of partRows) {
    out.push(
      ...toEach(db, entry, "team_part_completed", members, () => ({
        bingoId: bingo.id,
        title: `Your Team completed ${part.partLabel ? `"${part.partLabel}"` : "a Part"} of "${part.tileName}"`,
        body: null,
        link: boardLink(bingo, part.tileId),
        data: { name: part.partLabel ?? part.tileName },
      })),
    );
  }
  return out;
}

/** The leads of whichever Team is on the clock after this entry, if the Draft is running. */
function onTheClock(db: Queryable, entry: Entry, bingo: Bingo): NewNotification[] {
  if (bingo.stage !== "draft") return [];
  const leads = teamLeadIds(db, bingo.id);
  if (!anyoneOptedIn(db, entry, "on_the_clock", leads)) return [];
  const state = getDraftState(db as Db, bingo, { includeAnswers: false });
  if (!state.draftStarted || !state.currentPick || state.pool.filter((u) => !u.cut).length === 0) return [];
  const { teamId, pickNumber } = state.currentPick;
  return toEach(db, entry, "on_the_clock", teamLeadIds(db, bingo.id, teamId), () => ({
    bingoId: bingo.id,
    title: "You're on the clock",
    body: `Your Team has pick ${pickNumber} in ${bingo.name}.`,
    link: `/b/${bingo.slug}/draft`,
    data: { ref: `${teamId}:${pickNumber}` },
    dedupeKey: `on_the_clock:${bingo.id}:${pickNumber}`,
  }));
}

function stageChanged(db: Queryable, entry: Entry, bingo: Bingo): NewNotification[] {
  const d = details(entry, "stage.changed");
  const out: NewNotification[] = [];
  if (d.to === "live" || d.to === "complete") {
    out.push(
      ...toEach(db, entry, "bingo_stage", bingoPlayerIds(db, bingo.id), () => ({
        bingoId: bingo.id,
        title: d.to === "live" ? `${bingo.name} is Live` : `${bingo.name} has Finished`,
        body: d.to === "live" ? "Drops count from now. Good luck!" : "See how it ended.",
        link: boardLink(bingo),
      })),
    );
  }
  if (d.to === "live" && d.automatic) {
    out.push(...toEach(db, entry, "went_live_by_itself", siteAdminIds(db), () => ({ bingoId: bingo.id, title: `${bingo.name} went Live by itself`, body: "It reached its start date.", link: boardLink(bingo) })));
  }
  if (d.to === "signup") {
    out.push(
      ...[...everyoneOptedIn(db, "bingo_open", entry.actorUserId).keys()].map((userId) => ({
        userId,
        kind: "bingo_open" as const,
        at: entry.createdAt,
        bingoId: bingo.id,
        title: `${bingo.name} is open for signups`,
        body: STAGE_LABEL.signup,
        link: boardLink(bingo),
      })),
    );
  }
  if (d.to === "captains" && anyoneOptedIn(db, entry, "cut_warning", siteAdminIds(db))) {
    const { unavoidableCount } = getCutReviewPreview(db as Db, bingo);
    if (unavoidableCount > 0) {
      out.push(
        ...toEach(db, entry, "cut_warning", siteAdminIds(db), () => ({
          bingoId: bingo.id,
          title: `Signups closed with ${unavoidableCount} Unavoidable cut${unavoidableCount === 1 ? "" : "s"}`,
          body: bingo.name,
          link: `/b/${bingo.slug}/mod?tab=signups`,
        })),
      );
    }
  }
  return out;
}

/** Whether a pending Discord DM is still worth sending (notificationDm.ts): a Pairing request still pending, a Team still on the clock. */
export function stillTrue(db: Queryable, kind: NotificationKind, bingoId: string | null, ref: string | undefined): boolean {
  if (!ref || !bingoId) return true;
  if (kind === "pairing_request") {
    return db.select({ status: signupPairings.status }).from(signupPairings).where(eq(signupPairings.id, ref)).get()?.status === "pending";
  }
  if (kind === "on_the_clock") {
    const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
    if (!bingo || bingo.stage !== "draft") return false;
    const pick = getDraftState(db as Db, bingo, { includeAnswers: false }).currentPick;
    return !!pick && `${pick.teamId}:${pick.pickNumber}` === ref;
  }
  return true;
}

/** Every kind the dispatcher can make (the rest come from the scheduler): for the catalogue test. */
export const DISPATCHED_KINDS = Object.keys(NOTIFICATION_CATALOGUE).filter((k) => k !== "queue_waiting_long" && k !== "superlative_reminder") as NotificationKind[];
