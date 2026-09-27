// The Cut review (CONTEXT.md "Cut review"): builds the planner's input from the real draft pool, exposes the
// resulting plan (and its Avoidable/Unavoidable split) to the Signups tab and the move-to-Draft confirmation,
// scores an admin-edited change list, applies one, and guards the move into the Draft stage. cutPlanner.ts does
// the actual (DB-free) planning and scoring; this file is the only place that talks to the database.
import crypto from "node:crypto";
import { eq, sql, and, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { timeZoneRegion, type AppliedCutChange, type CutChange, type CutReviewPool, type CutReviewPreview } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, signups } from "../db/schema";
import * as draftService from "./draftService";
import * as pairingService from "./pairingService";
import * as teamService from "./teamService";
import * as cutPlanner from "./cutPlanner";
import type { CutPlannerEntry, CutPlannerInput, CutPlannerTeam, CutPlannerUnit } from "./cutPlanner";
import { ServiceError } from "./errors";
import { audit } from "../audit/record";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

// True DB insertion order for every active signup, keyed by userId (what the rest of this file identifies a
// person by) — the same tie-break markCuts itself uses (see draftService's getDraftState), rebuilt here because
// the planner needs it but getDraftState doesn't expose it.
function insertionOrderOf(db: Db, bingoId: string): Map<string, number> {
  const rows = db
    .select({ userId: signups.userId })
    .from(signups)
    .where(and(eq(signups.bingoId, bingoId), eq(signups.status, "active")))
    .orderBy(sql`rowid`)
    .all();
  return new Map(rows.map((s, i) => [s.userId, i]));
}

// Builds the planner's input from the current, undrafted pool — always what a Cut review runs against (it only
// ever offers before the Draft stage begins, so `drafted` is always {0,0}: nothing has been picked yet).
export function buildCutReviewInput(db: Db, bingo: Bingo): CutPlannerInput {
  return loadCutReview(db, bingo).input;
}

// The planner's input plus the same pool by name (CutReviewPool), from one getDraftState call.
function loadCutReview(db: Db, bingo: Bingo): { input: CutPlannerInput; pool: CutReviewPool } {
  const fresh = db.select({ cutMode: bingos.cutMode, signupMode: bingos.signupMode }).from(bingos).where(eq(bingos.id, bingo.id)).get() ?? bingo;
  // includeAnswers: the pool's timezone is gated by the same visibility rule as signup answers (see
  // getDraftState) — "admin" sees every signup's, which the Cut review (Admin-only) needs for the region preference.
  const { pool, teams } = draftService.getDraftState(db, bingo, { includeAnswers: true, answerViewer: "admin" });
  const insertionOrder = insertionOrderOf(db, bingo.id);
  const entryOf = (signup: { userId: string; createdAt: Date; timezone: string | null }): CutPlannerEntry => ({
    userId: signup.userId,
    signedUpAt: signup.createdAt.getTime(),
    insertionRank: insertionOrder.get(signup.userId) ?? -1,
    timezoneRegion: signup.timezone ? timeZoneRegion(signup.timezone) : null,
  });
  const units: CutPlannerUnit[] = pool.map((u) => ({
    pairingId: u.pairingId,
    // The real pool never contains a Captain's pair (they're on a team before the Draft) — see cutPlanner.ts.
    isCaptainPair: false,
    entries: u.entries.map((e) => entryOf(e.signup)),
  }));
  // The Teams' own members (Captain, co-captain): a Team change moves them in or out of the pool (see cutPlanner.ts).
  const memberIds = teams.flatMap((t) => [t.captainUserId, ...(t.coCaptain ? [t.coCaptain.userId] : [])]);
  const memberSignups = memberIds.length
    ? db.select().from(signups).where(and(eq(signups.bingoId, bingo.id), inArray(signups.userId, memberIds))).all()
    : [];
  const signupOf = new Map(memberSignups.map((s) => [s.userId, s]));
  const accepted = pairingService.getAcceptedPairs(db, bingo.id);
  const teamInputs: CutPlannerTeam[] = teams.map((t) => {
    const ids = [t.captainUserId, ...(t.coCaptain ? [t.coCaptain.userId] : [])];
    const members = ids.flatMap((id) => {
      const s = signupOf.get(id);
      return s ? [entryOf(s)] : [];
    });
    const pairing = ids.length === 2 ? accepted.find((p) => ids.every((id) => p.userIds.includes(id))) : undefined;
    return { teamId: t.id, members, pairingId: pairing?.pairing.id ?? null };
  });
  const input: CutPlannerInput = {
    units,
    cutMode: fresh.cutMode,
    teamCount: teams.length,
    drafted: { pairs: 0, singles: 0 },
    isSolo: fresh.signupMode === "solo",
    teams: teamInputs,
  };
  const withNames = pool.map((u, i) => ({ unit: units[i]!, rsns: new Map(u.entries.map((e) => [e.signup.userId, e.signup.rsn])) }));
  const summary: CutReviewPool = {
    singles: withNames
      .filter(({ unit }) => unit.entries.length === 1)
      .sort((a, b) => byAge(a.unit, b.unit))
      .map(({ unit, rsns }) => ({ userId: unit.entries[0]!.userId, rsn: rsns.get(unit.entries[0]!.userId) ?? "", region: unit.entries[0]!.timezoneRegion })),
    pairs: withNames
      .filter(({ unit }) => unit.entries.length > 1 && unit.pairingId)
      .sort((a, b) => byAge(a.unit, b.unit))
      .map(({ unit, rsns }) => ({ pairingId: unit.pairingId!, members: unit.entries.map((e) => ({ userId: e.userId, rsn: rsns.get(e.userId) ?? "" })) })),
    teams: teams.map((t) => ({ teamId: t.id, name: t.name, captainRsn: t.captainRsn })),
  };
  return { input, pool: summary };
}

// Oldest signup first, by (signedUpAt, insertionRank) — markCuts' own order; a pair goes by its earlier member.
function byAge(a: CutPlannerUnit, b: CutPlannerUnit): number {
  const first = (u: CutPlannerUnit) => u.entries.reduce((x, e) => (e.signedUpAt < x.signedUpAt || (e.signedUpAt === x.signedUpAt && e.insertionRank < x.insertionRank) ? e : x));
  const x = first(a);
  const y = first(b);
  return x.signedUpAt - y.signedUpAt || x.insertionRank - y.insertionRank;
}

/** A deterministic fingerprint of the pool's unit composition, Team count and cutMode — see the bingos column. */
function fingerprintOf(input: CutPlannerInput): string {
  const signature = input.units
    .map((u) => (u.entries.length > 1 ? `p:${[...u.entries.map((e) => e.userId)].sort().join(",")}` : `s:${u.entries[0]!.userId}`))
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(`${input.cutMode}|${input.teamCount}|${signature}`).digest("hex");
}

export function currentCutReviewFingerprint(db: Db, bingo: Bingo): string {
  return fingerprintOf(buildCutReviewInput(db, bingo));
}

/** The plan a Cut review proposes right now, plus the Avoidable/Unavoidable split it implies. */
export function getCutReviewPreview(db: Db, bingo: Bingo): CutReviewPreview {
  const { input, pool } = loadCutReview(db, bingo);
  const plan = cutPlanner.planCutChanges(input);
  return { plan, avoidableCount: plan.cutPlayersNow - plan.cutPlayers, unavoidableCount: plan.cutPlayers, pool };
}

/** How many players an (admin-edited) change list would leave cut, validated against the current pool. */
export function scoreCutChanges(db: Db, bingo: Bingo, changes: CutChange[]): number {
  return cutPlanner.scoreChanges(buildCutReviewInput(db, bingo), changes).cutPlayers;
}

function partnerOf(db: Db, bingoId: string, userId: string): string | null {
  return pairingService.getAcceptedPairs(db, bingoId).find((p) => p.userIds.includes(userId))?.userIds.find((id) => id !== userId) ?? null;
}

export interface CutReviewApplyResult {
  cutPlayers: number;
}

/**
 * Applies every change in one transaction, through the existing pairing/Captain/Team operations (their own audits
 * fire as normal), then records that a review was applied for the roster as it now stands (see the fingerprint
 * column) — so a later signup/pairing/Team change requires a fresh review. Each operation validates itself against
 * the current roster and throws on a stale reference; since everything runs in one transaction, a rejection rolls
 * back every change already applied, so a stale plan is never half-applied. An empty `changes` is valid — a
 * deliberate "keep these cuts" — and still records the review.
 */
export function applyCutReview(db: Db, bingo: Bingo, changes: AppliedCutChange[], actingUserId: string): CutReviewApplyResult {
  return db.transaction((tx) => {
    // Before any change, purely for the audit entry's "how many were cut before this review" — not the plan's
    // hypothetical optimum, the roster's actual count as it stood.
    const cutPlayersBefore = getCutReviewPreview(tx, bingo).plan.cutPlayersNow;
    let teamChanges = 0;
    // Pairings and splits first, the Team change last — the order they're scored in (cutPlanner.resolveChanges), so a
    // Captain the plan also pairs up leads the new Team with their new partner.
    const ordered = [...changes.filter((c) => c.kind === "pair" || c.kind === "split"), ...changes.filter((c) => c.kind === "addTeam" || c.kind === "removeTeam")];
    for (const change of ordered) {
      if (change.kind === "pair") {
        pairingService.adminPair(tx, bingo, { userIdA: change.userIds[0], userIdB: change.userIds[1], createdByUserId: actingUserId });
      } else if (change.kind === "split") {
        pairingService.unpair(tx, bingo, change.pairingId);
      } else if (change.kind === "addTeam") {
        teamChanges++;
        if (teamChanges > 1) throw new ServiceError(400, "A plan can change the Team count by at most one Team");
        teamService.createTeam(tx, { bingoId: bingo.id, captainUserId: change.captainUserId, coCaptainUserId: partnerOf(tx, bingo.id, change.captainUserId) });
      } else {
        teamChanges++;
        if (teamChanges > 1) throw new ServiceError(400, "A plan can change the Team count by at most one Team");
        const team = tx.select({ bingoId: schema.teams.bingoId }).from(schema.teams).where(eq(schema.teams.id, change.teamId)).get();
        if (!team || team.bingoId !== bingo.id) throw new ServiceError(404, "Team not found");
        teamService.deleteTeam(tx, change.teamId);
      }
    }

    const fingerprint = currentCutReviewFingerprint(tx, bingo);
    tx.update(bingos).set({ cutReviewFingerprint: fingerprint }).where(eq(bingos.id, bingo.id)).run();

    // The roster's actual cut count now that every change has been made (not a further hypothetical optimum —
    // that's what the *next* getCutReviewPreview call is for, once the client refetches).
    const cutPlayersAfter = getCutReviewPreview(tx, bingo).plan.cutPlayersNow;
    audit(tx, {
      action: "draft.cut_review_applied",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: { changes, cutPlayersNow: cutPlayersBefore, cutPlayers: cutPlayersAfter },
      actor: { userId: actingUserId },
    });

    return { cutPlayers: cutPlayersAfter };
  });
}

/**
 * The move into the Draft stage is refused while any cut is Avoidable and no review has been applied since the
 * roster last changed (CONTEXT.md "Cut review"): the client routes the Admin through the Cut review modal first,
 * even if every change ends up dropped (a deliberate "keep these cuts", which still satisfies this).
 */
export function assertCutReviewSatisfied(db: Db, bingo: Bingo): void {
  const preview = getCutReviewPreview(db, bingo);
  if (preview.avoidableCount <= 0) return;
  const fresh = db.select({ cutReviewFingerprint: bingos.cutReviewFingerprint }).from(bingos).where(eq(bingos.id, bingo.id)).get();
  if (fresh?.cutReviewFingerprint && fresh.cutReviewFingerprint === currentCutReviewFingerprint(db, bingo)) return;
  throw new ServiceError(400, "Some cuts can be avoided. Review cuts before moving into the Draft.", "cut_review_required");
}
