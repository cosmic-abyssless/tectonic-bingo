import { now as clockNow } from "../clock";
import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLines, claims, nodes, submissions, teamNodeState, teams, tiles } from "../db/schema";
import { ServiceError } from "./errors";
import { awardedPoints, evaluateGraph } from "./engine";
import { getApprovedClaims, getFullGraph } from "./graphService";
import { applyExclusivity } from "./exclusivityService";
import { tileForLeaf } from "./submissionService";
import { audit } from "../audit/record";
import { PUBLISHED_BOARD, type BoardTables } from "./boardTables";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Denormalized labels for a submission.approved/rejected audit entry — the
// tile a submission targeted and the labels of the specific leaves claimed,
// resolved fresh since the graph can change after the fact. A Proof screenshot
// (no claims) names its own Tile and Task; `proof` spreads its kind into the
// entry's details, and `label` is the entry's label.
export function describeSubmissionTarget(
  tx: Tx,
  bingoId: string,
  nodeIds: string[],
  submission?: Pick<typeof submissions.$inferSelect, "kind" | "proofTileId" | "proofTaskId">,
): { tileName: string | null; taskLabels: string[]; label: string | null; proof: { kind?: "proof" } } {
  if (submission?.kind === "proof") {
    const tileName = submission.proofTileId ? (tx.select({ name: tiles.name }).from(tiles).where(eq(tiles.id, submission.proofTileId)).get()?.name ?? null) : null;
    const task = submission.proofTaskId ? tx.select({ label: nodes.label }).from(nodes).where(eq(nodes.id, submission.proofTaskId)).get() : undefined;
    return { tileName, taskLabels: task?.label ? [task.label] : [], label: `Proof screenshot · ${tileName ?? "a tile"}`, proof: { kind: "proof" } };
  }
  const tileRows = tx.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const tileName = nodeIds.length ? (tileForLeaf(tx, nodeIds[0]!, tileByNodeId)?.name ?? null) : null;
  const leafRows = nodeIds.length ? tx.select({ id: nodes.id, label: nodes.label }).from(nodes).where(inArray(nodes.id, nodeIds)).all() : [];
  return { tileName, taskLabels: leafRows.map((n) => n.label).filter((l): l is string => !!l), label: tileName, proof: {} };
}

export function lineLabel(line: { lineType: string; lineIndex: number }): string {
  if (line.lineType === "row") return `Row ${line.lineIndex + 1}`;
  if (line.lineType === "column") return `Column ${line.lineIndex + 1}`;
  if (line.lineType === "diagonal") return `Diagonal ${line.lineIndex + 1}`;
  return "a custom line";
}

// Writes a points.earned / points.lost row for every node whose awarded points changed, so the
// activity feed shows what kind of points moved and for what. Called AFTER the submission's own
// audit row, so the log is in causal order (the approval, then the points it awarded: tasks, then the
// tile bonus, then lines) and a newest-first feed lists the points above the approval. A
// node's points can change without it newly completing (a points gate opening releases a task's
// withheld points), hence the comparison of awarded points rather than of completed nodes.
export function recordPointChanges(
  tx: Tx,
  params: { bingoId: string; teamId: string; submissionId: string; reviewerUserId: string },
  before: { nodeId: string; pointsAwarded: number }[],
  after: Map<string, { pointsAwarded: number }>,
): void {
  const beforeById = new Map(before.map((r) => [r.nodeId, r.pointsAwarded]));
  const changed = [...new Set([...beforeById.keys(), ...after.keys()])]
    .map((nodeId) => ({ nodeId, delta: (after.get(nodeId)?.pointsAwarded ?? 0) - (beforeById.get(nodeId) ?? 0) }))
    .filter((c) => c.delta !== 0);
  if (changed.length === 0) return;

  const tileByNodeId = new Map(tx.select().from(tiles).where(eq(tiles.bingoId, params.bingoId)).all().map((t) => [t.nodeId, t]));
  const lineByNodeId = new Map(tx.select().from(bingoLines).where(eq(bingoLines.bingoId, params.bingoId)).all().map((l) => [l.nodeId, l]));
  const nodeRows = new Map(tx.select({ id: nodes.id, label: nodes.label, itemName: nodes.itemName }).from(nodes).where(inArray(nodes.id, changed.map((c) => c.nodeId))).all().map((n) => [n.id, n]));

  const rows = changed.map(({ nodeId, delta }) => {
    const tile = tileByNodeId.get(nodeId);
    const line = lineByNodeId.get(nodeId);
    if (tile) return { order: 1, delta, details: { source: "tile_bonus" as const, nodeId, nodeLabel: tile.name, tileName: tile.name } };
    if (line) return { order: 2, delta, details: { source: "line" as const, nodeId, nodeLabel: lineLabel(line), tileName: null } };
    const node = nodeRows.get(nodeId);
    return { order: 0, delta, details: { source: "task" as const, nodeId, nodeLabel: node?.label ?? node?.itemName ?? "a task", tileName: tileForLeaf(tx, nodeId, tileByNodeId)?.name ?? null } };
  });
  // Tasks, then tile bonuses, then lines (stable within each kind, so the order is deterministic).
  rows.sort((a, b) => a.order - b.order);

  for (const { delta, details } of rows) {
    audit(tx, {
      action: delta > 0 ? "points.earned" : "points.lost",
      bingoId: params.bingoId,
      entity: { type: "node", id: details.nodeId, label: details.nodeLabel },
      teamId: params.teamId,
      details: { ...details, points: Math.abs(delta), submissionId: params.submissionId },
      actor: { userId: params.reviewerUserId },
    });
  }
}

// Distinct leaf nodes a submission's claims target.
export function getSubmissionNodeIds(tx: Tx, submissionId: string): string[] {
  const rows = tx.select({ nodeId: claims.nodeId }).from(claims).where(eq(claims.submissionId, submissionId)).all();
  return [...new Set(rows.map((r) => r.nodeId))];
}

/**
 * What rebuildTeamState would store for a team, without writing it: every node complete for the team, with the points
 * it awards. `board` scores it against another copy of the board, such as the Draft board for a Publish preview
 * (boardDraftService): only Claims on nodes that board still has count, under that board's Exclusive Item rules.
 * `exceptSubmissionId` scores it as if that submission weren't approved (an edit's submit gate check).
 */
export function scoreTeam(
  tx: Tx,
  teamId: string,
  board?: { t: BoardTables; exclusivityRulesJson: string },
  exceptSubmissionId?: string,
): Map<string, { completedAt: Date; pointsAwarded: number }> {
  const team = tx.select({ bingoId: teams.bingoId }).from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new ServiceError(404, "Team not found");

  const { engineNodes, childrenOf, nodesById } = getFullGraph(tx, team.bingoId, board?.t ?? PUBLISHED_BOARD);
  const claimed = getApprovedClaims(tx, teamId, team.bingoId, exceptSubmissionId).filter((c) => !board || nodesById.has(c.nodeId));
  const approvedClaims = applyExclusivity(tx, team.bingoId, claimed, board);
  const results = evaluateGraph(engineNodes, childrenOf, approvedClaims);

  const newState = new Map<string, { completedAt: Date; pointsAwarded: number }>();
  for (const node of engineNodes) {
    const r = results.get(node.id);
    if (r?.complete && r.completedAt) {
      newState.set(node.id, { completedAt: r.completedAt, pointsAwarded: awardedPoints(node.id, results, nodesById) });
    }
  }
  return newState;
}

// Re-evaluates the whole bingo's graph against a team's approved claims and
// overwrites teamNodeState with exactly the currently-complete nodes. This is
// a full recompute, not an incremental patch — see docs/node-graph-model.md
// §5. Returns the new state so callers can diff against what was there
// before (e.g. to report what an approval newly completed).
export function rebuildTeamState(tx: Tx, teamId: string): Map<string, { completedAt: Date; pointsAwarded: number }> {
  const newState = scoreTeam(tx, teamId);
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
    rescoreBingoTx(tx, bingoId);
  });
}

/** rescoreBingo inside the caller's transaction (a Publish), returning each team's node points before and after. */
export function rescoreBingoTx(tx: Tx, bingoId: string): { teamId: string; before: number; after: number }[] {
  const changes: { teamId: string; before: number; after: number }[] = [];
  for (const team of tx.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.bingoId, bingoId)).all()) {
    const before = tx.select().from(teamNodeState).where(eq(teamNodeState.teamId, team.id)).all().reduce((sum, r) => sum + r.pointsAwarded, 0);
    const after = [...rebuildTeamState(tx, team.id).values()].reduce((sum, s) => sum + s.pointsAwarded, 0);
    changes.push({ teamId: team.id, before, after });
    if (after === before) continue;
    audit(tx, {
      action: "points.rescored",
      bingoId,
      entity: { type: "team", id: team.id, label: team.name },
      teamId: team.id,
      details: { delta: after - before },
    });
  }
  return changes;
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
      .set({ status: "approved", reviewedAt: clockNow(), reviewedByUserId: params.reviewedByUserId, reviewerNotes: params.reviewerNotes ?? null, updatedAt: clockNow() })
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

    const { tileName, taskLabels, label, proof } = describeSubmissionTarget(tx, team.bingoId, nodeIds, submission);
    audit(tx, {
      action: "submission.approved",
      bingoId: team.bingoId,
      entity: { type: "submission", id: submission.id, label },
      teamId: submission.teamId,
      details: { ...proof, tileName, taskLabels, nodeIds, newlyCompletedNodeIds, pointsDelta, reviewerNotes: params.reviewerNotes ?? null, submittedByUserId: submission.submittedByUserId },
      actor: { userId: params.reviewedByUserId },
    });
    recordPointChanges(tx, { bingoId: team.bingoId, teamId: submission.teamId, submissionId: submission.id, reviewerUserId: params.reviewedByUserId }, before, after);

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
      .set({ status: "rejected", reviewedAt: clockNow(), reviewedByUserId: params.reviewedByUserId, reviewerNotes: params.reviewerNotes ?? null, updatedAt: clockNow() })
      .where(eq(submissions.id, submission.id))
      .run();

    const nodeIds = getSubmissionNodeIds(tx, submission.id);
    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;

    const { tileName, taskLabels, label, proof } = describeSubmissionTarget(tx, team.bingoId, nodeIds, submission);
    audit(tx, {
      action: "submission.rejected",
      bingoId: team.bingoId,
      entity: { type: "submission", id: submission.id, label },
      teamId: submission.teamId,
      details: { ...proof, tileName, taskLabels, nodeIds, reviewerNotes: params.reviewerNotes ?? null, submittedByUserId: submission.submittedByUserId },
      actor: { userId: params.reviewedByUserId },
    });

    return { submission: updatedSubmission, nodeIds };
  });
}
