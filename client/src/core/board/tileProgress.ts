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
// completedNodeIds is "completed"; any other node is "pending_approval" if any
// leaf beneath it has a pending claim, else "in_progress" if any has an
// approved one, else "not_started". (Read off the leaves, not the children's
// statuses: a leaf that's already complete reports "completed", which would
// hide the claim that got it there from the part above it.)
function deriveNodeStatuses(
  node: GraphNode,
  completedNodeIds: Set<string>,
  pendingLeafIds: Set<string>,
  approvedLeafIds: Set<string>,
  out: Map<string, NodeStatus>,
): { hasPending: boolean; hasApproved: boolean } {
  // Children are visited even when this node is complete: a finished tile's
  // root is completed, but its tasks still need their own statuses.
  let hasPending = false;
  let hasApproved = false;
  if (node.kind === "ITEM" || node.kind === "MANUAL") {
    hasPending = pendingLeafIds.has(node.id);
    hasApproved = approvedLeafIds.has(node.id);
  }
  for (const child of node.children) {
    const c = deriveNodeStatuses(child, completedNodeIds, pendingLeafIds, approvedLeafIds, out);
    hasPending ||= c.hasPending;
    hasApproved ||= c.hasApproved;
  }
  out.set(node.id, completedNodeIds.has(node.id) ? "completed" : hasPending ? "pending_approval" : hasApproved ? "in_progress" : "not_started");
  return { hasPending, hasApproved };
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
