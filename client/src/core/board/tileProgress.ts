import type { GraphNode, NodeStatus, SubmissionDetails, Tile, TeamNodeState } from "@bingo/shared";
import { collectLeaves } from "./requirementTree";

export interface TileProgressSummary {
  completedTasks: number;
  totalTasks: number;
  pointsAwarded: number;
  totalPoints: number;
  allComplete: boolean;
  /** Points the tile's own root node awarded (its full-completion bonus). */
  bonusAwarded: number;
  /** Points each completed node awarded, by node id. */
  pointsByNodeId: Map<string, number>;
  statusByNodeId: Map<string, NodeStatus>;
}

function buildClaimNodeIdSets(teamSubmissions: SubmissionDetails[]): { pendingLeafIds: Set<string>; approvedLeafIds: Set<string> } {
  const pendingLeafIds = new Set<string>();
  const approvedLeafIds = new Set<string>();
  for (const d of teamSubmissions) {
    const target = d.submission.status === "pending" ? pendingLeafIds : d.submission.status === "approved" ? approvedLeafIds : null;
    if (!target) continue;
    for (const c of d.claims) target.add(c.nodeId);
  }
  return { pendingLeafIds, approvedLeafIds };
}

// Bottom-up, mirroring server boardService.getTeamNodeStatuses: a node in
// completedNodeIds is "completed"; a leaf's status otherwise comes from
// whether it has a pending or approved claim; a composite's status is the
// most "active" of its children's (pending_approval > in_progress > not_started).
function deriveNodeStatuses(
  node: GraphNode,
  completedNodeIds: Set<string>,
  pendingLeafIds: Set<string>,
  approvedLeafIds: Set<string>,
  out: Map<string, NodeStatus>,
): NodeStatus {
  // Children are visited even when this node is complete: a finished tile's
  // root is completed, but its tasks still need their own statuses.
  const childStatuses = node.children.map((c) => deriveNodeStatuses(c, completedNodeIds, pendingLeafIds, approvedLeafIds, out));
  let status: NodeStatus;
  if (completedNodeIds.has(node.id)) {
    status = "completed";
  } else if (node.kind === "ITEM" || node.kind === "MANUAL") {
    status = pendingLeafIds.has(node.id) ? "pending_approval" : approvedLeafIds.has(node.id) ? "in_progress" : "not_started";
  } else {
    status = childStatuses.includes("pending_approval") ? "pending_approval" : childStatuses.includes("in_progress") ? "in_progress" : "not_started";
  }
  out.set(node.id, status);
  return status;
}

// Same derivation as summarizeTileProgress, merged across every tile — for
// UI that picks among tasks on any tile (SubmissionModal) rather than
// rendering one tile at a time. Node ids are globally unique so the merge
// can't collide across tiles.
export function deriveBoardNodeStatuses(tiles: Tile[], nodeStates: TeamNodeState[], teamSubmissions: SubmissionDetails[]): Map<string, NodeStatus> {
  const completedNodeIds = new Set(nodeStates.map((s) => s.nodeId));
  const { pendingLeafIds, approvedLeafIds } = buildClaimNodeIdSets(teamSubmissions);
  const out = new Map<string, NodeStatus>();
  for (const tile of tiles) deriveNodeStatuses(tile.node, completedNodeIds, pendingLeafIds, approvedLeafIds, out);
  return out;
}

// Takes the whole team's node states/submissions (not pre-filtered to this
// tile) — cheap at this board's scale, and correct without needing a
// leaf-to-tile lookup, since the recursion only ever visits this tile's own
// subtree.
export function summarizeTileProgress(tile: Tile, nodeStates: TeamNodeState[], teamSubmissions: SubmissionDetails[]): TileProgressSummary {
  const completedNodeIds = new Set(nodeStates.map((s) => s.nodeId));
  const pointsByNodeId = new Map(nodeStates.map((s) => [s.nodeId, s.pointsAwarded]));
  const { pendingLeafIds, approvedLeafIds } = buildClaimNodeIdSets(teamSubmissions);
  const statusByNodeId = new Map<string, NodeStatus>();
  deriveNodeStatuses(tile.node, completedNodeIds, pendingLeafIds, approvedLeafIds, statusByNodeId);

  const tasks = tile.node.children;
  let completedTasks = 0;
  let pointsAwarded = 0;
  // tile.node.points is the full-tile-completion bonus (0 unless a mod set
  // one) — the tile's own root node, awarded once every task above completes.
  const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0) + tile.node.points;
  for (const task of tasks) {
    if (statusByNodeId.get(task.id) === "completed") completedTasks++;
    pointsAwarded += pointsByNodeId.get(task.id) ?? 0;
  }
  pointsAwarded += pointsByNodeId.get(tile.node.id) ?? 0;

  return {
    completedTasks,
    totalTasks: tasks.length,
    pointsAwarded,
    totalPoints,
    allComplete: tasks.length > 0 && completedTasks === tasks.length,
    bonusAwarded: pointsByNodeId.get(tile.node.id) ?? 0,
    pointsByNodeId,
    statusByNodeId,
  };
}

export function getFreezeUnlockAt(bingoStartsAt: string | null, tile: Tile): number | null {
  if (!tile.hasFreezePeriod || !bingoStartsAt) return null;
  return new Date(bingoStartsAt).getTime() + tile.freezeDurationMinutes * 60_000;
}

function leafToTileMap(tiles: Tile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tile of tiles) for (const leaf of collectLeaves(tile.node)) map.set(leaf.id, tile.id);
  return map;
}

// For display only (e.g. TileModal's "past submissions" list) — a submission
// belongs to a tile if any of its claims target a leaf under that tile.
export function groupSubmissionsByTile(tiles: Tile[], submissions: SubmissionDetails[]): Map<string, SubmissionDetails[]> {
  const leafToTile = leafToTileMap(tiles);
  const map = new Map<string, SubmissionDetails[]>();
  for (const s of submissions) {
    const tileIds = new Set(s.claims.map((c) => leafToTile.get(c.nodeId)).filter((id): id is string => !!id));
    for (const tileId of tileIds) {
      const list = map.get(tileId) ?? [];
      list.push(s);
      map.set(tileId, list);
    }
  }
  return map;
}
