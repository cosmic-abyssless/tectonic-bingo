import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { exportBingo, importBingo } from "./bingoExportService";
import { createCategory, createTask, createTile, generateLines, getBoardTiles, updateLinePoints } from "./boardService";
import { createQuestion } from "./signupService";
import { getBingoBySlug } from "./bingoService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

function seedFullBingo() {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const bingo = db
    .insert(schema.bingos)
    .values({
      slug: "source", name: "Source Bingo", description: "A test bingo", theme: "comic", boardRows: 2, boardCols: 2,
      signupMode: "duo", buyinAmount: 10_000_000, bonusPotAmount: 5_000_000, rulesMarkdown: "# Rules\n\nDo the thing.",
      createdByUserId: admin.id,
    })
    .returning()
    .get();

  const category = createCategory(db, { bingoId: bingo.id, label: "Bosses", colorHex: "#e74c3c", sortOrder: 0 });

  // Tile A: two tasks, Part B gated on Part A (cross-task gate — the case
  // that needs localId remapping since Part A's real id won't survive re-import).
  const tileA = createTile(db, { bingoId: bingo.id, name: "Tile A", boardRow: 0, boardCol: 0, categoryId: category.id, hasFreezePeriod: true, freezeDurationMinutes: 120, notes: "freeze note", imageUrl: "/uploads/should-not-export.png" });
  const partA = createTask(db, tileA.id, { kind: "ITEM", label: "Part A", points: 25, itemName: "Vorki" }, 0);
  const partB = createTask(db, tileA.id, { kind: "ITEM", label: "Part B", points: 35, itemName: "Draconic visage", pointsGateNodeId: partA.id, submitGateNodeId: partA.id }, 1);

  // Tile B: a SUM(2) over one ITEM child, no category.
  const tileB = createTile(db, { bingoId: bingo.id, name: "Tile B", boardRow: 0, boardCol: 1 });
  createTask(db, tileB.id, { kind: "SUM", label: "Drops", points: 40, quantity: 2, children: [{ kind: "ITEM", itemName: "Cerberus drop" }] }, 0);

  createTile(db, { bingoId: bingo.id, name: "Tile C", boardRow: 1, boardCol: 0 });
  createTile(db, { bingoId: bingo.id, name: "Tile D", boardRow: 1, boardCol: 1 });

  const lines = generateLines(db, bingo, 15);
  const row0 = lines.find((l) => l.lineType === "row" && l.lineIndex === 0)!;
  updateLinePoints(db, row0.id, 42);

  createQuestion(db, { bingoId: bingo.id, prompt: "Willing to captain?", type: "boolean", required: true, sortOrder: 0 });
  createQuestion(db, { bingoId: bingo.id, prompt: "Preferred role", type: "select", optionsJson: JSON.stringify(["dps", "support"]), required: false, sortOrder: 1 });

  return { bingo, admin, category, tileA, partA, partB, tileB };
}

describe("exportBingo", () => {
  it("excludes tile images and any user/team/signup reference", () => {
    const { bingo } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    const json = JSON.stringify(doc);
    expect(json).not.toContain("should-not-export.png");
    expect(json).not.toContain("imageUrl");
    expect(json).not.toContain("userId");
    expect(json).not.toContain("createdByUserId");
  });

  it("uses localIds instead of raw node UUIDs for gates", () => {
    const { bingo, partA, partB } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    const json = JSON.stringify(doc);
    expect(json).not.toContain(partA.id);
    expect(json).not.toContain(partB.id);

    const tileA = doc.tiles.find((t) => t.name === "Tile A")!;
    const exportedA = tileA.tasks.find((t) => t.label === "Part A")!;
    const exportedB = tileA.tasks.find((t) => t.label === "Part B")!;
    expect(exportedB.pointsGateLocalId).toBe(exportedA.localId);
    expect(exportedB.submitGateLocalId).toBe(exportedA.localId);
  });

  it("captures settings, categories, lines, and signup questions", () => {
    const { bingo } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);

    expect(doc.bingo).toMatchObject({ name: "Source Bingo", theme: "comic", boardRows: 2, boardCols: 2, signupMode: "duo", buyinAmount: 10_000_000, bonusPotAmount: 5_000_000 });
    expect(doc.categories).toHaveLength(1);
    expect(doc.categories[0]).toMatchObject({ label: "Bosses", colorHex: "#e74c3c" });
    expect(doc.tiles).toHaveLength(4);
    expect(doc.lines.find((l) => l.lineType === "row" && l.lineIndex === 0)?.points).toBe(42);
    expect(doc.signupQuestions.map((q) => q.prompt).sort()).toEqual(["Preferred role", "Willing to captain?"]);
  });
});

describe("importBingo", () => {
  it("round-trips a full board into a new bingo, resolving gates to the new node ids", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);

    const imported = importBingo(db, doc, { slug: "target", createdByUserId: admin.id });
    expect(imported.slug).toBe("target");
    expect(imported.id).not.toBe(source.id);

    const tiles = getBoardTiles(db, imported.id);
    expect(tiles).toHaveLength(4);
    const tileA = tiles.find((t) => t.name === "Tile A")!;
    expect(tileA.hasFreezePeriod).toBe(true);
    expect(tileA.freezeDurationMinutes).toBe(120);
    expect(tileA.imageUrl).toBeNull();

    const partA = tileA.node.children.find((n) => n.label === "Part A")!;
    const partB = tileA.node.children.find((n) => n.label === "Part B")!;
    expect(partA.id).not.toBe(source.id); // sanity: these are genuinely new rows
    expect(partB.pointsGateNodeId).toBe(partA.id);
    expect(partB.submitGateNodeId).toBe(partA.id);

    const tileB = tiles.find((t) => t.name === "Tile B")!;
    const sum = tileB.node.children.find((n) => n.kind === "SUM")!;
    expect(sum.quantity).toBe(2);
    expect(sum.children[0]?.itemName).toBe("Cerberus drop");

    const rows = db.select().from(schema.bingoLines).where(eq(schema.bingoLines.bingoId, imported.id)).all();
    expect(rows).toHaveLength(6); // 2x2 board: 2 rows + 2 cols + 2 diagonals
  });

  it("carries over settings and signup questions", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    const imported = importBingo(db, doc, { slug: "target2", name: "Renamed On Import", createdByUserId: admin.id });

    const row = getBingoBySlug(db, "target2")!;
    expect(row.name).toBe("Renamed On Import");
    expect(row.signupMode).toBe("duo");
    expect(row.buyinAmount).toBe(10_000_000);
    expect(row.rulesMarkdown).toContain("Do the thing");

    const questions = db.select().from(schema.signupQuestions).where(eq(schema.signupQuestions.bingoId, imported.id)).all();
    expect(questions.map((q) => q.prompt).sort()).toEqual(["Preferred role", "Willing to captain?"]);
  });

  it("records bingo.created with source: \"import\", plus per-item audit rows for the created structure", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    const imported = importBingo(db, doc, { slug: "target3", createdByUserId: admin.id });

    const created = db.select().from(schema.auditLog).where(eq(schema.auditLog.bingoId, imported.id)).all();
    const bingoCreated = created.find((r) => r.action === "bingo.created")!;
    expect(JSON.parse(bingoCreated.details)).toMatchObject({ source: "import" });
    expect(created.some((r) => r.action === "tile.created")).toBe(true);
    expect(created.some((r) => r.action === "task.created")).toBe(true);
    expect(created.some((r) => r.action === "line.generated")).toBe(true);
    expect(created.some((r) => r.action === "question.created")).toBe(true);
  });

  it("rejects a document from a newer format version", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    expect(() => importBingo(db, { ...doc, formatVersion: 999 }, { slug: "future", createdByUserId: admin.id })).toThrow(ServiceError);
  });

  it("rejects a tile positioned outside the declared board dimensions", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    const bad = { ...doc, tiles: [{ ...doc.tiles[0]!, boardRow: 99 }] };
    expect(() => importBingo(db, bad, { slug: "bad-position", createdByUserId: admin.id })).toThrow(ServiceError);
  });

  it("rejects a dangling gate reference, leaving no partial bingo behind", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    const tileA = doc.tiles.find((t) => t.name === "Tile A")!;
    const partB = tileA.tasks.find((t) => t.label === "Part B")!;
    partB.pointsGateLocalId = 99999;

    expect(() => importBingo(db, doc, { slug: "dangling-gate", createdByUserId: admin.id })).toThrow(ServiceError);
    expect(getBingoBySlug(db, "dangling-gate")).toBeUndefined();
  });

  it("rejects a slug collision the same way createBingo already does", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    expect(() => importBingo(db, doc, { slug: "source", createdByUserId: admin.id })).toThrow(/already exists/);
  });
});
