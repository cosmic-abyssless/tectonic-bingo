import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { claims, submissions, teamNodeState, teams, tileWildcards } from "../db/schema";
import { ServiceError } from "./errors";
import { awardedPoints, evaluateGraph } from "./engine";
import { getApprovedClaims, getFullGraph } from "./graphService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Distinct leaf nodes a submission's claims target.
export function getSubmissionNodeIds(tx: Tx, submissionId: string): string[] {
  const rows = tx.select({ nodeId: claims.nodeId }).from(claims).where(eq(claims.submissionId, submissionId)).all();
  return [...new Set(rows.map((r) => r.nodeId))];
}

// Re-evaluates the whole bingo's graph against a team's approved claims and
// overwrites teamNodeState with exactly the currently-complete nodes. This is
// a full recompute, not an incremental patch — see docs/node-graph-model.md
// §5. Returns the new state so callers can diff against what was there
// before (e.g. to report what an approval newly completed).
export function rebuildTeamState(tx: Tx, teamId: string): Map<string, { completedAt: Date; pointsAwarded: number }> {
  const team = tx.select({ bingoId: teams.bingoId }).from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new ServiceError(404, "Team not found");

  const { engineNodes, childrenOf, nodesById } = getFullGraph(tx, team.bingoId);
  const approvedClaims = getApprovedClaims(tx, teamId, team.bingoId);
  const results = evaluateGraph(engineNodes, childrenOf, approvedClaims);

  const newState = new Map<string, { completedAt: Date; pointsAwarded: number }>();
  for (const node of engineNodes) {
    const r = results.get(node.id);
    if (r?.complete && r.completedAt) {
      newState.set(node.id, { completedAt: r.completedAt, pointsAwarded: awardedPoints(node.id, results, nodesById) });
    }
  }

  tx.delete(teamNodeState).where(eq(teamNodeState.teamId, teamId)).run();
  for (const [nodeId, state] of newState) {
    tx.insert(teamNodeState).values({ teamId, nodeId, completedAt: state.completedAt, pointsAwarded: state.pointsAwarded }).run();
  }
  return newState;
}

function assertWildcardCapsNotExceeded(tx: Tx, teamId: string, submissionId: string): void {
  const wildcardIds = tx
    .select({ wildcardId: claims.wildcardId })
    .from(claims)
    .where(eq(claims.submissionId, submissionId))
    .all()
    .map((r) => r.wildcardId)
    .filter((id): id is string => id !== null);
  for (const wildcardId of new Set(wildcardIds)) {
    const wildcard = tx.select().from(tileWildcards).where(eq(tileWildcards.id, wildcardId)).get();
    if (!wildcard) throw new ServiceError(404, "Wildcard not found");
    const priorApprovedUses = tx
      .select({ id: claims.id })
      .from(claims)
      .innerJoin(submissions, eq(claims.submissionId, submissions.id))
      .where(and(eq(submissions.teamId, teamId), eq(submissions.status, "approved"), eq(claims.wildcardId, wildcardId)))
      .all().length;
    const thisUses = wildcardIds.filter((id) => id === wildcardId).length;
    if (priorApprovedUses + thisUses > wildcard.maxRedemptionsPerTeam) {
      throw new ServiceError(400, `${wildcard.itemName} has already been redeemed the maximum number of times for this team`);
    }
  }
}

export interface ApproveSubmissionParams {
  submissionId: string;
  reviewedByUserId: string;
  reviewerNotes?: string;
}

export interface ApproveSubmissionResult {
  submission: typeof submissions.$inferSelect;
  // Every leaf node the submission's claims touched.
  nodeIds: string[];
  // Nodes (any kind, anywhere in the graph) newly completed by this approval.
  newlyCompletedNodeIds: string[];
  // Sum of points newly awarded by this approval.
  pointsDelta: number;
}

// Approving is the only thing that makes a submission's claims count — a
// MANUAL leaf has no separate "completed" decision; approving its claim IS
// the decision (see docs/node-graph-model.md §5). Points are never set here;
// they come from the graph via rebuildTeamState.
export function approveSubmission(db: Db, params: ApproveSubmissionParams): ApproveSubmissionResult {
  return db.transaction((tx): ApproveSubmissionResult => {
    const submission = tx.select().from(submissions).where(eq(submissions.id, params.submissionId)).get();
    if (!submission) throw new ServiceError(404, "Submission not found");
    if (submission.status !== "pending") throw new ServiceError(409, "Submission has already been reviewed");

    assertWildcardCapsNotExceeded(tx, submission.teamId, submission.id);

    tx.update(submissions)
      .set({ status: "approved", reviewedAt: new Date(), reviewedByUserId: params.reviewedByUserId, reviewerNotes: params.reviewerNotes ?? null, updatedAt: new Date() })
      .where(eq(submissions.id, submission.id))
      .run();

    const nodeIds = getSubmissionNodeIds(tx, submission.id);
    const before = tx.select().from(teamNodeState).where(eq(teamNodeState.teamId, submission.teamId)).all();
    const beforeIds = new Set(before.map((r) => r.nodeId));
    const beforePoints = before.reduce((sum, r) => sum + r.pointsAwarded, 0);

    const after = rebuildTeamState(tx, submission.teamId);
    const afterPoints = [...after.values()].reduce((sum, s) => sum + s.pointsAwarded, 0);
    const newlyCompletedNodeIds = [...after.keys()].filter((id) => !beforeIds.has(id));

    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;
    return { submission: updatedSubmission, nodeIds, newlyCompletedNodeIds, pointsDelta: afterPoints - beforePoints };
  });
}

export interface RejectSubmissionParams {
  submissionId: string;
  reviewedByUserId: string;
  reviewerNotes?: string;
}

// A pending submission's claims never counted toward teamNodeState, so
// rejecting one is a pure status flip — nothing to recompute.
export function rejectSubmission(db: Db, params: RejectSubmissionParams): { submission: typeof submissions.$inferSelect; nodeIds: string[] } {
  return db.transaction((tx) => {
    const submission = tx.select().from(submissions).where(eq(submissions.id, params.submissionId)).get();
    if (!submission) throw new ServiceError(404, "Submission not found");
    if (submission.status !== "pending") throw new ServiceError(409, "Submission has already been reviewed");

    tx.update(submissions)
      .set({ status: "rejected", reviewedAt: new Date(), reviewedByUserId: params.reviewedByUserId, reviewerNotes: params.reviewerNotes ?? null, updatedAt: new Date() })
      .where(eq(submissions.id, submission.id))
      .run();

    const nodeIds = getSubmissionNodeIds(tx, submission.id);
    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;
    return { submission: updatedSubmission, nodeIds };
  });
}
