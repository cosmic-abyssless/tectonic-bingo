import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput, NodeStatus, SealedBoardResponse } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, submissions, teamNodeState, tileInterests } from "../db/schema";
import { ServiceError } from "./errors";
import { deleteNode, deleteSubtree, getFullGraph, getNodeTree, getNodeTrees, insertSubtree, replaceSubtree } from "./graphService";
import { audit, diffFields, markAuditedNoop, markUnchanged } from "../audit/record";
import { describeTaskNode } from "../audit/describe";
import { areTilesSealed, canViewTiles } from "./bingoService";
import { PUBLISHED_BOARD, type BoardTables } from "./boardTables";
import { tileSearchTags } from "./tagService";
import { rescoreBingo } from "./scoringService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Bingo = typeof schema.bingos.$inferSelect;
type TileRow = BoardTables["tiles"]["$inferSelect"];
type LineRow = BoardTables["bingoLines"]["$inferSelect"];

// Every board function takes the table set it works on (boardTables.ts): the Published board unless told otherwise.
// A Draft board edit is seen by Admins only, so it isn't audited on its own: its Publish is (boardDraftService).
function auditBoard<A extends Parameters<typeof audit>[1]["action"]>(tx: Tx, t: BoardTables, input: Parameters<typeof audit<A>>[1]): void {
  if (t.draft) markAuditedNoop();
  else audit(tx, input);
}

// A task is a node that's a direct child of its tile's node (see the module
// comment above createTask) — so the owning tile is one edge-hop up.
function tileForTaskNode(tx: Tx, taskNodeId: string, t: BoardTables): TileRow | null {
  const { nodeEdges, tiles } = t;
  const edge = tx.select({ parentId: nodeEdges.parentId }).from(nodeEdges).where(eq(nodeEdges.childId, taskNodeId)).get();
  if (!edge) return null;
  return tx.select().from(tiles).where(eq(tiles.nodeId, edge.parentId)).get() ?? null;
}

export function getCategories(db: Db, bingoId: string, t: BoardTables = PUBLISHED_BOARD) {
  const { tileCategories } = t;
  return db.select().from(tileCategories).where(eq(tileCategories.bingoId, bingoId)).orderBy(tileCategories.sortOrder).all();
}

// Full tile -> node tree (tasks are just the node's children) for one bingo.
export function getBoardTiles(db: Db, bingoId: string, t: BoardTables = PUBLISHED_BOARD) {
  const { tiles } = t;
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  if (tileRows.length === 0) return [];

  const trees = getNodeTrees(db, tileRows.map((tile) => tile.nodeId), t);
  return tileRows.map((tile) => ({ ...tile, node: trees.get(tile.nodeId)! }));
}

export function getBoardLines(db: Db, bingoId: string, t: BoardTables = PUBLISHED_BOARD) {
  const { bingoLines } = t;
  const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
  const trees = getNodeTrees(db, lineRows.map((l) => l.nodeId), t);
  return lineRows.map((line) => ({ ...line, node: trees.get(line.nodeId)! }));
}

// GET /:slug/board: the board as one viewer may see it. Nothing before the reveal for a player; while the Tiles
// are sealed, only the sealed board; otherwise the full board. Whoever may see the hidden Board (view_hidden_board:
// mods) always gets the full board.
export function getBoardForViewer(db: Db, bingo: Bingo, seesHiddenBoard: boolean) {
  if (!canViewTiles(bingo, seesHiddenBoard)) return { sealed: false as const, tiles: [], lines: [], tileTags: {} };
  if (!seesHiddenBoard && areTilesSealed(bingo)) return getSealedBoard(db, bingo.id);
  // Tags ride along for the board's search, which runs in the browser; the sealed board above has none.
  return { sealed: false as const, tiles: getBoardTiles(db, bingo.id), lines: getBoardLines(db, bingo.id), tileTags: tileSearchTags(db, bingo.id) };
}

// The board as Players and Captains get it while the Tiles are sealed (CONTEXT.md "Sealed Tiles"): only what a
// sealed board shows. Each field is picked, never left over from deleting the rest, so a field added to tiles or
// lines later can't leak into it: no node trees, notes, item names or points, and a line is just the tiles it
// runs through.
export function getSealedBoard(db: Db, bingoId: string): SealedBoardResponse {
  const { tiles, bingoLines, nodeEdges } = PUBLISHED_BOARD;
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileIdByNodeId = new Map(tileRows.map((tile) => [tile.nodeId, tile.id]));
  const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
  // A line's node children are its tiles' root nodes.
  const edges = lineRows.length
    ? db
        .select({ parentId: nodeEdges.parentId, childId: nodeEdges.childId })
        .from(nodeEdges)
        .where(inArray(nodeEdges.parentId, lineRows.map((l) => l.nodeId)))
        .orderBy(nodeEdges.sortOrder)
        .all()
    : [];
  const lineTileIds = (lineNodeId: string) =>
    edges
      .filter((e) => e.parentId === lineNodeId)
      .map((e) => tileIdByNodeId.get(e.childId))
      .filter((id): id is string => !!id);
  return {
    sealed: true,
    tiles: tileRows.map((tile) => ({
      id: tile.id,
      name: tile.name,
      imageUrl: tile.imageUrl,
      categoryId: tile.categoryId,
      boardRow: tile.boardRow,
      boardCol: tile.boardCol,
      hasFreezePeriod: tile.hasFreezePeriod,
      freezeDurationMinutes: tile.freezeDurationMinutes,
    })),
    lines: lineRows.map((l) => ({ id: l.id, lineType: l.lineType, lineIndex: l.lineIndex, tileIds: lineTileIds(l.nodeId) })),
  };
}

export function getTileById(db: Db, tileId: string, t: BoardTables = PUBLISHED_BOARD) {
  const { tiles } = t;
  return db.select().from(tiles).where(eq(tiles.id, tileId)).get();
}

// Per-node soft status for one team, derived at read time (never stored —
// see docs/node-graph-model.md §5): completed nodes come from teamNodeState;
// everything else is derived from whether any leaf in the node's subtree has
// a pending or approved claim.
export function getTeamNodeStatuses(db: Db, teamId: string, bingoId: string): Map<string, NodeStatus> {
  const { engineNodes, childrenOf, nodesById } = getFullGraph(db, bingoId);

  const completedIds = new Set(db.select({ nodeId: teamNodeState.nodeId }).from(teamNodeState).where(eq(teamNodeState.teamId, teamId)).all().map((r) => r.nodeId));
  const claimNodeIds = (status: "pending" | "approved") =>
    new Set(
      db
        .select({ nodeId: claims.nodeId })
        .from(claims)
        .innerJoin(submissions, eq(claims.submissionId, submissions.id))
        .where(and(eq(submissions.teamId, teamId), eq(submissions.status, status)))
        .all()
        .map((r) => r.nodeId),
    );
  const pendingLeafIds = claimNodeIds("pending");
  const approvedLeafIds = claimNodeIds("approved");

  const leafSetCache = new Map<string, Set<string>>();
  function leafSet(nodeId: string): Set<string> {
    const cached = leafSetCache.get(nodeId);
    if (cached) return cached;
    const node = nodesById.get(nodeId);
    const set = new Set<string>();
    leafSetCache.set(nodeId, set); // pre-register to survive a cycle, defensively (invariant forbids one)
    if (node?.kind === "ITEM" || node?.kind === "MANUAL") {
      set.add(nodeId);
    } else {
      for (const childId of childrenOf.get(nodeId) ?? []) for (const id of leafSet(childId)) set.add(id);
    }
    return set;
  }

  const statuses = new Map<string, NodeStatus>();
  for (const node of engineNodes) {
    if (completedIds.has(node.id)) {
      statuses.set(node.id, "completed");
      continue;
    }
    const leaves = leafSet(node.id);
    const hasPending = [...leaves].some((id) => pendingLeafIds.has(id));
    const hasApproved = [...leaves].some((id) => approvedLeafIds.has(id));
    statuses.set(node.id, hasPending ? "pending_approval" : hasApproved ? "in_progress" : "not_started");
  }
  return statuses;
}

// ---------------------------------------------------------------------------
// Admin CRUD — all gated to pre-live stages via bingoService.assertBoardEditable,
// called by the route before invoking these.
// ---------------------------------------------------------------------------

export interface CreateCategoryParams {
  bingoId: string;
  label: string;
  colorHex?: string | null;
  sortOrder?: number;
}
export function createCategory(db: Db, params: CreateCategoryParams, t: BoardTables = PUBLISHED_BOARD) {
  const { tileCategories } = t;
  return db.transaction((tx) => {
    const category = tx.insert(tileCategories).values(params).returning().get();
    auditBoard(tx, t, {
      action: "category.created",
      bingoId: params.bingoId,
      entity: { type: "category", id: category.id, label: category.label },
      details: { label: category.label, colorHex: category.colorHex, sortOrder: category.sortOrder },
    });
    return category;
  });
}
export function updateCategory(db: Db, id: string, params: Partial<Omit<CreateCategoryParams, "bingoId">>, t: BoardTables = PUBLISHED_BOARD) {
  const { tileCategories } = t;
  return db.transaction((tx) => {
    const existing = tx.select().from(tileCategories).where(eq(tileCategories.id, id)).get();
    if (!existing) throw new ServiceError(404, "Category not found");
    const changes = diffFields(existing, { ...existing, ...params }, { only: Object.keys(params) as (keyof typeof existing)[] });
    if (!changes) {
      markUnchanged();
      return existing;
    }
    const updated = tx.update(tileCategories).set(params).where(eq(tileCategories.id, id)).returning().get();
    auditBoard(tx, t, {
      action: "category.updated",
      bingoId: existing.bingoId,
      entity: { type: "category", id, label: existing.label },
      details: { changes: changes as never },
    });
    return updated;
  });
}
export function deleteCategory(db: Db, id: string, t: BoardTables = PUBLISHED_BOARD): void {
  const { tileCategories, tiles } = t;
  db.transaction((tx) => {
    const existing = tx.select().from(tileCategories).where(eq(tileCategories.id, id)).get();
    const tilesUnassigned = tx.select({ id: tiles.id }).from(tiles).where(eq(tiles.categoryId, id)).all().length;
    tx.update(tiles).set({ categoryId: null }).where(eq(tiles.categoryId, id)).run();
    tx.delete(tileCategories).where(eq(tileCategories.id, id)).run();
    if (existing) {
      auditBoard(tx, t, {
        action: "category.deleted",
        bingoId: existing.bingoId,
        entity: { type: "category", id, label: existing.label },
        details: { label: existing.label, tilesUnassigned },
      });
    } else {
      markAuditedNoop();
    }
  });
}

export interface CreateTileParams {
  bingoId: string;
  name: string;
  boardRow: number;
  boardCol: number;
  categoryId?: string | null;
  imageUrl?: string | null;
  hasFreezePeriod?: boolean;
  freezeDurationMinutes?: number;
  notes?: string | null;
  requiresProof?: boolean;
  proofNote?: string | null;
}

// A Proof screenshot requirement (CONTEXT.md) is on a whole Tile or on individual Tasks, never both.
const PROOF_NOTE_MAX = 200;

// The Tile's own requirement fields, normalised: a note only while it's required.
function tileProofFields(params: { requiresProof?: boolean; proofNote?: string | null }): { requiresProof?: boolean; proofNote?: string | null } {
  if (params.requiresProof === undefined && params.proofNote === undefined) return {};
  const proofNote = params.proofNote?.trim() || null;
  if (proofNote && proofNote.length > PROOF_NOTE_MAX) throw new ServiceError(400, `The Proof screenshot note must be at most ${PROOF_NOTE_MAX} characters`);
  if (params.requiresProof === false) return { requiresProof: false, proofNote: null };
  return { ...(params.requiresProof !== undefined ? { requiresProof: params.requiresProof } : {}), ...(params.proofNote !== undefined ? { proofNote } : {}) };
}

// Turning on a Tile-wide requirement replaces its Tasks' own.
function clearTaskProofs(tx: Tx, tile: TileRow, t: BoardTables): void {
  const { nodeEdges, nodes } = t;
  if (!tile.requiresProof) return;
  const taskIds = tx.select({ childId: nodeEdges.childId }).from(nodeEdges).where(eq(nodeEdges.parentId, tile.nodeId)).all().map((e) => e.childId);
  if (taskIds.length) tx.update(nodes).set({ requiresProof: false, proofNote: null }).where(inArray(nodes.id, taskIds)).run();
}

// Only a Task itself (the root of `input`) can require one, and only while its Tile doesn't Tile-wide. A Task shared
// into another Task's requirement (same node) keeps its own flag there.
function assertTaskProof(tx: Tx, tile: TileRow | null, input: GraphNodeInput, t: BoardTables): void {
  const { nodeEdges } = t;
  const taskIds = new Set(tile ? tx.select({ childId: nodeEdges.childId }).from(nodeEdges).where(eq(nodeEdges.parentId, tile.nodeId)).all().map((e) => e.childId) : []);
  const nested = (node: GraphNodeInput): boolean => (node.children ?? []).some((c) => (c.requiresProof && !(c.id && taskIds.has(c.id))) || nested(c));
  if (nested(input)) throw new ServiceError(400, "Only a Task can require a Proof screenshot");
  if (input.requiresProof && !tile) throw new ServiceError(400, "Only a Task can require a Proof screenshot");
  if (input.requiresProof && tile?.requiresProof) throw new ServiceError(400, "This Tile already requires a Proof screenshot Tile-wide");
}

// A tile's node is a plain ALL root — its tasks (children) carry the task
// points, and the tile completes once every task does. Its own `points`
// default to 0 (no bonus); see updateTileBonusPoints for the optional
// full-completion bonus, awarded the same way once all tasks are complete.
// Lines are ALL nodes over the tile nodes in their row, column or diagonal, wired up by
// generateLines from the tiles that exist at the time. The board can be edited while live, so
// a tile created or moved after that has to join the lines it now sits in and leave the ones
// it left, or a row could be completed without it (or a line could keep a member that moved
// away). "custom" lines have admin-chosen members and are left alone.
function syncTileLines(tx: Tx, tile: TileRow, t: BoardTables): void {
  const { bingoLines, nodeEdges } = t;
  const lines = tx.select().from(bingoLines).where(eq(bingoLines.bingoId, tile.bingoId)).all();
  if (lines.length === 0) return;
  const bingo = tx.select({ boardCols: schema.bingos.boardCols }).from(schema.bingos).where(eq(schema.bingos.id, tile.bingoId)).get()!;
  // The tile's position within the line, or null when it isn't a member.
  const positionIn = (line: LineRow): number | null => {
    if (line.lineType === "row") return line.lineIndex === tile.boardRow ? tile.boardCol : null;
    if (line.lineType === "column") return line.lineIndex === tile.boardCol ? tile.boardRow : null;
    if (line.lineType === "diagonal" && line.lineIndex === 0) return tile.boardRow === tile.boardCol ? tile.boardRow : null;
    if (line.lineType === "diagonal") return tile.boardCol === bingo.boardCols - 1 - tile.boardRow ? tile.boardRow : null;
    return null;
  };
  for (const line of lines) {
    if (line.lineType === "custom") continue;
    const sortOrder = positionIn(line);
    const edge = tx.select({ id: nodeEdges.id }).from(nodeEdges).where(and(eq(nodeEdges.parentId, line.nodeId), eq(nodeEdges.childId, tile.nodeId))).get();
    if (sortOrder === null) {
      if (edge) tx.delete(nodeEdges).where(eq(nodeEdges.id, edge.id)).run();
    } else if (edge) {
      tx.update(nodeEdges).set({ sortOrder }).where(eq(nodeEdges.id, edge.id)).run();
    } else {
      tx.insert(nodeEdges).values({ parentId: line.nodeId, childId: tile.nodeId, sortOrder }).run();
    }
  }
}

export function createTile(db: Db, params: CreateTileParams, t: BoardTables = PUBLISHED_BOARD) {
  const { tiles } = t;
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(tiles)
      .where(and(eq(tiles.bingoId, params.bingoId), eq(tiles.boardRow, params.boardRow), eq(tiles.boardCol, params.boardCol)))
      .get();
    if (existing) throw new ServiceError(409, `A tile already exists at row ${params.boardRow}, col ${params.boardCol}`);
    const nodeId = insertSubtree(tx, params.bingoId, { kind: "ALL" }, t);
    const tile = tx.insert(tiles).values({ ...params, ...tileProofFields(params), nodeId }).returning().get();
    syncTileLines(tx, tile, t);
    auditBoard(tx, t, {
      action: "tile.created",
      bingoId: params.bingoId,
      entity: { type: "tile", id: tile.id, label: tile.name },
      details: { name: tile.name, boardRow: tile.boardRow, boardCol: tile.boardCol, categoryId: tile.categoryId },
    });
    return tile;
  });
}
export function updateTile(db: Db, id: string, params: Partial<Omit<CreateTileParams, "bingoId">>, t: BoardTables = PUBLISHED_BOARD) {
  const { tiles } = t;
  return db.transaction((tx) => {
    const existing = tx.select().from(tiles).where(eq(tiles.id, id)).get();
    if (!existing) throw new ServiceError(404, "Tile not found");
    const set = { ...params, ...tileProofFields(params) };
    const changes = diffFields(existing, { ...existing, ...set }, { only: Object.keys(set) as (keyof typeof existing)[] });
    if (!changes) {
      markUnchanged();
      return existing;
    }
    const updated = tx.update(tiles).set(set).where(eq(tiles.id, id)).returning().get();
    if (updated.requiresProof && !existing.requiresProof) clearTaskProofs(tx, updated, t);
    if (updated.boardRow !== existing.boardRow || updated.boardCol !== existing.boardCol) syncTileLines(tx, updated, t);
    auditBoard(tx, t, {
      action: "tile.updated",
      bingoId: existing.bingoId,
      entity: { type: "tile", id, label: existing.name },
      details: { changes: changes as never },
    });
    // Scores are a snapshot (rescoreBingo), so an edit that changed something re-scores; one that changed nothing doesn't.
    // A Draft board edit scores nothing until it's published.
    if (!t.draft) rescoreBingo(tx, existing.bingoId);
    return updated;
  });
}
// Sets the points on the tile's own root node (see the comment above
// createTile) — awarded once every task under it completes, via the same
// generic ALL-node handling every other composite node gets from the engine.
// Direct nodes.points update, not updateNode/replaceSubtree: that path
// treats a missing `children` as "delete them all", which would wipe the
// tile's tasks.
export function updateTileBonusPoints(db: Db, tileId: string, points: number, t: BoardTables = PUBLISHED_BOARD) {
  const { tiles, nodes } = t;
  return db.transaction((tx) => {
    const tile = tx.select().from(tiles).where(eq(tiles.id, tileId)).get();
    if (!tile) throw new ServiceError(404, "Tile not found");
    const node = tx.select({ points: nodes.points }).from(nodes).where(eq(nodes.id, tile.nodeId)).get()!;
    if (node.points === points) {
      markUnchanged();
      return tile;
    }
    tx.update(nodes).set({ points }).where(eq(nodes.id, tile.nodeId)).run();
    auditBoard(tx, t, {
      action: "tile.bonus_points_updated",
      bingoId: tile.bingoId,
      entity: { type: "tile", id: tile.id, label: tile.name },
      details: { points: { before: node.points, after: points } },
    });
    if (!t.draft) rescoreBingo(tx, tile.bingoId);
    return tile;
  });
}

export function deleteTile(db: Db, id: string, t: BoardTables = PUBLISHED_BOARD): void {
  const { tiles, nodeEdges } = t;
  db.transaction((tx) => {
    const tile = tx.select().from(tiles).where(eq(tiles.id, id)).get();
    if (!tile) {
      markAuditedNoop();
      return;
    }
    const proofs = tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.proofTileId, id)).all().length;
    if (proofs > 0) throw new ServiceError(409, `Can't delete "${tile.name}": ${proofs} Proof screenshot${proofs === 1 ? "" : "s"} were posted for it`);
    const taskCount = tx.select({ id: nodeEdges.id }).from(nodeEdges).where(eq(nodeEdges.parentId, tile.nodeId)).all().length;
    // Task interest hangs off the Published board's Tiles: a Draft board delete leaves it for the Publish to remove.
    if (!t.draft) tx.delete(tileInterests).where(eq(tileInterests.tileId, id)).run();
    // Its Tags (CONTEXT.md "Tag") are on the same board as it; its Parts' go with their nodes (deleteSubtree).
    tx.delete(t.tags).where(eq(t.tags.tileId, id)).run();
    tx.delete(tiles).where(eq(tiles.id, id)).run(); // must precede deleting the node it FKs to
    deleteSubtree(tx, tile.nodeId, t);
    auditBoard(tx, t, {
      action: "tile.deleted",
      bingoId: tile.bingoId,
      entity: { type: "tile", id, label: tile.name },
      details: { name: tile.name, boardRow: tile.boardRow, boardCol: tile.boardCol, taskCount },
    });
  });
}

// ---------------------------------------------------------------------------
// Tasks — a task is just a node that's a direct child of its tile's node.
// Gate resolution ("requires previous task" -> a specific sibling's node id)
// is the caller's job (it already has the tile's current child order from
// the board response); these are otherwise plain node operations.
// ---------------------------------------------------------------------------

export function createTask(db: Db, tileId: string, input: GraphNodeInput, sortOrder?: number, t: BoardTables = PUBLISHED_BOARD) {
  const { tiles, nodeEdges } = t;
  return db.transaction((tx) => {
    const tile = tx.select().from(tiles).where(eq(tiles.id, tileId)).get();
    if (!tile) throw new ServiceError(404, "Tile not found");
    assertTaskProof(tx, tile, input, t);
    const order = sortOrder ?? tx.select({ id: nodeEdges.id }).from(nodeEdges).where(eq(nodeEdges.parentId, tile.nodeId)).all().length;
    const taskNodeId = insertSubtree(tx, tile.bingoId, input, t);
    tx.insert(nodeEdges).values({ parentId: tile.nodeId, childId: taskNodeId, sortOrder: order }).run();
    const tree = getNodeTree(tx, taskNodeId, t)!;
    auditBoard(tx, t, {
      action: "task.created",
      bingoId: tile.bingoId,
      entity: { type: "node", id: taskNodeId, label: tree.label },
      details: { tileId: tile.id, tileName: tile.name, after: describeTaskNode(tree) },
    });
    return tree;
  });
}

export function updateNode(db: Db, id: string, input: GraphNodeInput, t: BoardTables = PUBLISHED_BOARD) {
  const { nodes } = t;
  return db.transaction((tx) => {
    const existing = tx.select({ bingoId: nodes.bingoId }).from(nodes).where(eq(nodes.id, id)).get();
    if (!existing) throw new ServiceError(404, "Node not found");
    const before = getNodeTree(tx, id, t);
    const tile = tileForTaskNode(tx, id, t);
    assertTaskProof(tx, tile, input, t);
    replaceSubtree(tx, id, existing.bingoId, input, t);
    const after = getNodeTree(tx, id, t)!;
    auditBoard(tx, t, {
      action: "task.updated",
      bingoId: existing.bingoId,
      entity: { type: "node", id, label: after.label },
      details: { tileId: tile?.id ?? "", tileName: tile?.name ?? "", before: before ? describeTaskNode(before) : describeTaskNode(after), after: describeTaskNode(after) },
    });
    return after;
  });
}

export function deleteTask(db: Db, id: string, t: BoardTables = PUBLISHED_BOARD): void {
  db.transaction((tx) => {
    const before = getNodeTree(tx, id, t);
    const tile = tileForTaskNode(tx, id, t);
    deleteNode(tx, id, t);
    if (before) {
      auditBoard(tx, t, {
        action: "task.deleted",
        bingoId: before.bingoId,
        entity: { type: "node", id, label: before.label },
        details: { tileId: tile?.id ?? "", tileName: tile?.name ?? "", before: describeTaskNode(before) },
      });
    } else {
      markAuditedNoop();
    }
  });
}

// Reorders a node's children (drag-reorder in the admin UI).
export function reorderChildren(db: Db, parentNodeId: string, orderedChildIds: string[], t: BoardTables = PUBLISHED_BOARD): void {
  const { nodeEdges } = t;
  db.transaction((tx) => {
    orderedChildIds.forEach((childId, i) => {
      tx.update(nodeEdges).set({ sortOrder: i }).where(and(eq(nodeEdges.parentId, parentNodeId), eq(nodeEdges.childId, childId))).run();
    });
  });
}

// ---------------------------------------------------------------------------
// Lines — a line's node is an ALL over its tile nodes; its points are the
// line bonus.
// ---------------------------------------------------------------------------

export function getLines(db: Db, bingoId: string, t: BoardTables = PUBLISHED_BOARD) {
  const { bingoLines } = t;
  return db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
}

// Generates every row + column + (if square) diagonal line for the bingo's
// configured dimensions. Replaces any existing generated lines so it's safe
// to re-run after resizing the board during planning.
export function generateLines(db: Db, bingo: Bingo, pointsPerLine = 15, t: BoardTables = PUBLISHED_BOARD) {
  const { tiles, bingoLines, nodeEdges } = t;
  return db.transaction((tx) => {
    const tileRows = tx.select().from(tiles).where(eq(tiles.bingoId, bingo.id)).all();
    const existingLines = tx.select().from(bingoLines).where(eq(bingoLines.bingoId, bingo.id)).all();
    const replaced = existingLines.length;
    for (const line of existingLines) {
      tx.delete(bingoLines).where(eq(bingoLines.id, line.id)).run(); // must precede deleting the node it FKs to
      deleteSubtree(tx, line.nodeId, t);
    }

    const tileAt = (row: number, col: number) => tileRows.find((tile) => tile.boardRow === row && tile.boardCol === col);
    // The line's own root node is freshly inserted; its children are edges to
    // the tile nodes that already exist (insertSubtree can only create new
    // nodes, so those edges are added directly rather than via `children`).
    const makeLine = (lineType: "row" | "column" | "diagonal", lineIndex: number, tileIds: string[]) => {
      const nodeId = insertSubtree(tx, bingo.id, { kind: "ALL", points: pointsPerLine }, t);
      tileIds.forEach((tileId, i) => {
        const tileNodeId = tileRows.find((tile) => tile.id === tileId)!.nodeId;
        tx.insert(nodeEdges).values({ parentId: nodeId, childId: tileNodeId, sortOrder: i }).run();
      });
      return tx.insert(bingoLines).values({ bingoId: bingo.id, nodeId, lineType, lineIndex }).returning().get();
    };

    const createdLines = [];
    for (let row = 0; row < bingo.boardRows; row++) {
      const rowTileIds = Array.from({ length: bingo.boardCols }, (_, col) => tileAt(row, col)?.id).filter((id): id is string => !!id);
      createdLines.push(makeLine("row", row, rowTileIds));
    }
    for (let col = 0; col < bingo.boardCols; col++) {
      const colTileIds = Array.from({ length: bingo.boardRows }, (_, row) => tileAt(row, col)?.id).filter((id): id is string => !!id);
      createdLines.push(makeLine("column", col, colTileIds));
    }
    if (bingo.boardRows === bingo.boardCols) {
      const diagTlBr = Array.from({ length: bingo.boardRows }, (_, i) => tileAt(i, i)?.id).filter((id): id is string => !!id);
      createdLines.push(makeLine("diagonal", 0, diagTlBr));
      const diagTrBl = Array.from({ length: bingo.boardRows }, (_, i) => tileAt(i, bingo.boardCols - 1 - i)?.id).filter((id): id is string => !!id);
      createdLines.push(makeLine("diagonal", 1, diagTrBl));
    }

    auditBoard(tx, t, {
      action: "line.generated",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: {
        pointsPerLine,
        replaced,
        created: { row: bingo.boardRows, column: bingo.boardCols, diagonal: bingo.boardRows === bingo.boardCols ? 2 : 0 },
      },
    });
    return createdLines;
  });
}

export function updateLinePoints(db: Db, id: string, points: number, t: BoardTables = PUBLISHED_BOARD) {
  const { bingoLines, nodes } = t;
  return db.transaction((tx) => {
    const line = tx.select().from(bingoLines).where(eq(bingoLines.id, id)).get();
    if (!line) throw new ServiceError(404, "Line not found");
    const node = tx.select({ points: nodes.points }).from(nodes).where(eq(nodes.id, line.nodeId)).get()!;
    if (node.points === points) {
      markUnchanged();
      return line;
    }
    tx.update(nodes).set({ points }).where(eq(nodes.id, line.nodeId)).run();
    auditBoard(tx, t, {
      action: "line.updated",
      bingoId: line.bingoId,
      entity: { type: "line", id: line.id, label: `${line.lineType} ${line.lineIndex}` },
      details: { lineType: line.lineType, lineIndex: line.lineIndex, points: { before: node.points, after: points } },
    });
    if (!t.draft) rescoreBingo(tx, line.bingoId);
    return line;
  });
}

export function deleteLine(db: Db, id: string, t: BoardTables = PUBLISHED_BOARD): void {
  const { bingoLines, nodes } = t;
  db.transaction((tx) => {
    const line = tx.select().from(bingoLines).where(eq(bingoLines.id, id)).get();
    if (!line) {
      markAuditedNoop();
      return;
    }
    const node = tx.select({ points: nodes.points }).from(nodes).where(eq(nodes.id, line.nodeId)).get();
    tx.delete(bingoLines).where(eq(bingoLines.id, id)).run(); // must precede deleting the node it FKs to
    deleteSubtree(tx, line.nodeId, t);
    auditBoard(tx, t, {
      action: "line.deleted",
      bingoId: line.bingoId,
      entity: { type: "line", id, label: `${line.lineType} ${line.lineIndex}` },
      details: { lineType: line.lineType, lineIndex: line.lineIndex, points: node?.points ?? 0 },
    });
  });
}
