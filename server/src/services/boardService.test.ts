import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLineTiles, bingoLines, requirementNodeItems, requirementNodes, tileTasks, tileWildcards, tiles } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask, createWildcard, deleteTile, generateLines } from "./boardService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  return db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, ...overrides }).returning().get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("createTile", () => {
  it("rejects a second tile at the same board position", () => {
    const bingo = seedBingo();
    createTile(db, { bingoId: bingo.id, name: "A", boardRow: 0, boardCol: 0 });
    expect(() => createTile(db, { bingoId: bingo.id, name: "B", boardRow: 0, boardCol: 0 })).toThrow(ServiceError);
  });
});

describe("deleteTile", () => {
  it("cascades to tasks, requirement trees, wildcards, and line memberships", () => {
    const bingo = seedBingo();
    const tile = createTile(db, { bingoId: bingo.id, name: "A", boardRow: 0, boardCol: 0 });
    const task = createTask(db, {
      tileId: tile.id, label: "Part A", sortOrder: 0, points: 10, description: "d",
      requirement: { kind: "ALL", children: [{ kind: "ITEM", itemNames: ["Item"] }] },
    });
    const leaf = db.select().from(requirementNodes).all().find((n) => n.kind === "ITEM")!;
    createWildcard(db, { tileId: tile.id, itemName: "Jar", applicableNodeId: leaf.id });
    const [line] = db.insert(bingoLines).values({ bingoId: bingo.id, lineType: "row", lineIndex: 0 }).returning().all();
    db.insert(bingoLineTiles).values({ bingoLineId: line.id, tileId: tile.id }).run();

    deleteTile(db, tile.id);

    expect(db.select().from(tiles).all()).toHaveLength(0);
    expect(db.select().from(tileTasks).all()).toHaveLength(0);
    expect(db.select().from(requirementNodes).all()).toHaveLength(0);
    expect(db.select().from(requirementNodeItems).all()).toHaveLength(0);
    expect(db.select().from(tileWildcards).all()).toHaveLength(0);
    expect(db.select().from(bingoLineTiles).all()).toHaveLength(0);
    // The line itself survives (it may still reference other tiles) — only the membership row is removed.
    expect(db.select().from(bingoLines).all()).toHaveLength(1);
  });
});

describe("generateLines", () => {
  it("generates rows + columns + both diagonals for a square board", () => {
    const bingo = seedBingo({ boardRows: 3, boardCols: 3 });
    const tileByPos = new Map<string, ReturnType<typeof createTile>>();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        tileByPos.set(`${r},${c}`, createTile(db, { bingoId: bingo.id, name: `T${r}${c}`, boardRow: r, boardCol: c }));
      }
    }

    const lines = generateLines(db, bingo, 15);
    expect(lines).toHaveLength(3 + 3 + 2); // rows + cols + 2 diagonals
    expect(lines.every((l) => l.points === 15)).toBe(true);

    const diagTlBr = lines.find((l) => l.lineType === "diagonal" && l.lineIndex === 0)!;
    const memberTileIds = db
      .select()
      .from(bingoLineTiles)
      .all()
      .filter((row) => row.bingoLineId === diagTlBr.id)
      .map((row) => row.tileId);
    expect(memberTileIds.sort()).toEqual([tileByPos.get("0,0")!.id, tileByPos.get("1,1")!.id, tileByPos.get("2,2")!.id].sort());
  });

  it("does not generate diagonals for a non-square board", () => {
    const bingo = seedBingo({ boardRows: 2, boardCols: 3 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) createTile(db, { bingoId: bingo.id, name: `T${r}${c}`, boardRow: r, boardCol: c });

    const lines = generateLines(db, bingo, 15);
    expect(lines).toHaveLength(2 + 3); // rows + cols, no diagonals
    expect(lines.some((l) => l.lineType === "diagonal")).toBe(false);
  });

  it("replaces existing generated lines rather than duplicating them", () => {
    const bingo = seedBingo({ boardRows: 2, boardCols: 2 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) createTile(db, { bingoId: bingo.id, name: `T${r}${c}`, boardRow: r, boardCol: c });

    generateLines(db, bingo, 15);
    generateLines(db, bingo, 20);

    const lines = db.select().from(bingoLines).all();
    expect(lines).toHaveLength(2 + 2 + 2);
    expect(lines.every((l) => l.points === 20)).toBe(true);
  });
});
