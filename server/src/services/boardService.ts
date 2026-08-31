import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLines, bingoLineTiles, tileCategories, tileTaskItems, tileTasks, tileWildcards, tiles } from "../db/schema";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

export function getCategories(db: Db, bingoId: string) {
  return db.select().from(tileCategories).where(eq(tileCategories.bingoId, bingoId)).orderBy(tileCategories.sortOrder).all();
}

// Full tile -> task -> item tree plus per-tile wildcards, for one bingo.
export function getBoardTiles(db: Db, bingoId: string) {
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileIds = tileRows.map((t) => t.id);
  if (tileIds.length === 0) return [];

  const taskRows = db.select().from(tileTasks).where(inArray(tileTasks.tileId, tileIds)).orderBy(tileTasks.sortOrder).all();
  const taskIds = taskRows.map((t) => t.id);
  const itemRows = taskIds.length
    ? db.select().from(tileTaskItems).where(inArray(tileTaskItems.taskId, taskIds)).orderBy(tileTaskItems.sortOrder).all()
    : [];
  const wildcardRows = db.select().from(tileWildcards).where(inArray(tileWildcards.tileId, tileIds)).all();

  return tileRows.map((tile) => ({
    ...tile,
    tasks: taskRows
      .filter((t) => t.tileId === tile.id)
      .map((task) => ({ ...task, items: itemRows.filter((i) => i.taskId === task.id) })),
    wildcards: wildcardRows.filter((w) => w.tileId === tile.id),
  }));
}

export function getTileById(db: Db, tileId: string) {
  return db.select().from(tiles).where(eq(tiles.id, tileId)).get();
}

export function getTaskById(db: Db, taskId: string) {
  return db.select().from(tileTasks).where(eq(tileTasks.id, taskId)).get();
}

export function getTileTasksOrdered(db: Db, tileId: string) {
  return db.select().from(tileTasks).where(eq(tileTasks.tileId, tileId)).orderBy(tileTasks.sortOrder).all();
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
export function createTile(db: Db, params: CreateTileParams) {
  const existing = db
    .select()
    .from(tiles)
    .where(and(eq(tiles.bingoId, params.bingoId), eq(tiles.boardRow, params.boardRow), eq(tiles.boardCol, params.boardCol)))
    .get();
  if (existing) throw new ServiceError(409, `A tile already exists at row ${params.boardRow}, col ${params.boardCol}`);
  return db.insert(tiles).values(params).returning().get();
}
export function updateTile(db: Db, id: string, params: Partial<Omit<CreateTileParams, "bingoId">>) {
  const existing = db.select().from(tiles).where(eq(tiles.id, id)).get();
  if (!existing) throw new ServiceError(404, "Tile not found");
  return db.update(tiles).set(params).where(eq(tiles.id, id)).returning().get();
}
export function deleteTile(db: Db, id: string): void {
  db.transaction((tx) => {
    const taskIds = tx.select({ id: tileTasks.id }).from(tileTasks).where(eq(tileTasks.tileId, id)).all().map((t) => t.id);
    if (taskIds.length > 0) tx.delete(tileTaskItems).where(inArray(tileTaskItems.taskId, taskIds)).run();
    tx.delete(tileWildcards).where(eq(tileWildcards.tileId, id)).run();
    tx.delete(bingoLineTiles).where(eq(bingoLineTiles.tileId, id)).run();
    tx.delete(tileTasks).where(eq(tileTasks.tileId, id)).run();
    tx.delete(tiles).where(eq(tiles.id, id)).run();
  });
}

export interface CreateTaskParams {
  tileId: string;
  label: string;
  sortOrder: number;
  points: number;
  description: string;
  scoringMode?: "automatic" | "manual";
  submitRequiresPrevious?: boolean;
  pointsRequirePrevious?: boolean;
  requiresNoDuplicates?: boolean;
  allowsPreviouslyAcquired?: boolean;
  allowsPreLoad?: boolean;
  minSubmissions?: number;
  requiresCompleteSet?: boolean;
  notes?: string | null;
}
export function createTask(db: Db, params: CreateTaskParams) {
  const existing = db
    .select()
    .from(tileTasks)
    .where(and(eq(tileTasks.tileId, params.tileId), eq(tileTasks.sortOrder, params.sortOrder)))
    .get();
  if (existing) throw new ServiceError(409, `A task already exists at sortOrder ${params.sortOrder} on this tile`);
  return db.insert(tileTasks).values(params).returning().get();
}
export function updateTask(db: Db, id: string, params: Partial<Omit<CreateTaskParams, "tileId">>) {
  const existing = db.select().from(tileTasks).where(eq(tileTasks.id, id)).get();
  if (!existing) throw new ServiceError(404, "Task not found");
  return db.update(tileTasks).set(params).where(eq(tileTasks.id, id)).returning().get();
}
export function deleteTask(db: Db, id: string): void {
  db.delete(tileTaskItems).where(eq(tileTaskItems.taskId, id)).run();
  db.update(tileWildcards).set({ applicableTaskId: null }).where(eq(tileWildcards.applicableTaskId, id)).run();
  db.delete(tileTasks).where(eq(tileTasks.id, id)).run();
}

export interface CreateTaskItemParams {
  taskId: string;
  itemName: string;
  quantity?: number;
  optionsGroup?: string | null;
  sortOrder?: number;
}
export function createTaskItem(db: Db, params: CreateTaskItemParams) {
  return db.insert(tileTaskItems).values(params).returning().get();
}
export function updateTaskItem(db: Db, id: string, params: Partial<Omit<CreateTaskItemParams, "taskId">>) {
  const existing = db.select().from(tileTaskItems).where(eq(tileTaskItems.id, id)).get();
  if (!existing) throw new ServiceError(404, "Item not found");
  return db.update(tileTaskItems).set(params).where(eq(tileTaskItems.id, id)).returning().get();
}
export function deleteTaskItem(db: Db, id: string): void {
  db.delete(tileTaskItems).where(eq(tileTaskItems.id, id)).run();
}

export interface CreateWildcardParams {
  tileId: string;
  itemName: string;
  maxRedemptionsPerTeam?: number;
  description?: string | null;
  applicableTaskId?: string | null;
}
export function createWildcard(db: Db, params: CreateWildcardParams) {
  return db.insert(tileWildcards).values(params).returning().get();
}
export function updateWildcard(db: Db, id: string, params: Partial<Omit<CreateWildcardParams, "tileId">>) {
  const existing = db.select().from(tileWildcards).where(eq(tileWildcards.id, id)).get();
  if (!existing) throw new ServiceError(404, "Wildcard not found");
  return db.update(tileWildcards).set(params).where(eq(tileWildcards.id, id)).returning().get();
}
export function deleteWildcard(db: Db, id: string): void {
  db.delete(tileWildcards).where(eq(tileWildcards.id, id)).run();
}

// ---------------------------------------------------------------------------
// Lines
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
    const existingLines = tx.select({ id: bingoLines.id }).from(bingoLines).where(eq(bingoLines.bingoId, bingo.id)).all();
    if (existingLines.length > 0) {
      const lineIds = existingLines.map((l) => l.id);
      tx.delete(bingoLineTiles).where(inArray(bingoLineTiles.bingoLineId, lineIds)).run();
      tx.delete(bingoLines).where(inArray(bingoLines.id, lineIds)).run();
    }

    const tileAt = (row: number, col: number) => tileRows.find((t) => t.boardRow === row && t.boardCol === col);
    const createdLines = [];

    for (let row = 0; row < bingo.boardRows; row++) {
      const line = tx.insert(bingoLines).values({ bingoId: bingo.id, lineType: "row", lineIndex: row, points: pointsPerLine }).returning().get();
      for (let col = 0; col < bingo.boardCols; col++) {
        const tile = tileAt(row, col);
        if (tile) tx.insert(bingoLineTiles).values({ bingoLineId: line.id, tileId: tile.id }).run();
      }
      createdLines.push(line);
    }
    for (let col = 0; col < bingo.boardCols; col++) {
      const line = tx.insert(bingoLines).values({ bingoId: bingo.id, lineType: "column", lineIndex: col, points: pointsPerLine }).returning().get();
      for (let row = 0; row < bingo.boardRows; row++) {
        const tile = tileAt(row, col);
        if (tile) tx.insert(bingoLineTiles).values({ bingoLineId: line.id, tileId: tile.id }).run();
      }
      createdLines.push(line);
    }
    if (bingo.boardRows === bingo.boardCols) {
      const diagTlBr = tx.insert(bingoLines).values({ bingoId: bingo.id, lineType: "diagonal", lineIndex: 0, points: pointsPerLine }).returning().get();
      for (let i = 0; i < bingo.boardRows; i++) {
        const tile = tileAt(i, i);
        if (tile) tx.insert(bingoLineTiles).values({ bingoLineId: diagTlBr.id, tileId: tile.id }).run();
      }
      createdLines.push(diagTlBr);

      const diagTrBl = tx.insert(bingoLines).values({ bingoId: bingo.id, lineType: "diagonal", lineIndex: 1, points: pointsPerLine }).returning().get();
      for (let i = 0; i < bingo.boardRows; i++) {
        const tile = tileAt(i, bingo.boardCols - 1 - i);
        if (tile) tx.insert(bingoLineTiles).values({ bingoLineId: diagTrBl.id, tileId: tile.id }).run();
      }
      createdLines.push(diagTrBl);
    }

    return createdLines;
  });
}

export function updateLine(db: Db, id: string, points: number) {
  const existing = db.select().from(bingoLines).where(eq(bingoLines.id, id)).get();
  if (!existing) throw new ServiceError(404, "Line not found");
  return db.update(bingoLines).set({ points }).where(eq(bingoLines.id, id)).returning().get();
}

export function deleteLine(db: Db, id: string): void {
  db.delete(bingoLineTiles).where(eq(bingoLineTiles.bingoLineId, id)).run();
  db.delete(bingoLines).where(eq(bingoLines.id, id)).run();
}
