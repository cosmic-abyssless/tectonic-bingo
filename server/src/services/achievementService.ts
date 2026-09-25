// Player Achievements (CONTEXT.md "Achievement"): a just-for-fun layer on top of a Bingo. This module is the one
// seam — existing services notify it after their own transaction has committed (see submissionService.ts,
// teamService.ts, gpValueService.ts), and it is the only place that reads or writes achievement_activity /
// achievement_earned / bingo_achievement_settings. Every exported `record*` function catches and swallows its own
// errors (reported to Sentry): a Submission, Reaction or interest mark must never fail because Achievements did.
//
// Rules are private to this file, keyed by AchievementKey — the catalogue (shared/src/achievements.ts) never ships
// a Hidden Achievement's condition to the client.
import { and, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as Sentry from "@sentry/node";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_KEYS,
  achievementDef,
  type AchievementCount,
  type AchievementKey,
  type MyAchievement,
  type MyAchievementsResponse,
} from "@bingo/shared";
import * as schema from "../db/schema";
import { achievementActivity, achievementEarned, bingoAchievementSettings, bingos, nodeEdges, submissionReactions, submissions, teamMembers, teams, tileInterests, tiles, womSnapshots } from "../db/schema";
import { now as clockNow } from "../clock";
import { getTimezone } from "../audit/context";
import { localTimeOf } from "../localTime";
import { audit } from "../audit/record";
import { broadcast } from "../ws";
import { findAncestorIds } from "./graphService";
import { effectiveStartsAt, endedAt } from "./bingoStart";
import { log } from "../log";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;
export type Bingo = typeof bingos.$inferSelect;

type ActivityKind = "posted" | "reacted" | "interest_marked" | "tile_opened" | "rules_opened" | "stats_opened";
type SettingsMap = Map<AchievementKey, { enabled: boolean; firstSwitchedOnAt: Date }>;

function safely(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    Sentry.captureException(err);
    log.warn("achievement hook failed", { err });
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Every setting row for this bingo, keyed by key — used both for write-time eligibility and the read-time switched-on set. */
function loadSettings(db: Queryable, bingoId: string): SettingsMap {
  const rows = db.select().from(bingoAchievementSettings).where(eq(bingoAchievementSettings.bingoId, bingoId)).all();
  return new Map(rows.map((r) => [r.achievementKey as AchievementKey, { enabled: r.enabled, firstSwitchedOnAt: r.firstSwitchedOnAt }]));
}

function isTeamMember(db: Queryable, teamId: string, userId: string): boolean {
  return !!db.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).get();
}

function isLive(db: Queryable, bingoId: string): boolean {
  const row = db.select({ stage: bingos.stage }).from(bingos).where(eq(bingos.id, bingoId)).get();
  return row?.stage === "live";
}

function upsertActivity(
  tx: Tx,
  row: {
    bingoId: string;
    userId: string;
    kind: ActivityKind;
    subjectId: string;
    tileId: string | null;
    creditedUserId: string | null;
    teamId: string;
    localDate: string;
    localHour: number;
    occurredAt: Date;
  },
): void {
  tx.insert(achievementActivity)
    .values(row)
    .onConflictDoUpdate({
      target: [achievementActivity.bingoId, achievementActivity.userId, achievementActivity.kind, achievementActivity.subjectId],
      set: { occurredAt: row.occurredAt, tileId: row.tileId, creditedUserId: row.creditedUserId, teamId: row.teamId, localDate: row.localDate, localHour: row.localHour },
    })
    .run();
}

/**
 * Evaluates one Achievement for one player and earns it if due: skipped outright when it has never been switched on
 * for this bingo (no settings row) or `activityAt` predates that; otherwise inserted (idempotent — a caller that has
 * already earned it is a no-op), audited (actor = the player) and broadcast. `activityAt` gates the switched-on
 * cutoff; the earned/audit timestamp is always "now" (the moment the condition was found true), which can be later
 * than `activityAt` for the first-pricing path.
 */
function tryEarn(tx: Tx, bingoId: string, userId: string, key: AchievementKey, activityAt: Date, settings: SettingsMap, satisfied: () => boolean): void {
  const setting = settings.get(key);
  if (!setting) return; // never switched on in this bingo — never earned
  if (activityAt < setting.firstSwitchedOnAt) return;
  const already = tx
    .select({ id: achievementEarned.id })
    .from(achievementEarned)
    .where(and(eq(achievementEarned.bingoId, bingoId), eq(achievementEarned.userId, userId), eq(achievementEarned.achievementKey, key)))
    .get();
  if (already) return;
  if (!satisfied()) return;

  const earnedAt = clockNow();
  tx.insert(achievementEarned).values({ bingoId, userId, achievementKey: key, earnedAt }).run();
  const def = achievementDef(key);
  audit(tx, {
    action: "achievement.earned",
    bingoId,
    entity: { type: "achievement", id: key, label: def.name },
    details: { key, name: def.name },
    actor: { userId },
    now: earnedAt,
  });
  broadcast({ type: "achievements_changed", bingoId, payload: { userId } });
}

function distinct(rows: (string | null)[]): Set<string> {
  return new Set(rows.filter((v): v is string => v !== null));
}

// ---------------------------------------------------------------------------
// Recorders — called by existing services after their own transaction commits.
// ---------------------------------------------------------------------------

export interface SubmissionPostedEvent {
  bingoId: string;
  submissionId: string;
  /** Who did it through the app — the actor. */
  posterUserId: string;
  /** Who the drop belongs to. */
  creditedUserId: string;
  teamId: string;
  tileId: string;
  tileNodeId: string;
  /** The requirement leaves (ITEM/MANUAL node ids) this submission claimed — for Called it. */
  claimedLeafIds: string[];
  occurredAt: Date;
}

/** A Submission was posted (Strong start, Partner slayer, Night owl, Early bird, Regular, Globetrotter, Called it). */
export function recordSubmissionPosted(db: Db, event: SubmissionPostedEvent): void {
  safely(() => {
    db.transaction((tx) => {
      if (!isLive(tx, event.bingoId) || !isTeamMember(tx, event.teamId, event.posterUserId)) return;
      const settings = loadSettings(tx, event.bingoId);
      const { date, hour } = localTimeOf(event.occurredAt, getTimezone());

      upsertActivity(tx, {
        bingoId: event.bingoId,
        userId: event.posterUserId,
        kind: "posted",
        subjectId: event.submissionId,
        tileId: event.tileId,
        creditedUserId: event.creditedUserId,
        teamId: event.teamId,
        localDate: date,
        localHour: hour,
        occurredAt: event.occurredAt,
      });

      tryEarn(tx, event.bingoId, event.posterUserId, "strong_start", event.occurredAt, settings, () => true);

      if (event.creditedUserId !== event.posterUserId) {
        tryEarn(tx, event.bingoId, event.posterUserId, "partner_slayer", event.occurredAt, settings, () => true);
      }

      // Night owl 02:00-05:59, Early bird 06:00-08:59, device-local (see the catalogue's descriptions).
      if (hour >= 2 && hour <= 5) tryEarn(tx, event.bingoId, event.posterUserId, "night_owl", event.occurredAt, settings, () => true);
      else if (hour >= 6 && hour <= 8) tryEarn(tx, event.bingoId, event.posterUserId, "early_bird", event.occurredAt, settings, () => true);

      tryEarn(tx, event.bingoId, event.posterUserId, "regular", event.occurredAt, settings, () => {
        const cutoff = settings.get("regular")!.firstSwitchedOnAt;
        const dates = distinct(
          tx
            .select({ localDate: achievementActivity.localDate })
            .from(achievementActivity)
            .where(and(eq(achievementActivity.bingoId, event.bingoId), eq(achievementActivity.userId, event.posterUserId), eq(achievementActivity.kind, "posted"), gte(achievementActivity.occurredAt, cutoff)))
            .all()
            .map((r) => r.localDate),
        );
        return dates.size >= 5;
      });

      tryEarn(tx, event.bingoId, event.posterUserId, "globetrotter", event.occurredAt, settings, () => {
        const cutoff = settings.get("globetrotter")!.firstSwitchedOnAt;
        const tileIds = distinct(
          tx
            .select({ tileId: achievementActivity.tileId })
            .from(achievementActivity)
            .where(and(eq(achievementActivity.bingoId, event.bingoId), eq(achievementActivity.userId, event.posterUserId), eq(achievementActivity.kind, "posted"), gte(achievementActivity.occurredAt, cutoff)))
            .all()
            .map((r) => r.tileId),
        );
        return tileIds.size >= 5;
      });

      tryEarn(tx, event.bingoId, event.posterUserId, "called_it", event.occurredAt, settings, () => {
        if (event.claimedLeafIds.length === 0) return false;
        const partIds = partsContaining(tx, event.tileNodeId, event.claimedLeafIds);
        if (partIds.size === 0) return false;
        return !!tx
          .select({ id: tileInterests.id })
          .from(tileInterests)
          .where(and(eq(tileInterests.userId, event.posterUserId), inArray(tileInterests.taskId, [...partIds])))
          .get();
      });
    });
  });
}

/** The Part (task) ids containing any of `leafIds`, under one tile's root node — a bare leaf that is itself a direct child of the root is its own Part (CONTEXT.md "Part"). */
function partsContaining(tx: Tx, tileNodeId: string, leafIds: string[]): Set<string> {
  const parts = new Set(tx.select({ childId: nodeEdges.childId }).from(nodeEdges).where(eq(nodeEdges.parentId, tileNodeId)).all().map((r) => r.childId));
  const result = new Set<string>();
  for (const leafId of leafIds) {
    if (parts.has(leafId)) {
      result.add(leafId);
      continue;
    }
    for (const ancestorId of findAncestorIds(tx, leafId)) {
      if (parts.has(ancestorId)) result.add(ancestorId);
    }
  }
  return result;
}

/**
 * A Submission's claims were (fully or partially) priced — at creation, or by the GP value fill running later
 * (gpValueService.fillMissingGpValuesAndNotify). Evaluated against the CURRENT sum of the submission's known claim
 * GP values each time, so whichever call finds the total already over the threshold earns it; a re-price
 * (gpRepriceService) never calls this. Eligibility's "Live" check is skipped: createSubmission only ever creates a
 * submission while the bingo is live, so any submission that exists proves it.
 */
export function recordSubmissionsFirstPriced(db: Db, submissionIds: string[]): void {
  for (const submissionId of submissionIds) {
    safely(() => {
      db.transaction((tx) => {
        const submission = tx
          .select({ teamId: submissions.teamId, submittedByUserId: submissions.submittedByUserId, postedByUserId: submissions.postedByUserId, createdAt: submissions.createdAt })
          .from(submissions)
          .where(eq(submissions.id, submissionId))
          .get();
        if (!submission) return;
        const team = tx.select({ bingoId: teams.bingoId }).from(teams).where(eq(teams.id, submission.teamId)).get();
        if (!team) return;
        const posterUserId = submission.postedByUserId ?? submission.submittedByUserId;
        if (!isTeamMember(tx, submission.teamId, posterUserId)) return;
        const settings = loadSettings(tx, team.bingoId);

        tryEarn(tx, team.bingoId, posterUserId, "big_spender", submission.createdAt, settings, () => {
          const claimRows = tx.select({ gpValue: schema.claims.gpValue }).from(schema.claims).where(eq(schema.claims.submissionId, submissionId)).all();
          const total = claimRows.reduce((sum, c) => sum + (c.gpValue ?? 0), 0);
          return total >= 25_000_000;
        });
      });
    });
  }
}

export interface ReactionAddedEvent {
  bingoId: string;
  submissionId: string;
  reactorUserId: string;
  /** Who the submission is credited to. */
  creditedUserId: string;
  teamId: string;
  occurredAt: Date;
}

/** A Reaction was ADDED (not removed, not a no-op toggle): Hypeman, Cheerleader, Superfan, Main character — and Popular, for the Player it was credited to. */
export function recordReactionAdded(db: Db, event: ReactionAddedEvent): void {
  safely(() => {
    db.transaction((tx) => {
      if (!isLive(tx, event.bingoId) || !isTeamMember(tx, event.teamId, event.reactorUserId)) return;
      const settings = loadSettings(tx, event.bingoId);
      const { date, hour } = localTimeOf(event.occurredAt, getTimezone());

      upsertActivity(tx, {
        bingoId: event.bingoId,
        userId: event.reactorUserId,
        kind: "reacted",
        subjectId: event.submissionId,
        tileId: null,
        creditedUserId: event.creditedUserId,
        teamId: event.teamId,
        localDate: date,
        localHour: hour,
        occurredAt: event.occurredAt,
      });

      // Popular is the credited Player's, not the reactor's: the one Achievement earned by what teammates do. 5 Reactions
      // on the Submission from anyone but them (any emoji, one Player's several emojis each count: a team may not have 5
      // other members), made since it was switched on.
      if (event.creditedUserId !== event.reactorUserId && isTeamMember(tx, event.teamId, event.creditedUserId)) {
        tryEarn(tx, event.bingoId, event.creditedUserId, "popular", event.occurredAt, settings, () => {
          const cutoff = settings.get("popular")!.firstSwitchedOnAt;
          const received = tx
            .select({ id: submissionReactions.id })
            .from(submissionReactions)
            .where(and(eq(submissionReactions.submissionId, event.submissionId), ne(submissionReactions.userId, event.creditedUserId), gte(submissionReactions.createdAt, cutoff)))
            .all().length;
          return received >= 5;
        });
      }

      if (event.creditedUserId === event.reactorUserId) {
        tryEarn(tx, event.bingoId, event.reactorUserId, "main_character", event.occurredAt, settings, () => true);
        return; // Hypeman/Cheerleader/Superfan all require "credited to someone else"
      }

      tryEarn(tx, event.bingoId, event.reactorUserId, "hypeman", event.occurredAt, settings, () => true);

      tryEarn(tx, event.bingoId, event.reactorUserId, "cheerleader", event.occurredAt, settings, () => {
        const cutoff = settings.get("cheerleader")!.firstSwitchedOnAt;
        const submissionIds = distinct(
          tx
            .select({ subjectId: achievementActivity.subjectId })
            .from(achievementActivity)
            .where(
              and(
                eq(achievementActivity.bingoId, event.bingoId),
                eq(achievementActivity.userId, event.reactorUserId),
                eq(achievementActivity.kind, "reacted"),
                ne(achievementActivity.creditedUserId, event.reactorUserId),
                gte(achievementActivity.occurredAt, cutoff),
              ),
            )
            .all()
            .map((r) => r.subjectId),
        );
        return submissionIds.size >= 10;
      });

      tryEarn(tx, event.bingoId, event.reactorUserId, "superfan", event.occurredAt, settings, () => {
        const cutoff = settings.get("superfan")!.firstSwitchedOnAt;
        const teammates = tx
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, event.teamId))
          .all()
          .map((r) => r.userId)
          .filter((id) => id !== event.reactorUserId);
        if (teammates.length === 0) return true; // vacuously achievable — no other team member to react to
        const reactedToCredited = distinct(
          tx
            .select({ creditedUserId: achievementActivity.creditedUserId })
            .from(achievementActivity)
            .where(and(eq(achievementActivity.bingoId, event.bingoId), eq(achievementActivity.userId, event.reactorUserId), eq(achievementActivity.kind, "reacted"), gte(achievementActivity.occurredAt, cutoff)))
            .all()
            .map((r) => r.creditedUserId),
        );
        return teammates.every((id) => reactedToCredited.has(id));
      });
    });
  });
}

export interface InterestMarkedEvent {
  bingoId: string;
  userId: string;
  teamId: string;
  tileId: string;
  partId: string;
  occurredAt: Date;
}

/** Interest was marked ON (not off, not a no-op toggle): Eager beaver. */
export function recordInterestMarked(db: Db, event: InterestMarkedEvent): void {
  safely(() => {
    db.transaction((tx) => {
      if (!isLive(tx, event.bingoId) || !isTeamMember(tx, event.teamId, event.userId)) return;
      const settings = loadSettings(tx, event.bingoId);
      const { date, hour } = localTimeOf(event.occurredAt, getTimezone());

      upsertActivity(tx, {
        bingoId: event.bingoId,
        userId: event.userId,
        kind: "interest_marked",
        subjectId: event.partId,
        tileId: event.tileId,
        creditedUserId: null,
        teamId: event.teamId,
        localDate: date,
        localHour: hour,
        occurredAt: event.occurredAt,
      });

      tryEarn(tx, event.bingoId, event.userId, "eager_beaver", event.occurredAt, settings, () => true);
    });
  });
}

export interface PageOpenedEvent {
  bingoId: string;
  userId: string;
  teamId: string;
  kind: "tile" | "rules" | "stats";
  /** Required when kind is "tile". */
  tileId?: string;
  occurredAt: Date;
}

/** A Tile's details, the Rules, or the Stats page were opened: Drop detective, Rules lawyer, Number cruncher. Fire-and-forget: a caller ineligible for any reason just does nothing here. */
export function recordPageOpened(db: Db, event: PageOpenedEvent): void {
  safely(() => {
    db.transaction((tx) => {
      if (!isLive(tx, event.bingoId) || !isTeamMember(tx, event.teamId, event.userId)) return;
      const settings = loadSettings(tx, event.bingoId);
      const { date, hour } = localTimeOf(event.occurredAt, getTimezone());
      const activityKind: ActivityKind = event.kind === "tile" ? "tile_opened" : event.kind === "rules" ? "rules_opened" : "stats_opened";
      const subjectId = event.kind === "tile" ? event.tileId : event.kind;
      if (!subjectId) return;

      upsertActivity(tx, {
        bingoId: event.bingoId,
        userId: event.userId,
        kind: activityKind,
        subjectId,
        tileId: event.kind === "tile" ? subjectId : null,
        creditedUserId: null,
        teamId: event.teamId,
        localDate: date,
        localHour: hour,
        occurredAt: event.occurredAt,
      });

      if (event.kind === "rules") {
        tryEarn(tx, event.bingoId, event.userId, "rules_lawyer", event.occurredAt, settings, () => true);
      } else if (event.kind === "stats") {
        tryEarn(tx, event.bingoId, event.userId, "number_cruncher", event.occurredAt, settings, () => true);
      } else {
        tryEarn(tx, event.bingoId, event.userId, "drop_detective", event.occurredAt, settings, () => {
          const cutoff = settings.get("drop_detective")!.firstSwitchedOnAt;
          const openedTileIds = distinct(
            tx
              .select({ subjectId: achievementActivity.subjectId })
              .from(achievementActivity)
              .where(and(eq(achievementActivity.bingoId, event.bingoId), eq(achievementActivity.userId, event.userId), eq(achievementActivity.kind, "tile_opened"), gte(achievementActivity.occurredAt, cutoff)))
              .all()
              .map((r) => r.subjectId),
          );
          const boardTileIds = tx.select({ id: tiles.id }).from(tiles).where(eq(tiles.bingoId, event.bingoId)).all().map((t) => t.id);
          return boardTileIds.length > 0 && boardTileIds.every((id) => openedTileIds.has(id));
        });
      }
    });
  });
}

/** Long weekend's goal: Efficient Hours Bossed gained during the Bingo. */
const LONG_WEEKEND_EHB = 20;
/** Diversification's goal: different bosses killed at least once during the Bingo. */
const DIVERSIFICATION_BOSSES = 10;
/** Skiller's goal: Efficient Hours Played gained during the Bingo. */
const SKILLER_EHP = 3;

interface WomPoint {
  at: Date;
  clues: number | null;
  ehb: number | null;
  ehp: number | null;
  bossKills: Record<string, number | null>;
}

/**
 * A Player's Wise Old Man snapshots bracketing their play during the Bingo: their latest one taken by its end, and a
 * baseline — their last snapshot from before it started (or from before the Achievement was switched on, if that's
 * later), else their first one since — the same baseline the Titles' gains use. Null until there's a snapshot after
 * that cutoff.
 */
function womWindow(q: Queryable, bingo: Bingo, userId: string, firstSwitchedOnAt: Date): { baseline: WomPoint; latest: WomPoint } | null {
  const start = effectiveStartsAt(q, bingo);
  if (!start) return null;
  const cutoff = firstSwitchedOnAt > start ? firstSwitchedOnAt : start;
  const end = endedAt(q, bingo);
  const snapshots = q
    .select({ at: womSnapshots.takenAt, clues: womSnapshots.clues, ehb: womSnapshots.ehb, ehp: womSnapshots.ehp, bossKillsJson: womSnapshots.bossKillsJson })
    .from(womSnapshots)
    .where(and(eq(womSnapshots.bingoId, bingo.id), eq(womSnapshots.userId, userId)))
    .orderBy(womSnapshots.takenAt)
    .all()
    .filter((s) => !end || s.at <= end);
  const latest = snapshots.at(-1);
  if (!latest || latest.at <= cutoff) return null;
  const baseline = snapshots.filter((s) => s.at <= cutoff).at(-1) ?? snapshots[0]!;
  const point = (s: typeof latest): WomPoint => ({ at: s.at, clues: s.clues, ehb: s.ehb, ehp: s.ehp, bossKills: JSON.parse(s.bossKillsJson) as Record<string, number | null> });
  return { baseline: point(baseline), latest: point(latest) };
}

// A measure below the hiscores' minimum is stored as null and counts as 0: reaching the minimum at all is a gain.
const gainOf = (before: number | null | undefined, after: number | null | undefined) => Math.max(0, (after ?? 0) - (before ?? 0));
const ehbGained = (w: { baseline: WomPoint; latest: WomPoint }) => gainOf(w.baseline.ehb, w.latest.ehb);
/** Every boss (each Wise Old Man boss metric, a raid's harder mode included) with at least one more kill. */
const bossesKilled = (w: { baseline: WomPoint; latest: WomPoint }) =>
  Object.keys(w.latest.bossKills).filter((metric) => gainOf(w.baseline.bossKills[metric], w.latest.bossKills[metric]) >= 1).length;

/**
 * A Player's Wise Old Man snapshots were just stored (womReadService.readPlayer): Leech (a clue casket opened during the
 * Bingo: any clue gain), Long weekend (20 EHB gained during it), Diversification (10 different bosses killed during it)
 * and Skiller (3 EHP gained during it), from womWindow. Checked on every read, the final one after the Bingo is Finished too, since that read is still
 * about play while it was Live; snapshots after its end don't count.
 */
export function recordWomSnapshotsRead(db: Db, bingoId: string, userId: string): void {
  safely(() => {
    db.transaction((tx) => {
      const bingo = tx.select().from(bingos).where(eq(bingos.id, bingoId)).get();
      if (!bingo || (bingo.stage !== "live" && bingo.stage !== "complete")) return;
      const onATeam = tx
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(and(eq(teams.bingoId, bingoId), eq(teamMembers.userId, userId)))
        .get();
      if (!onATeam) return;
      const settings = loadSettings(tx, bingoId);

      const goals: [AchievementKey, (w: { baseline: WomPoint; latest: WomPoint }) => boolean][] = [
        ["leech", (w) => gainOf(w.baseline.clues, w.latest.clues) > 0],
        ["long_weekend", (w) => ehbGained(w) >= LONG_WEEKEND_EHB],
        ["diversification", (w) => bossesKilled(w) >= DIVERSIFICATION_BOSSES],
        ["skiller", (w) => gainOf(w.baseline.ehp, w.latest.ehp) >= SKILLER_EHP],
      ];
      for (const [key, reached] of goals) {
        const setting = settings.get(key);
        if (!setting) continue;
        const window = womWindow(tx, bingo, userId, setting.firstSwitchedOnAt);
        if (window) tryEarn(tx, bingoId, userId, key, window.latest.at, settings, () => reached(window));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The switched-on set for reads: the master switch AND the per-key enabled flag. */
function switchedOnFor(db: Queryable, bingo: Bingo): Map<AchievementKey, { firstSwitchedOnAt: Date }> {
  if (!bingo.achievementsEnabled) return new Map();
  const rows = db.select().from(bingoAchievementSettings).where(and(eq(bingoAchievementSettings.bingoId, bingo.id), eq(bingoAchievementSettings.enabled, true))).all();
  return new Map(rows.map((r) => [r.achievementKey as AchievementKey, { firstSwitchedOnAt: r.firstSwitchedOnAt }]));
}

/**
 * The signed-in player's Achievements for this bingo: every switched-on Achievement (Hidden ones included), earned
 * or locked, with progress for the counted ones — a locked Hidden Achievement is masked (no name/description/flavour/icon).
 * Plus the earned-but-not-shown popups, oldest first.
 */
export function getMyAchievements(db: Db, bingo: Bingo, userId: string): MyAchievementsResponse {
  const switched = switchedOnFor(db, bingo);
  if (switched.size === 0) return { achievements: [], unshownPopups: [] };

  // SQLite may satisfy this lookup via the (bingoId,userId,achievementKey) unique index rather than a rowid scan,
  // returning rows in key-alphabetical order rather than insertion order — `seq` (the table's implicit rowid) is a
  // reliable, always-increasing tiebreaker for two Achievements earned at the exact same instant (see the sort below).
  const earnedRows = db
    .select({ achievementKey: achievementEarned.achievementKey, earnedAt: achievementEarned.earnedAt, popupShownAt: achievementEarned.popupShownAt, seq: sql<number>`rowid` })
    .from(achievementEarned)
    .where(and(eq(achievementEarned.bingoId, bingo.id), eq(achievementEarned.userId, userId)))
    .all();
  const earnedByKey = new Map(earnedRows.map((r) => [r.achievementKey as AchievementKey, r]));
  const tileCount = db.select({ id: tiles.id }).from(tiles).where(eq(tiles.bingoId, bingo.id)).all().length;

  const achievements: MyAchievement[] = ACHIEVEMENTS.filter((def) => switched.has(def.key)).map((def) => {
    const earned = earnedByKey.get(def.key);
    const masked = def.hidden && !earned;
    return {
      key: def.key,
      hidden: def.hidden,
      masked,
      name: masked ? null : def.name,
      description: masked ? null : def.description,
      // The flavour line is part of the reward: none until earned, even for a visible one.
      flavor: earned ? def.flavor : null,
      itemName: masked ? null : def.itemName,
      earned: !!earned,
      earnedAt: earned ? earned.earnedAt.toISOString() : null,
      // A masked one's progress would hint at what it is (Cheerleader's "4/10"), so it has none until earned.
      progress: masked ? null : progressFor(db, bingo, userId, def.key, switched, tileCount),
    };
  });

  const unshownPopups = earnedRows
    .filter((r) => switched.has(r.achievementKey as AchievementKey) && !r.popupShownAt)
    .sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime() || a.seq - b.seq)
    .map((r) => r.achievementKey as AchievementKey);

  return { achievements, unshownPopups };
}

function progressFor(
  db: Queryable,
  bingo: Bingo,
  userId: string,
  key: AchievementKey,
  switched: Map<AchievementKey, { firstSwitchedOnAt: Date }>,
  tileCount: number,
): { current: number; target: number } | null {
  const cutoff = switched.get(key)?.firstSwitchedOnAt;
  if (!cutoff) return null;
  const bingoId = bingo.id;
  const base = and(eq(achievementActivity.bingoId, bingoId), eq(achievementActivity.userId, userId), gte(achievementActivity.occurredAt, cutoff));

  if (key === "cheerleader") {
    const current = distinct(
      db
        .select({ subjectId: achievementActivity.subjectId })
        .from(achievementActivity)
        .where(and(base, eq(achievementActivity.kind, "reacted"), ne(achievementActivity.creditedUserId, userId)))
        .all()
        .map((r) => r.subjectId),
    ).size;
    return { current: Math.min(current, 10), target: 10 };
  }
  if (key === "regular") {
    const current = distinct(db.select({ localDate: achievementActivity.localDate }).from(achievementActivity).where(and(base, eq(achievementActivity.kind, "posted"))).all().map((r) => r.localDate)).size;
    return { current: Math.min(current, 5), target: 5 };
  }
  if (key === "globetrotter") {
    const current = distinct(db.select({ tileId: achievementActivity.tileId }).from(achievementActivity).where(and(base, eq(achievementActivity.kind, "posted"))).all().map((r) => r.tileId)).size;
    return { current: Math.min(current, 5), target: 5 };
  }
  if (key === "drop_detective") {
    const current = distinct(db.select({ subjectId: achievementActivity.subjectId }).from(achievementActivity).where(and(base, eq(achievementActivity.kind, "tile_opened"))).all().map((r) => r.subjectId)).size;
    return { current: Math.min(current, tileCount), target: tileCount };
  }
  if (key === "long_weekend") {
    // Whole hours: "12/20", never rounded up to a goal not yet reached.
    const window = womWindow(db, bingo, userId, cutoff);
    return { current: Math.min(Math.floor(window ? ehbGained(window) : 0), LONG_WEEKEND_EHB), target: LONG_WEEKEND_EHB };
  }
  return null;
}

/** Earned / total switched-on (Hidden ones included) for a player card. Null when the feature is switched off. */
export function getAchievementCount(db: Db, bingo: Bingo, userId: string): AchievementCount | null {
  if (!bingo.achievementsEnabled) return null;
  const switched = switchedOnFor(db, bingo);
  if (switched.size === 0) return { earned: 0, total: 0 };
  const earned = db
    .select({ id: achievementEarned.id })
    .from(achievementEarned)
    .where(and(eq(achievementEarned.bingoId, bingo.id), eq(achievementEarned.userId, userId), inArray(achievementEarned.achievementKey, [...switched.keys()])))
    .all().length;
  return { earned, total: switched.size };
}

/** The player's device reports these popups played. Idempotent; unknown/foreign keys are simply not matched. */
export function markPopupsShown(db: Db, bingoId: string, userId: string, keys: AchievementKey[]): void {
  if (keys.length === 0) return;
  db.update(achievementEarned)
    .set({ popupShownAt: clockNow() })
    .where(and(eq(achievementEarned.bingoId, bingoId), eq(achievementEarned.userId, userId), inArray(achievementEarned.achievementKey, keys), isNull(achievementEarned.popupShownAt)))
    .run();
}

// ---------------------------------------------------------------------------
// Admin settings (master switch is a plain bingos column — see bingoService.ts)
// ---------------------------------------------------------------------------

/** Every catalogue key, switched on, stamped `at` — createBingo calls this right after inserting the bingo row. */
export function initializeAchievementSettings(tx: Tx, bingoId: string, at: Date): void {
  tx.insert(bingoAchievementSettings)
    .values(ACHIEVEMENT_KEYS.map((key) => ({ bingoId, achievementKey: key, enabled: true, firstSwitchedOnAt: at })))
    .run();
}

export interface AchievementSettingRow {
  key: AchievementKey;
  name: string;
  description: string;
  hidden: boolean;
  itemName: string;
  enabled: boolean;
}

/** Current per-key switch state for the admin settings form, in catalogue order. A key with no row reads as off. */
export function getAchievementSettings(db: Db, bingoId: string): AchievementSettingRow[] {
  const rows = new Map(db.select().from(bingoAchievementSettings).where(eq(bingoAchievementSettings.bingoId, bingoId)).all().map((r) => [r.achievementKey as AchievementKey, r]));
  return ACHIEVEMENTS.map((def) => ({ key: def.key, name: def.name, description: def.description, hidden: def.hidden, itemName: def.itemName, enabled: rows.get(def.key)?.enabled ?? false }));
}

/**
 * Applies an admin's per-Achievement switches (called from within bingoService.updateBingoSettings's own
 * transaction). Turning one on for the first time stamps firstSwitchedOnAt now — never moved again; turning one off
 * (or back on) just flips `enabled`. Unknown keys are ignored.
 */
export function applyAchievementSwitches(tx: Tx, bingoId: string, switches: Partial<Record<AchievementKey, boolean>>, now: Date = clockNow()): void {
  for (const [key, enabled] of Object.entries(switches) as [AchievementKey, boolean][]) {
    if (!(ACHIEVEMENT_KEYS as readonly string[]).includes(key)) continue;
    const existing = tx.select().from(bingoAchievementSettings).where(and(eq(bingoAchievementSettings.bingoId, bingoId), eq(bingoAchievementSettings.achievementKey, key))).get();
    if (existing) {
      if (existing.enabled !== enabled) tx.update(bingoAchievementSettings).set({ enabled }).where(eq(bingoAchievementSettings.id, existing.id)).run();
    } else if (enabled) {
      tx.insert(bingoAchievementSettings).values({ bingoId, achievementKey: key, enabled: true, firstSwitchedOnAt: now }).run();
    }
    // else: no row and switching off — already off, nothing to do.
  }
}

/** Currently-enabled keys, for export (bingoExportService.ts) — the admin's current configuration, not activity history. */
export function getEnabledAchievementKeys(db: Db, bingoId: string): AchievementKey[] {
  return db
    .select({ achievementKey: bingoAchievementSettings.achievementKey })
    .from(bingoAchievementSettings)
    .where(and(eq(bingoAchievementSettings.bingoId, bingoId), eq(bingoAchievementSettings.enabled, true)))
    .all()
    .map((r) => r.achievementKey as AchievementKey);
}

/**
 * Import-only: restricts a freshly created bingo's Achievement settings to exactly `keys` (deletes the rest).
 * Safe only because a brand-new bingo has no activity/earned rows yet to lose.
 */
export function restrictAchievementSettingsTo(tx: Tx, bingoId: string, keys: AchievementKey[]): void {
  const keep = new Set(keys);
  const toRemove = ACHIEVEMENT_KEYS.filter((k) => !keep.has(k));
  if (toRemove.length === 0) return;
  tx.delete(bingoAchievementSettings).where(and(eq(bingoAchievementSettings.bingoId, bingoId), inArray(bingoAchievementSettings.achievementKey, toRemove))).run();
}
