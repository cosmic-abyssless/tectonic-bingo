// The Cut review (CONTEXT.md "Cut review"): builds the planner's input from the real draft pool, exposes the
// resulting plan (and its Avoidable/Unavoidable split) to the Signups tab and the move-to-Draft confirmation,
// scores an admin-edited change list, applies one, and guards the move into the Draft stage. cutPlanner.ts does
// the actual (DB-free) planning and scoring; this file is the only place that talks to the database.
import crypto from "node:crypto";
import { eq, sql, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { timeZoneRegion, type AppliedCutChange, type CutChange, type CutReviewPreview } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, signups } from "../db/schema";
import * as draftService from "./draftService";
import * as pairingService from "./pairingService";
import * as teamService from "./teamService";
import * as cutPlanner from "./cutPlanner";
import type { CutPlannerInput, CutPlannerUnit } from "./cutPlanner";
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
  const fresh = db.select({ cutMode: bingos.cutMode, signupMode: bingos.signupMode }).from(bingos).where(eq(bingos.id, bingo.id)).get() ?? bingo;
  // includeAnswers: the pool's timezone is gated by the same visibility rule as signup answers (see
  // getDraftState) — "admin" sees every signup's, which the Cut review (Admin-only) needs for the region preference.
  const { pool, teams } = draftService.getDraftState(db, bingo, { includeAnswers: true, answerViewer: "admin" });
  const insertionOrder = insertionOrderOf(db, bingo.id);
  const units: CutPlannerUnit[] = pool.map((u) => ({
    pairingId: u.pairingId,
    // The real pool never contains a Captain's pair (they're on a team before the Draft) — see cutPlanner.ts.
    isCaptainPair: false,
    entries: u.entries.map((e) => ({
      userId: e.signup.userId,
      signedUpAt: e.signup.createdAt.getTime(),
      insertionRank: insertionOrder.get(e.signup.userId) ?? -1,
      timezoneRegion: e.signup.timezone ? timeZoneRegion(e.signup.timezone) : null,
    })),
  }));
  return { units, cutMode: fresh.cutMode, teamCount: teams.length, drafted: { pairs: 0, singles: 0 }, isSolo: fresh.signupMode === "solo" };
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
  const plan = cutPlanner.planCutChanges(buildCutReviewInput(db, bingo));
  return { plan, avoidableCount: plan.cutPlayersNow - plan.cutPlayers, unavoidableCount: plan.cutPlayers };
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
    for (const change of changes) {
      if (change.kind === "pair") {
        pairingService.adminPair(tx, bingo, { userIdA: change.signupIds[0], userIdB: change.signupIds[1], createdByUserId: actingUserId });
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
