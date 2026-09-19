import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { claims, nodes, submissions, teamNodeState, teams, tiles } from "../db/schema";
import { ServiceError } from "./errors";
import { awardedPoints, evaluateGraph } from "./engine";
import { getApprovedClaims, getFullGraph } from "./graphService";
import { tileForLeaf } from "./submissionService";
import { audit } from "../audit/record";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Denormalized labels for a submission.approved/rejected audit entry — the
// tile a submission targeted and the labels of the specific leaves claimed,
// resolved fresh since the graph can change after the fact.
function describeSubmissionTarget(tx: Tx, bingoId: string, nodeIds: string[]): { tileName: string | null; taskLabels: string[] } {
  const tileRows = tx.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const tileName = nodeIds.length ? (tileForLeaf(tx, nodeIds[0]!, tileByNodeId)?.name ?? null) : null;
  const leafRows = nodeIds.length ? tx.select({ id: nodes.id, label: nodes.label }).from(nodes).where(inArray(nodes.id, nodeIds)).all() : [];
  return { tileName, taskLabels: leafRows.map((n) => n.label).filter((l): l is string => !!l) };
}

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

/**
 * Recomputes every team's completed nodes and points from their approved claims. Scores are a
 * snapshot taken when a submission is reviewed, so they go stale when the board itself changes
 * (a task's points, its requirements, a line's bonus...): an edit made while the bingo is live
 * calls this so nobody keeps points from a rule that no longer exists.
 */
export function rescoreBingo(db: Db, bingoId: string): void {
  db.transaction((tx) => {
    for (const team of tx.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all()) {
      rebuildTeamState(tx, team.id);
    }
  });
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
    const team = tx.select().from(teams).where(eq(teams.id, submission.teamId)).get()!;

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
    const pointsDelta = afterPoints - beforePoints;

    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;

    const { tileName, taskLabels } = describeSubmissionTarget(tx, team.bingoId, nodeIds);
    audit(tx, {
      action: "submission.approved",
      bingoId: team.bingoId,
      entity: { type: "submission", id: submission.id, label: tileName },
      teamId: submission.teamId,
      details: { tileName, taskLabels, nodeIds, newlyCompletedNodeIds, pointsDelta, reviewerNotes: params.reviewerNotes ?? null, submittedByUserId: submission.submittedByUserId },
      actor: { userId: params.reviewedByUserId },
    });

    return { submission: updatedSubmission, nodeIds, newlyCompletedNodeIds, pointsDelta };
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
    const team = tx.select().from(teams).where(eq(teams.id, submission.teamId)).get()!;

    tx.update(submissions)
      .set({ status: "rejected", reviewedAt: new Date(), reviewedByUserId: params.reviewedByUserId, reviewerNotes: params.reviewerNotes ?? null, updatedAt: new Date() })
      .where(eq(submissions.id, submission.id))
      .run();

    const nodeIds = getSubmissionNodeIds(tx, submission.id);
    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;

    const { tileName, taskLabels } = describeSubmissionTarget(tx, team.bingoId, nodeIds);
    audit(tx, {
      action: "submission.rejected",
      bingoId: team.bingoId,
      entity: { type: "submission", id: submission.id, label: tileName },
      teamId: submission.teamId,
      details: { tileName, taskLabels, nodeIds, reviewerNotes: params.reviewerNotes ?? null, submittedByUserId: submission.submittedByUserId },
      actor: { userId: params.reviewedByUserId },
    });

    return { submission: updatedSubmission, nodeIds };
  });
}

export interface UndoSubmissionReviewParams {
  submissionId: string;
  undoneByUserId: string;
}

export interface UndoSubmissionReviewResult {
  submission: typeof submissions.$inferSelect;
  nodeIds: string[];
  previousStatus: "approved" | "rejected";
  // Nodes that were complete before the undo and aren't any more. Always
  // empty when the submission had been rejected (its claims never counted).
  uncompletedNodeIds: string[];
  // Zero or negative: points the team loses because of the undo.
  pointsDelta: number;
}

// Sends a reviewed submission back to pending so it can be re-reviewed. The
// reviewer fields are cleared (a pending submission has no review); the
// previous decision survives in the audit entry. Undoing an approval is the
// same full recompute approval is — the graph is re-evaluated against
// whatever approved claims remain, so gated points, SUM tallies, lines and
// tile bonuses all settle on their own.
export function undoSubmissionReview(db: Db, params: UndoSubmissionReviewParams): UndoSubmissionReviewResult {
  return db.transaction((tx): UndoSubmissionReviewResult => {
    const submission = tx.select().from(submissions).where(eq(submissions.id, params.submissionId)).get();
    if (!submission) throw new ServiceError(404, "Submission not found");
    if (submission.status === "pending") throw new ServiceError(409, "Submission has not been reviewed");
    const previousStatus = submission.status;
    const team = tx.select().from(teams).where(eq(teams.id, submission.teamId)).get()!;

    tx.update(submissions)
      .set({ status: "pending", reviewedAt: null, reviewedByUserId: null, reviewerNotes: null, updatedAt: new Date() })
      .where(eq(submissions.id, submission.id))
      .run();

    const nodeIds = getSubmissionNodeIds(tx, submission.id);
    let uncompletedNodeIds: string[] = [];
    let pointsDelta = 0;
    if (previousStatus === "approved") {
      const before = tx.select().from(teamNodeState).where(eq(teamNodeState.teamId, submission.teamId)).all();
      const beforePoints = before.reduce((sum, r) => sum + r.pointsAwarded, 0);
      const after = rebuildTeamState(tx, submission.teamId);
      const afterPoints = [...after.values()].reduce((sum, s) => sum + s.pointsAwarded, 0);
      uncompletedNodeIds = before.map((r) => r.nodeId).filter((id) => !after.has(id));
      pointsDelta = afterPoints - beforePoints;
    }

    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;

    const { tileName, taskLabels } = describeSubmissionTarget(tx, team.bingoId, nodeIds);
    audit(tx, {
      action: "submission.review_undone",
      bingoId: team.bingoId,
      entity: { type: "submission", id: submission.id, label: tileName },
      teamId: submission.teamId,
      details: {
        tileName,
        taskLabels,
        nodeIds,
        previousStatus,
        previousReviewerNotes: submission.reviewerNotes,
        previousReviewedByUserId: submission.reviewedByUserId,
        uncompletedNodeIds,
        pointsDelta,
        submittedByUserId: submission.submittedByUserId,
      },
      actor: { userId: params.undoneByUserId },
    });

    return { submission: updatedSubmission, nodeIds, previousStatus, uncompletedNodeIds, pointsDelta };
  });
}
