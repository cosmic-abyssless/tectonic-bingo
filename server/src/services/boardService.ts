import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput, NodeStatus } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingoLines, claims, nodeEdges, submissions, teamNodeState, tileCategories, tiles } from "../db/schema";
import { ServiceError } from "./errors";
import { deleteNode, deleteSubtree, getFullGraph, getNodeTree, getNodeTrees, insertSubtree, replaceSubtree } from "./graphService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

export function getCategories(db: Db, bingoId: string) {
  return db.select().from(tileCategories).where(eq(tileCategories.bingoId, bingoId)).orderBy(tileCategories.sortOrder).all();
}

// Full tile -> node tree (tasks are just the node's children) for one bingo.
export function getBoardTiles(db: Db, bingoId: string) {
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  if (tileRows.length === 0) return [];

  const trees = getNodeTrees(db, tileRows.map((t) => t.nodeId));
  return tileRows.map((tile) => ({ ...tile, node: trees.get(tile.nodeId)! }));
}

export function getBoardLines(db: Db, bingoId: string) {
  const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
  const trees = getNodeTrees(db, lineRows.map((l) => l.nodeId));
  return lineRows.map((line) => ({ ...line, node: trees.get(line.nodeId)! }));
}

export function getTileById(db: Db, tileId: string) {
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
// Admin CRUD — all gated to planning/signup via bingoService.assertBoardEditable,
// called by the route before invoking these.
// ---------------------------------------------------------------------------

export interface CreateCategoryParams {
  bingoId: string;
  label: string;
  colorHex?: string | null;
  sortOrder?: number;
}
export function createCategory(db: Db, params: CreateCategoryParams) {
  return db.insert(tileCategories).values(params).returning().get();
}
export function updateCategory(db: Db, id: string, params: Partial<Omit<CreateCategoryParams, "bingoId">>) {
  const existing = db.select().from(tileCategories).where(eq(tileCategories.id, id)).get();
  if (!existing) throw new ServiceError(404, "Category not found");
  return db.update(tileCategories).set(params).where(eq(tileCategories.id, id)).returning().get();
}
export function deleteCategory(db: Db, id: string): void {
  db.update(tiles).set({ categoryId: null }).where(eq(tiles.categoryId, id)).run();
  db.delete(tileCategories).where(eq(tileCategories.id, id)).run();
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
}
// A tile's node is a plain ALL root with no points of its own — its tasks
// (children) carry the points; the tile completes once every task does.
export function createTile(db: Db, params: CreateTileParams) {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(tiles)
      .where(and(eq(tiles.bingoId, params.bingoId), eq(tiles.boardRow, params.boardRow), eq(tiles.boardCol, params.boardCol)))
      .get();
    if (existing) throw new ServiceError(409, `A tile already exists at row ${params.boardRow}, col ${params.boardCol}`);
    const nodeId = insertSubtree(tx, params.bingoId, { kind: "ALL" });
    return tx.insert(tiles).values({ ...params, nodeId }).returning().get();
  });
}
export function updateTile(db: Db, id: string, params: Partial<Omit<CreateTileParams, "bingoId">>) {
  const existing = db.select().from(tiles).where(eq(tiles.id, id)).get();
  if (!existing) throw new ServiceError(404, "Tile not found");
  return db.update(tiles).set(params).where(eq(tiles.id, id)).returning().get();
}
export function deleteTile(db: Db, id: string): void {
  db.transaction((tx) => {
    const tile = tx.select().from(tiles).where(eq(tiles.id, id)).get();
    if (!tile) return;
    tx.delete(tiles).where(eq(tiles.id, id)).run(); // must precede deleting the node it FKs to
    deleteSubtree(tx, tile.nodeId);
  });
}

// ---------------------------------------------------------------------------
// Tasks — a task is just a node that's a direct child of its tile's node.
// Gate resolution ("requires previous task" -> a specific sibling's node id)
// is the caller's job (it already has the tile's current child order from
// the board response); these are otherwise plain node operations.
// ---------------------------------------------------------------------------

export function createTask(db: Db, tileId: string, input: GraphNodeInput, sortOrder?: number) {
  return db.transaction((tx) => {
    const tile = tx.select().from(tiles).where(eq(tiles.id, tileId)).get();
    if (!tile) throw new ServiceError(404, "Tile not found");
    const order = sortOrder ?? tx.select({ id: nodeEdges.id }).from(nodeEdges).where(eq(nodeEdges.parentId, tile.nodeId)).all().length;
    const taskNodeId = insertSubtree(tx, tile.bingoId, input);
    tx.insert(nodeEdges).values({ parentId: tile.nodeId, childId: taskNodeId, sortOrder: order }).run();
    return getNodeTree(tx, taskNodeId)!;
  });
}

export function updateNode(db: Db, id: string, input: GraphNodeInput) {
  return db.transaction((tx) => {
    const existing = tx.select({ bingoId: schema.nodes.bingoId }).from(schema.nodes).where(eq(schema.nodes.id, id)).get();
    if (!existing) throw new ServiceError(404, "Node not found");
    replaceSubtree(tx, id, existing.bingoId, input);
    return getNodeTree(tx, id)!;
  });
}

export function deleteTask(db: Db, id: string): void {
  db.transaction((tx) => deleteNode(tx, id));
}

// Reorders a node's children (drag-reorder in the admin UI).
export function reorderChildren(db: Db, parentNodeId: string, orderedChildIds: string[]): void {
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

export function getLines(db: Db, bingoId: string) {
  return db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
}

// Generates every row + column + (if square) diagonal line for the bingo's
// configured dimensions. Replaces any existing generated lines so it's safe
// to re-run after resizing the board during planning.
export function generateLines(db: Db, bingo: Bingo, pointsPerLine = 15) {
  return db.transaction((tx) => {
    const tileRows = tx.select().from(tiles).where(eq(tiles.bingoId, bingo.id)).all();
    const existingLines = tx.select().from(bingoLines).where(eq(bingoLines.bingoId, bingo.id)).all();
    for (const line of existingLines) {
      tx.delete(bingoLines).where(eq(bingoLines.id, line.id)).run(); // must precede deleting the node it FKs to
      deleteSubtree(tx, line.nodeId);
    }

    const tileAt = (row: number, col: number) => tileRows.find((t) => t.boardRow === row && t.boardCol === col);
    // The line's own root node is freshly inserted; its children are edges to
    // the tile nodes that already exist (insertSubtree can only create new
    // nodes, so those edges are added directly rather than via `children`).
    const makeLine = (lineType: "row" | "column" | "diagonal", lineIndex: number, tileIds: string[]) => {
      const nodeId = insertSubtree(tx, bingo.id, { kind: "ALL", points: pointsPerLine });
      tileIds.forEach((tileId, i) => {
        const tileNodeId = tileRows.find((t) => t.id === tileId)!.nodeId;
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
    return createdLines;
  });
}

export function updateLinePoints(db: Db, id: string, points: number) {
  return db.transaction((tx) => {
    const line = tx.select().from(bingoLines).where(eq(bingoLines.id, id)).get();
    if (!line) throw new ServiceError(404, "Line not found");
    tx.update(schema.nodes).set({ points }).where(eq(schema.nodes.id, line.nodeId)).run();
    return line;
  });
}

export function deleteLine(db: Db, id: string): void {
  db.transaction((tx) => {
    const line = tx.select().from(bingoLines).where(eq(bingoLines.id, id)).get();
    if (!line) return;
    tx.delete(bingoLines).where(eq(bingoLines.id, id)).run(); // must precede deleting the node it FKs to
    deleteSubtree(tx, line.nodeId);
  });
}
