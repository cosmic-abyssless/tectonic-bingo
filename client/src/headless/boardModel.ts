// Pure builders that turn raw server shapes into the view models in
// ./types.ts. No React, no hooks — safe to call from anywhere, including
// providers and (if ever wanted) tests. See docs/headless-theming-plan.md §2.
import { isBoardLocked, type BoardLine, type GraphNode, type NodeStatus, type Stage, type SubmissionDetails, type TeamNodeState, type TeamWithMembers, type Tile, type TileCategory } from "@bingo/shared";
import { summarizeTileProgress, getFreezeUnlockAt, groupSubmissionsByTile, type TileProgressSummary } from "../core/board/tileProgress";
import { buildLeafClaimMaps, itemLeafValue, leafComplete, type LeafClaimMaps } from "../core/board/taskClaims";
import { collectLeaves, conditionHeading } from "../core/board/requirementTree";
import { leafLabel } from "../core/board/labels";
import { claimsSummary } from "../core/submissions/claimsSummary";
import { timeAgo } from "../core/ui/time";
import { avatarUrl, displayName } from "../core/ui/user";
import type { BoardModel, CategoryModel, LineModel, RequirementNodeModel, SubmissionModel, TaskModel, TeamModel, TileModel } from "./types";

// Moved from BoardGrid.tsx, unchanged.
export function getRowCategory(tiles: Tile[], categories: TileCategory[], row: number): TileCategory | null {
  const rowTiles = tiles.filter((t) => t.boardRow === row);
  const catIds = new Set(rowTiles.map((t) => t.categoryId).filter((id): id is string => id !== null));
  if (catIds.size !== 1) return null;
  return categories.find((c) => c.id === [...catIds][0]) ?? null;
}

export function toCategoryModel(category: TileCategory): CategoryModel {
  return { id: category.id, label: category.label, color: category.colorHex, sortOrder: category.sortOrder };
}

export function toTeamModel(team: TeamWithMembers, myTeamId: string | null, viewerUserId: string, stage: Stage): TeamModel {
  const isLead = team.members.some((m) => m.user.id === viewerUserId && (m.isCaptain || m.isCoCaptain));
  return {
    id: team.id,
    name: team.name,
    color: team.color,
    isMine: team.id === myTeamId,
    members: team.members.map((m) => ({ id: m.user.id, displayName: displayName(m.user), avatarUrl: avatarUrl(m.user), isCaptain: m.isCaptain, isCoCaptain: m.isCoCaptain })),
    isLead,
    // Mirrors the captain rename route: names freeze once the bingo is live.
    canRename: isLead && !isBoardLocked(stage),
  };
}

// Ports TaskPanel.tsx's LeafRow/SumRow/RequirementTree rules 1:1: a leaf's
// own `notNeeded` is whatever its enclosing composite passed down (it never
// inspects its own ancestors), while a composite computes its own
// completion from `statusByNodeId` and folds that into what it passes its
// children. Returns null for MANUAL, matching the original.
export function buildRequirementTree(
  node: GraphNode,
  maps: LeafClaimMaps,
  statusByNodeId: Map<string, NodeStatus>,
  ancestorSatisfied = false,
): RequirementNodeModel | null {
  if (node.kind === "MANUAL") return null;

  if (node.kind === "ITEM") {
    const complete = leafComplete(node.id, maps);
    return {
      id: node.id,
      kind: node.kind,
      label: leafLabel(node),
      isLeaf: true,
      status: statusByNodeId.get(node.id) ?? "not_started",
      complete,
      submitted: maps.submittedNodeIds.has(node.id),
      notNeeded: ancestorSatisfied,
      dim: complete || ancestorSatisfied,
      progress: null,
      showHeading: false,
      children: [],
    };
  }

  if (node.kind === "SUM") {
    const target = node.quantity ?? 1;
    const progress = node.children.reduce((sum, child) => sum + itemLeafValue(child.id, maps), 0);
    const complete = progress >= target;
    return {
      id: node.id,
      kind: node.kind,
      label: leafLabel(node),
      isLeaf: true,
      status: statusByNodeId.get(node.id) ?? "not_started",
      complete,
      submitted: node.children.some((child) => maps.submittedNodeIds.has(child.id)),
      notNeeded: ancestorSatisfied,
      dim: complete || ancestorSatisfied,
      progress: { current: progress, target },
      showHeading: false,
      children: [],
    };
  }

  // ALL/ANY/COUNT.
  const nodeComplete = statusByNodeId.get(node.id) === "completed";
  const childAncestorSatisfied = ancestorSatisfied || nodeComplete;
  const children = node.children
    .map((child) => buildRequirementTree(child, maps, statusByNodeId, childAncestorSatisfied))
    .filter((c): c is RequirementNodeModel => c !== null);

  return {
    id: node.id,
    kind: node.kind,
    label: conditionHeading(node),
    isLeaf: false,
    status: statusByNodeId.get(node.id) ?? "not_started",
    complete: nodeComplete,
    submitted: false,
    notNeeded: ancestorSatisfied,
    dim: false,
    progress: null,
    showHeading: true,
    children,
  };
}

// Ports TileModal.tsx's gate/lock loop + SubmissionModal's getAvailableTasks
// semantics (available = not complete and not locked).
export function buildTaskModels(tile: Tile, summary: TileProgressSummary, maps: LeafClaimMaps): TaskModel[] {
  const tasks = tile.node.children;
  return tasks.map((task) => {
    const gate = task.submitGateNodeId ? tasks.find((t) => t.id === task.submitGateNodeId) : undefined;
    const locked = gate ? summary.statusByNodeId.get(gate.id) !== "completed" : false;
    const complete = summary.statusByNodeId.get(task.id) === "completed";
    const isManual = task.kind === "MANUAL";
    return {
      id: task.id,
      label: task.label,
      description: task.description,
      notes: task.notes,
      points: task.points,
      kind: task.kind,
      isManual,
      allowsPreLoad: task.allowsPreLoad,
      status: summary.statusByNodeId.get(task.id) ?? "not_started",
      complete,
      locked,
      lockedReason: locked && gate ? `${task.label} cannot be submitted until ${gate.label} is completed.` : null,
      available: !complete && !locked,
      tree: isManual ? null : buildRequirementTree(task, maps, summary.statusByNodeId),
    };
  });
}

// Ports TeamSubmissionsList's taskLookup + TileModal's taskLabelByLeafId into
// one shared shape for both the drawer and a tile's own submissions list.
// Task labels are deduped per submission (TileModal's original behavior);
// newest first.
export function buildSubmissionModels(tiles: Tile[], submissions: SubmissionDetails[]): SubmissionModel[] {
  const taskLookup = new Map<string, { tile: Tile; taskLabel: string }>();
  for (const tile of tiles) {
    for (const task of tile.node.children) {
      for (const leaf of collectLeaves(task)) {
        taskLookup.set(leaf.id, { tile, taskLabel: task.label ?? "" });
      }
    }
  }

  const sorted = [...submissions].sort((a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime());

  return sorted.map((detail) => {
    const infos = [...new Set(detail.claims.map((c) => c.nodeId))].map((id) => taskLookup.get(id)).filter((i): i is { tile: Tile; taskLabel: string } => !!i);
    const taskLabels = [...new Set(infos.map((i) => i.taskLabel))];
    return {
      id: detail.submission.id,
      status: detail.submission.status,
      submittedAt: detail.submission.submittedAt,
      timeAgo: timeAgo(detail.submission.submittedAt),
      thumbnailUrl: detail.screenshots[0]?.storageUrl ?? null,
      summary: claimsSummary(detail.claims),
      submittedBy: detail.submittedByUser ? displayName(detail.submittedByUser) : null,
      reviewerNotes: detail.submission.reviewerNotes,
      tileId: infos[0]?.tile.id ?? null,
      tileName: infos[0]?.tile.name ?? null,
      taskLabels,
      detail,
    };
  });
}

// BoardLine.node.children are the tile ROOT NODE ids (tile.nodeId), not tile
// row ids — `tiles` is needed to map back to the Tile.id a TileModel is keyed by.
export function buildLineModels(lines: BoardLine[], tiles: Tile[], nodeStates: TeamNodeState[]): LineModel[] {
  const tileIdByNodeId = new Map(tiles.map((t) => [t.nodeId, t.id]));
  const stateByNodeId = new Map(nodeStates.map((s) => [s.nodeId, s]));
  return lines.map((line) => {
    const state = stateByNodeId.get(line.nodeId);
    return {
      id: line.id,
      lineType: line.lineType,
      lineIndex: line.lineIndex,
      tileIds: line.node.children.map((c) => tileIdByNodeId.get(c.id)).filter((id): id is string => !!id),
      points: line.node.points,
      complete: !!state,
      pointsAwarded: state?.pointsAwarded ?? 0,
    };
  });
}

// The "static" half of a TileModel — everything that only depends on
// tiles/categories/nodeStates/teamSubmissions/bingoStartsAt, not on `now`,
// search, or canSubmit. Call once via useMemo keyed on those data
// references; finalizeTileModels() is the cheap per-tick pass on top.
export type StaticTileModel = Omit<TileModel, "dimmed" | "canSubmit" | "freeze"> & {
  freezeUnlocksAt: number | null;
  hasFreezePeriod: boolean;
  freezeDurationMinutes: number;
};

export function buildTileModelsStatic(args: {
  tiles: Tile[];
  categories: TileCategory[];
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
  bingoStartsAt: string | null;
}): StaticTileModel[] {
  const { tiles, categories, nodeStates, teamSubmissions, bingoStartsAt } = args;
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const claimMaps = buildLeafClaimMaps(teamSubmissions);

  const submissionIdsByTile = new Map<string, Set<string>>();
  for (const [tileId, list] of groupSubmissionsByTile(tiles, teamSubmissions)) {
    submissionIdsByTile.set(tileId, new Set(list.map((d) => d.submission.id)));
  }
  const allSubmissionModels = buildSubmissionModels(tiles, teamSubmissions);

  return tiles.map((tile) => {
    const categoryRow = tile.categoryId ? categoryById.get(tile.categoryId) : undefined;
    const category = categoryRow ? toCategoryModel(categoryRow) : null;
    const summary = summarizeTileProgress(tile, nodeStates, teamSubmissions);
    const freezeUnlocksAt = getFreezeUnlockAt(bingoStartsAt, tile);
    const submissionIds = submissionIdsByTile.get(tile.id);

    return {
      id: tile.id,
      name: tile.name,
      imageUrl: tile.imageUrl,
      row: tile.boardRow,
      col: tile.boardCol,
      category,
      accentColor: category?.color ?? null,
      progress: {
        completedTasks: summary.completedTasks,
        totalTasks: summary.totalTasks,
        pointsAwarded: summary.pointsAwarded,
        totalPoints: summary.totalPoints,
        allComplete: summary.allComplete,
      },
      taskStatuses: tile.node.children.map((task, i) => ({
        id: task.id,
        index: i,
        label: task.label ?? "",
        status: summary.statusByNodeId.get(task.id) ?? "not_started",
      })),
      tasks: buildTaskModels(tile, summary, claimMaps),
      submissions: submissionIds ? allSubmissionModels.filter((s) => submissionIds.has(s.id)) : [],
      freezeUnlocksAt,
      hasFreezePeriod: tile.hasFreezePeriod,
      freezeDurationMinutes: tile.freezeDurationMinutes,
    };
  });
}

// The cheap per-tick pass: only `now`, `matchIds` (search), and `canSubmit`
// can change here. Preserves the previous TileModel's object identity for
// any tile whose derived (isFrozen, remainingMs, dimmed, canSubmit) is
// unchanged from last call, so React.memo(TileCell) only re-renders frozen
// cells each tick. `staticTiles` must be the SAME array across calls in one
// tick loop (i.e. built once via useMemo) for the identity check to mean
// anything — it's keyed on `progress` object reference as a stand-in for
// "same static snapshot", since buildTileModelsStatic always creates every
// field of one tile together in a single pass.
export function finalizeTileModels(staticTiles: StaticTileModel[], now: number, matchIds: Set<string> | null, canSubmit: boolean, prev: ReadonlyMap<string, TileModel>): TileModel[] {
  return staticTiles.map((s) => {
    const isFrozen = !!(s.freezeUnlocksAt && now < s.freezeUnlocksAt);
    const remainingMs = s.freezeUnlocksAt ? s.freezeUnlocksAt - now : 0;
    const dimmed = matchIds !== null && !matchIds.has(s.id);
    const tileCanSubmit = canSubmit && !s.progress.allComplete && !isFrozen;

    const prevModel = prev.get(s.id);
    if (
      prevModel &&
      prevModel.progress === s.progress &&
      prevModel.freeze.isFrozen === isFrozen &&
      prevModel.freeze.remainingMs === remainingMs &&
      prevModel.dimmed === dimmed &&
      prevModel.canSubmit === tileCanSubmit
    ) {
      return prevModel;
    }

    const { freezeUnlocksAt, hasFreezePeriod, freezeDurationMinutes, ...rest } = s;
    return {
      ...rest,
      freeze: { hasFreezePeriod, durationMinutes: freezeDurationMinutes, unlocksAt: freezeUnlocksAt, isFrozen, remainingMs },
      dimmed,
      canSubmit: tileCanSubmit,
    };
  });
}

export function buildBoard(args: {
  tiles: Tile[];
  categories: TileCategory[];
  lines: BoardLine[];
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
  bingoStartsAt: string | null;
  bingoRows: number;
  bingoCols: number;
  now: number;
  matchIds: Set<string> | null;
  canSubmit: boolean;
  totalPoints: number | null;
  prev: ReadonlyMap<string, TileModel>;
}): BoardModel {
  const { tiles, categories, lines, nodeStates, teamSubmissions, bingoStartsAt, bingoRows, bingoCols, now, matchIds, canSubmit, totalPoints, prev } = args;

  const staticTiles = buildTileModelsStatic({ tiles, categories, nodeStates, teamSubmissions, bingoStartsAt });
  const finalized = finalizeTileModels(staticTiles, now, matchIds, canSubmit, prev);

  const grid: (TileModel | null)[][] = Array.from({ length: bingoRows }, () => Array.from({ length: bingoCols }, () => null));
  const tileById = new Map<string, TileModel>();
  for (const tile of finalized) {
    tileById.set(tile.id, tile);
    if (tile.row >= 0 && tile.row < bingoRows && tile.col >= 0 && tile.col < bingoCols) grid[tile.row]![tile.col] = tile;
  }

  const rowCategories = Array.from({ length: bingoRows }, (_, row) => {
    const rowCategoryRow = getRowCategory(tiles, categories, row);
    return rowCategoryRow ? toCategoryModel(rowCategoryRow) : null;
  });

  const startMs = bingoStartsAt ? new Date(bingoStartsAt).getTime() : null;
  const isPreStart = startMs !== null && now < startMs;

  return {
    rows: bingoRows,
    cols: bingoCols,
    grid,
    tiles: finalized,
    tileById,
    rowCategories,
    showRowLabels: rowCategories.some((c) => c !== null),
    lines: buildLineModels(lines, tiles, nodeStates),
    now,
    preStart: { isPreStart, startsAt: startMs },
    totalPoints,
  };
}
