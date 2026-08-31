import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { tileCategories, tileTaskItems, tileTasks, tileWildcards, tiles } from "../db/schema";

type Db = BetterSQLite3Database<typeof schema>;

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
