import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { and, count, eq, getTableColumns, inArray } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { exportBingo, importBingo, importBingoWithImages } from "./bingoExportService";
import { createCategory, createTask, createTile, deleteLine, generateLines, getBoardLines, getBoardTiles, updateLinePoints, updateTileBonusPoints } from "./boardService";
import { createQuestion } from "./signupService";
import { createCategory as createSuperlativeCategory, getCategories as getSuperlativeCategories } from "./superlativeService";
import { getBingoBySlug, toPublicBingo, updateBingoSettings } from "./bingoService";
import * as achievementService from "./achievementService";
import { additionalCredits, setAdditionalCredits } from "./wrappedArtService";
import { ServiceError } from "./errors";
import { ACHIEVEMENT_KEYS, exclusivityConflicts, type BingoExportDocument } from "@bingo/shared";
import { placeLeaves } from "./exclusivityService";

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
      signupMode: "duo", cutMode: "pairs_only", warnLeftovers: true, buyinAmount: 10_000_000, bonusPotAmount: 5_000_000, rulesMarkdown: "# Rules\n\nDo the thing.",
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

  // Tile C: nothing but the bonus for completing every task (stored on the tile's own node).
  const tileC = createTile(db, { bingoId: bingo.id, name: "Tile C", boardRow: 1, boardCol: 0 });
  updateTileBonusPoints(db, tileC.id, 25);

  // Tile D: a leaf and a whole ANY block that each sit under BOTH tasks (the editor's "link an existing
  // item/condition"), so the graph is not a tree. The second task lists its own item between the two
  // shared nodes, to check order survives.
  const tileD = createTile(db, { bingoId: bingo.id, name: "Tile D", boardRow: 1, boardCol: 1 });
  const taskOne = createTask(db, tileD.id, {
    kind: "ALL", label: "One", points: 10,
    children: [{ kind: "ITEM", itemName: "Shared leaf" }, { kind: "ANY", label: "Shared block", children: [{ kind: "ITEM", itemName: "Block a" }, { kind: "ITEM", itemName: "Block b" }] }],
  }, 0);
  const taskTwo = createTask(db, tileD.id, { kind: "ALL", label: "Two", points: 20, children: [{ kind: "ITEM", itemName: "Own item" }] }, 1);
  const sharedLeaf = taskOne.children.find((n) => n.itemName === "Shared leaf")!;
  const sharedBlock = taskOne.children.find((n) => n.label === "Shared block")!;
  const ownItem = taskTwo.children[0]!;
  db.update(schema.nodeEdges).set({ sortOrder: 1 }).where(eq(schema.nodeEdges.childId, ownItem.id)).run();
  db.insert(schema.nodeEdges).values({ parentId: taskTwo.id, childId: sharedLeaf.id, sortOrder: 0 }).run();
  db.insert(schema.nodeEdges).values({ parentId: taskTwo.id, childId: sharedBlock.id, sortOrder: 2 }).run();

  const lines = generateLines(db, bingo, 15);
  const row0 = lines.find((l) => l.lineType === "row" && l.lineIndex === 0)!;
  updateLinePoints(db, row0.id, 42);

  createQuestion(db, { bingoId: bingo.id, prompt: "Willing to captain?", helperText: "Captains lead a team of about 14.", type: "boolean", required: true, sortOrder: 0 });
  createQuestion(db, { bingoId: bingo.id, prompt: "Preferred role", type: "select", optionsJson: JSON.stringify(["dps", "support"]), allowOther: true, required: false, sortOrder: 1 });
  createQuestion(db, { bingoId: bingo.id, prompt: "Who would you like to play with?", type: "member", multiplePicks: true, maxPicks: 3, sortOrder: 2 });

  createSuperlativeCategory(db, { bingoId: bingo.id, name: "Team MVP" });
  createSuperlativeCategory(db, { bingoId: bingo.id, name: "Team Spirit" });

  return { bingo, admin, category, tileA, partA, partB, tileB, tileC, tileD, sharedLeaf, sharedBlock };
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
    expect(doc.signupQuestions.map((q) => q.prompt).sort()).toEqual(["Preferred role", "Who would you like to play with?", "Willing to captain?"]);
    expect(doc.superlativeCategories?.map((c) => c.name)).toEqual(["Team MVP", "Team Spirit"]);
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

  it("carries exclusivity rules over, and reads an older file with none", () => {
    const { bingo: source, admin } = seedFullBingo();
    updateBingoSettings(db, source.id, { exclusivityRules: [{ id: "r1", label: "Pets", itemNames: ["Baron"], scope: "tile" }] });
    const doc = exportBingo(db, source.id);
    expect(doc.bingo.exclusivityRules).toEqual([{ id: "r1", label: "Pets", itemNames: ["Baron"], scope: "tile" }]);

    importBingo(db, doc, { slug: "with-rules", name: "With rules", createdByUserId: admin.id });
    expect(toPublicBingo(getBingoBySlug(db, "with-rules")!).exclusivityRules.map((r) => [r.label, r.scope])).toEqual([["Pets", "tile"]]);

    const { exclusivityRules: _dropped, ...oldBingo } = doc.bingo;
    importBingo(db, { ...doc, bingo: oldBingo }, { slug: "no-rules", name: "No rules", createdByUserId: admin.id });
    expect(toPublicBingo(getBingoBySlug(db, "no-rules")!).exclusivityRules).toEqual([]);
  });

  it("carries a rule's groups over exactly, as a file, and the imported copy locks the same way", () => {
    const { bingo: source, admin } = seedFullBingo();
    const rule = {
      id: "r1",
      label: "Uniques",
      itemNames: ["Own item", "Vorki", "Cerberus drop"],
      scope: "tile" as const,
      groups: [{ label: "Boss piece", itemNames: ["Vorki", "Cerberus drop"] }],
    };
    const plain = { id: "r2", label: "Pets", itemNames: ["Block a"], scope: "part" as const };
    updateBingoSettings(db, source.id, { exclusivityRules: [rule, plain] });
    // Through JSON, as the downloaded file is.
    const doc = JSON.parse(JSON.stringify(exportBingo(db, source.id))) as BingoExportDocument;
    expect(doc.bingo.exclusivityRules).toEqual([rule, plain]);

    const imported = importBingo(db, doc, { slug: "with-groups", name: "With groups", createdByUserId: admin.id });
    const rules = toPublicBingo(getBingoBySlug(db, "with-groups")!).exclusivityRules;
    expect(rules).toEqual([rule, plain]);
    expect(rules[1]).not.toHaveProperty("groups"); // a rule without groups stays as it was

    // A Claim on one piece (Vorki, Tile A) locks the other piece (Cerberus drop) on Tile B of the imported copy.
    const itemNode = (name: string) => db.select().from(schema.nodes).where(and(eq(schema.nodes.bingoId, imported.id), eq(schema.nodes.itemName, name))).get()!.id;
    const leaves = placeLeaves(db, imported.id);
    const [conflict] = exclusivityConflicts(rules, leaves, [itemNode("Vorki")], [itemNode("Cerberus drop")]);
    expect(conflict).toMatchObject({ itemName: "Cerberus drop", usedOn: "Tile A (Vorki)", group: "Boss piece" });
    expect(exclusivityConflicts(rules, leaves, [itemNode("Vorki")], [itemNode("Own item")])).toEqual([]);
  });

  it("refuses a file whose groups can't work, leaving no partial bingo", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    const twice = [{ id: "x", label: "Pets", itemNames: ["Vorki"], scope: "tile" as const, groups: [{ label: "A", itemNames: ["Vorki"] }, { label: "B", itemNames: ["vorki"] }] }];
    expect(() => importBingo(db, { ...doc, bingo: { ...doc.bingo, exclusivityRules: twice } }, { slug: "broken", name: "Broken", createdByUserId: admin.id })).toThrow(/in two groups/);
    expect(getBingoBySlug(db, "broken")).toBeUndefined();
  });

  it("carries each category's additional credits over, and an older file without them keeps what a new bingo starts with (#281)", () => {
    const { bingo: source, admin } = seedFullBingo();
    setAdditionalCredits(db, source, "moderators", [{ name: " Zezima ", role: "Head mod" }, { name: "Woox", role: "" }]);
    const doc = exportBingo(db, source.id);
    expect(doc.wrappedArtCredits).toEqual({ moderators: [{ name: "Zezima", role: "Head mod" }, { name: "Woox", role: null }] });
    expect(doc.bingo).not.toHaveProperty("wrappedCredits");

    const imported = importBingo(db, doc, { slug: "with-credits", name: "With credits", createdByUserId: admin.id });
    expect(additionalCredits(db, imported.id)).toEqual(doc.wrappedArtCredits);

    // A new bingo copies the newest one's credits; a file without any leaves that copy alone.
    const { wrappedArtCredits: _dropped, ...older } = doc;
    const plain = importBingo(db, older, { slug: "no-credits", name: "No credits", createdByUserId: admin.id });
    expect(additionalCredits(db, plain.id)).toEqual(doc.wrappedArtCredits);
  });

  it("reads an older file's Bingo-wide Credits as the Outro's additional credits (#281)", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    const older = { ...doc, bingo: { ...doc.bingo, wrappedCredits: [{ name: "Zezima", role: "Board design" }, { name: " ", role: null }] } };
    const imported = importBingo(db, older, { slug: "old-credits", name: "Old credits", createdByUserId: admin.id });
    expect(additionalCredits(db, imported.id)).toEqual({ outro: [{ name: "Zezima", role: "Board design" }] });
  });

  it("rejects additional credits for an unknown category, or a credit without a name", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    expect(() => importBingo(db, { ...doc, wrappedArtCredits: { nope: [] } as never }, { slug: "bad-1", name: "Bad", createdByUserId: admin.id })).toThrow(/unknown Wrapped art category/);
    expect(() => importBingo(db, { ...doc, wrappedArtCredits: { outro: [{ name: "", role: "Art" }] } }, { slug: "bad-2", name: "Bad", createdByUserId: admin.id })).toThrow(/needs a name/);
  });

  it("rejects a document whose exclusivity rules are malformed, leaving no partial bingo", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    const broken = { ...doc, bingo: { ...doc.bingo, exclusivityRules: [{ id: "x", label: "Pets", itemNames: [], scope: "tile" as const }] } };
    expect(() => importBingo(db, broken, { slug: "broken", name: "Broken", createdByUserId: admin.id })).toThrow(ServiceError);
    expect(getBingoBySlug(db, "broken")).toBeUndefined();
  });

  it("carries switched-on Achievements over, and switches on every catalogue key when the field is absent", () => {
    const { bingo: source, admin } = seedFullBingo();
    const now = new Date("2026-01-01T00:00:00Z");
    db.transaction((tx) => achievementService.initializeAchievementSettings(tx, source.id, now));
    db.transaction((tx) => achievementService.applyAchievementSwitches(tx, source.id, { strong_start: false, hypeman: false }));
    const doc = exportBingo(db, source.id);
    expect(doc.achievementKeys?.sort()).toEqual(ACHIEVEMENT_KEYS.filter((k) => k !== "strong_start" && k !== "hypeman").slice().sort());

    const imported = importBingo(db, doc, { slug: "some-achievements", createdByUserId: admin.id });
    const enabled = achievementService.getAchievementSettings(db, imported.id).filter((a) => a.enabled).map((a) => a.key);
    expect(enabled.sort()).toEqual(doc.achievementKeys!.slice().sort());
    expect(enabled).not.toContain("strong_start");

    // No achievementKeys field at all (an older export, or one that never touched the switches): every key is on.
    const { achievementKeys: _dropped, ...docWithoutField } = doc;
    const importedAll = importBingo(db, docWithoutField, { slug: "all-achievements", createdByUserId: admin.id });
    expect(achievementService.getAchievementSettings(db, importedAll.id).every((a) => a.enabled)).toBe(true);
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
    expect(questions.map((q) => q.prompt).sort()).toEqual(["Preferred role", "Who would you like to play with?", "Willing to captain?"]);
    expect(Object.fromEntries(questions.map((q) => [q.prompt, q.helperText]))).toEqual({ "Willing to captain?": "Captains lead a team of about 14.", "Preferred role": null, "Who would you like to play with?": null });
    expect(Object.fromEntries(questions.map((q) => [q.prompt, q.allowOther]))).toEqual({ "Willing to captain?": false, "Preferred role": true, "Who would you like to play with?": false });
    expect(questions.find((q) => q.type === "member")).toMatchObject({ multiplePicks: true, maxPicks: 3 });

    const superlatives = getSuperlativeCategories(db, imported.id);
    expect(superlatives.map((c) => c.name)).toEqual(["Team MVP", "Team Spirit"]);
  });

  it("carries Feedback questions with their audience, never their answers, and reads a file from before them", () => {
    const { bingo: source, admin } = seedFullBingo();
    const general = createQuestion(db, { bingoId: source.id, form: "feedback", prompt: "How was it?", helperText: "Be kind", type: "textarea", sortOrder: 0 });
    createQuestion(db, { bingoId: source.id, form: "feedback", prompt: "Draft?", type: "select", optionsJson: JSON.stringify(["good", "bad"]), allowOther: true, required: true, audience: "captains", sortOrder: 1 });
    const response = db.insert(schema.feedbackResponses).values({ bingoId: source.id, kind: "player", respondentKey: "k", keyCheck: "c" }).returning().get();
    db.insert(schema.feedbackAnswers).values({ responseId: response.id, questionId: general.id, value: "Loved it" }).run();

    const doc = exportBingo(db, source.id);
    expect(doc.signupQuestions.map((q) => q.prompt).sort()).toEqual(["Preferred role", "Who would you like to play with?", "Willing to captain?"]);
    expect(doc.feedbackQuestions).toEqual([
      expect.objectContaining({ prompt: "How was it?", helperText: "Be kind", type: "textarea", audience: "all" }),
      expect.objectContaining({ prompt: "Draft?", type: "select", allowOther: true, required: true, audience: "captains" }),
    ]);
    expect(doc.feedbackQuestions![0]).not.toHaveProperty("visibility");
    expect(JSON.stringify(doc)).not.toContain("Loved it");

    const imported = importBingo(db, JSON.parse(JSON.stringify(doc)) as BingoExportDocument, { slug: "with-feedback", createdByUserId: admin.id });
    const restored = db.select().from(schema.signupQuestions).where(and(eq(schema.signupQuestions.bingoId, imported.id), eq(schema.signupQuestions.form, "feedback"))).orderBy(schema.signupQuestions.sortOrder).all();
    expect(restored.map((q) => [q.prompt, q.audience, q.required, q.allowOther])).toEqual([["How was it?", "all", false, false], ["Draft?", "captains", true, true]]);
    expect(db.select().from(schema.feedbackResponses).where(eq(schema.feedbackResponses.bingoId, imported.id)).all()).toEqual([]);
    // The signup form is untouched by them.
    expect(db.select().from(schema.signupQuestions).where(and(eq(schema.signupQuestions.bingoId, imported.id), eq(schema.signupQuestions.form, "signup"))).all()).toHaveLength(3);

    delete (doc as { feedbackQuestions?: unknown }).feedbackQuestions;
    const older = importBingo(db, doc, { slug: "before-feedback", createdByUserId: admin.id });
    expect(db.select().from(schema.signupQuestions).where(and(eq(schema.signupQuestions.bingoId, older.id), eq(schema.signupQuestions.form, "feedback"))).all()).toEqual([]);
  });

  it("imports a file exported before Superlative categories existed", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    delete (doc as { superlativeCategories?: unknown }).superlativeCategories;
    const imported = importBingo(db, doc, { slug: "old-file-2", name: "Old", createdByUserId: admin.id });
    expect(getSuperlativeCategories(db, imported.id)).toEqual([]);
  });

  it("imports only the first 3 Superlative categories of a file exported before the cap", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    doc.superlativeCategories = ["Four", "Two", "One", "Three"].map((name) => ({ name, sortOrder: ["One", "Two", "Three", "Four"].indexOf(name) }));
    const imported = importBingo(db, doc, { slug: "over-cap", name: "Over", createdByUserId: admin.id });
    expect(getSuperlativeCategories(db, imported.id).map((c) => c.name)).toEqual(["One", "Two", "Three"]);
  });

  it("imports a file exported before questions had helper text", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    for (const q of doc.signupQuestions) delete (q as { helperText?: string | null }).helperText;
    const imported = importBingo(db, doc, { slug: "old-file", name: "Old", createdByUserId: admin.id });
    const questions = db.select().from(schema.signupQuestions).where(eq(schema.signupQuestions.bingoId, imported.id)).all();
    expect(questions).toHaveLength(3);
    expect(questions.every((q) => q.helperText === null)).toBe(true);
  });

  it("imports a file exported before Member pick questions with one pick and no maximum", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    for (const q of doc.signupQuestions) {
      delete (q as { multiplePicks?: boolean }).multiplePicks;
      delete (q as { maxPicks?: number | null }).maxPicks;
    }
    // An older file has no Member pick, so it never carried these; drop the one the fixture made.
    doc.signupQuestions = doc.signupQuestions.filter((q) => q.type !== "member");
    const imported = importBingo(db, doc, { slug: "pre-member-pick", name: "Old", createdByUserId: admin.id });
    const questions = db.select().from(schema.signupQuestions).where(eq(schema.signupQuestions.bingoId, imported.id)).all();
    expect(questions).toHaveLength(2);
    expect(questions.every((q) => q.multiplePicks === false && q.maxPicks === null)).toBe(true);
  });

  it("imports a file exported before choice questions could allow Other with Other off", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    for (const q of doc.signupQuestions) delete (q as { allowOther?: boolean }).allowOther;
    const imported = importBingo(db, doc, { slug: "older-file", name: "Older", createdByUserId: admin.id });
    const questions = db.select().from(schema.signupQuestions).where(eq(schema.signupQuestions.bingoId, imported.id)).all();
    expect(questions).toHaveLength(3);
    expect(questions.every((q) => q.allowOther === false)).toBe(true);
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

// ---------------------------------------------------------------------------
// Nothing slips through: what a document carries, checked against the database
// ---------------------------------------------------------------------------

function nodeAndEdgeCounts(bingoId: string) {
  const nodeIds = db.select({ id: schema.nodes.id }).from(schema.nodes).where(eq(schema.nodes.bingoId, bingoId)).all().map((r) => r.id);
  const edges = nodeIds.length ? db.select({ n: count() }).from(schema.nodeEdges).where(inArray(schema.nodeEdges.parentId, nodeIds)).get()!.n : 0;
  return { nodes: nodeIds.length, edges };
}

describe("the tile bonus", () => {
  it("is exported and imported: the points for completing every task on a tile", () => {
    const { bingo: source, admin } = seedFullBingo();
    const doc = exportBingo(db, source.id);
    expect(doc.tiles.find((t) => t.name === "Tile C")!.bonusPoints).toBe(25);
    expect(doc.tiles.find((t) => t.name === "Tile A")!.bonusPoints).toBe(0);

    const imported = importBingo(db, doc, { slug: "bonus-target", createdByUserId: admin.id });
    const tiles = getBoardTiles(db, imported.id);
    expect(tiles.find((t) => t.name === "Tile C")!.node.points).toBe(25);
    expect(tiles.find((t) => t.name === "Tile A")!.node.points).toBe(0);
  });

  it("is absent (meaning none) in a file exported before it existed, and can't be negative or fractional", () => {
    const { bingo, admin } = seedFullBingo();
    const old = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
    for (const t of old.tiles) delete t.bonusPoints;
    const imported = importBingo(db, old, { slug: "old-file", createdByUserId: admin.id });
    expect(getBoardTiles(db, imported.id).every((t) => t.node.points === 0)).toBe(true);

    for (const bad of [-5, 2.5]) {
      const doc = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
      doc.tiles[0]!.bonusPoints = bad;
      expect(() => importBingo(db, doc, { slug: `bad-bonus-${bad}`, createdByUserId: admin.id })).toThrow(ServiceError);
    }
  });
});

describe("settings", () => {
  it("carries the cut mode over, and defaults it for a file that predates it", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    expect(doc.bingo).toMatchObject({ cutMode: "pairs_only", warnLeftovers: true });
    const imported = importBingo(db, doc, { slug: "settings-target", createdByUserId: admin.id });
    expect(getBingoBySlug(db, "settings-target")).toMatchObject({ id: imported.id, cutMode: "pairs_only", warnLeftovers: true });

    const old = JSON.parse(JSON.stringify(doc)) as BingoExportDocument;
    delete old.bingo.cutMode;
    delete old.bingo.warnLeftovers;
    importBingo(db, old, { slug: "settings-old", createdByUserId: admin.id });
    expect(getBingoBySlug(db, "settings-old")).toMatchObject({ cutMode: "even", warnLeftovers: false });
  });

  it("carries \"Show screenshots once Finished\" over, and shows them for a file that predates it", () => {
    const { bingo, admin } = seedFullBingo();
    db.update(schema.bingos).set({ showScreenshotsWhenFinished: false }).where(eq(schema.bingos.id, bingo.id)).run();
    const doc = exportBingo(db, bingo.id);
    expect(doc.bingo.showScreenshotsWhenFinished).toBe(false);
    importBingo(db, doc, { slug: "screenshots-off", createdByUserId: admin.id });
    expect(getBingoBySlug(db, "screenshots-off")?.showScreenshotsWhenFinished).toBe(false);

    const old = JSON.parse(JSON.stringify(doc)) as BingoExportDocument;
    delete old.bingo.showScreenshotsWhenFinished;
    importBingo(db, old, { slug: "screenshots-old", createdByUserId: admin.id });
    expect(getBingoBySlug(db, "screenshots-old")?.showScreenshotsWhenFinished).toBe(true);
  });

  it("reads the setting cutMode replaced, from older files", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
    delete doc.bingo.cutMode;
    doc.bingo.leftoverMode = "singles";
    importBingo(db, doc, { slug: "settings-singles", createdByUserId: admin.id });
    expect(getBingoBySlug(db, "settings-singles")).toMatchObject({ cutMode: "none" });
    doc.bingo.leftoverMode = "cut";
    importBingo(db, doc, { slug: "settings-cut", createdByUserId: admin.id });
    expect(getBingoBySlug(db, "settings-cut")).toMatchObject({ cutMode: "even" });
  });

  it("carries Sealed Tiles and Hide rules over, and reads an older file without them as off", () => {
    const { bingo, admin } = seedFullBingo();
    updateBingoSettings(db, bingo.id, { sealedTiles: true, hideRules: true });
    const doc = exportBingo(db, bingo.id);
    expect(doc.bingo).toMatchObject({ sealedTiles: true, hideRules: true });
    importBingo(db, doc, { slug: "sealed-target", createdByUserId: admin.id });
    expect(getBingoBySlug(db, "sealed-target")).toMatchObject({ sealedTiles: true, hideRules: true });

    const old = JSON.parse(JSON.stringify(doc)) as BingoExportDocument;
    delete old.bingo.sealedTiles;
    delete old.bingo.hideRules;
    importBingo(db, old, { slug: "sealed-old", createdByUserId: admin.id });
    expect(getBingoBySlug(db, "sealed-old")).toMatchObject({ sealedTiles: false, hideRules: false });
  });

  it("rejects a document whose Sealed Tiles setting isn't true or false", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
    (doc.bingo as { sealedTiles?: unknown }).sealedTiles = "yes";
    expect(() => importBingo(db, doc, { slug: "bad-sealed", createdByUserId: admin.id })).toThrow(ServiceError);
  });

  it("rejects a cut mode it doesn't know", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
    (doc.bingo as { cutMode?: string }).cutMode = "banish";
    expect(() => importBingo(db, doc, { slug: "bad-cut", createdByUserId: admin.id })).toThrow(ServiceError);
  });
});

describe("lines", () => {
  const importedLines = (bingoId: string) =>
    db.select().from(schema.bingoLines).where(eq(schema.bingoLines.bingoId, bingoId)).all().map((l) => `${l.lineType}:${l.lineIndex}`).sort();

  it("come across as the source has them: none when it has none", () => {
    const { bingo, admin } = seedFullBingo();
    for (const line of db.select().from(schema.bingoLines).where(eq(schema.bingoLines.bingoId, bingo.id)).all()) deleteLine(db, line.id);
    const doc = exportBingo(db, bingo.id);
    expect(doc.lines).toEqual([]);
    const imported = importBingo(db, doc, { slug: "no-lines", createdByUserId: admin.id });
    expect(importedLines(imported.id)).toEqual([]);
  });

  it("come across as the source has them: only the ones it kept, with their points", () => {
    const { bingo, admin } = seedFullBingo();
    const all = db.select().from(schema.bingoLines).where(eq(schema.bingoLines.bingoId, bingo.id)).all();
    const gone = all.find((l) => l.lineType === "column" && l.lineIndex === 1)!;
    deleteLine(db, gone.id);
    const imported = importBingo(db, exportBingo(db, bingo.id), { slug: "some-lines", createdByUserId: admin.id });
    expect(importedLines(imported.id)).toEqual(importedLines(bingo.id));
    expect(importedLines(imported.id)).not.toContain("column:1");
    expect(importedLines(imported.id)).toHaveLength(5);
    const row0 = getBoardLines(db, imported.id).find((l) => l.lineType === "row" && l.lineIndex === 0)!;
    expect(row0.node.points).toBe(42);
  });
});

describe("Counts as", () => {
  function withWeightedItem() {
    const seeded = seedFullBingo();
    createTask(db, seeded.tileB.id, { kind: "SUM", label: "Pages", points: 20, quantity: 200, children: [{ kind: "ITEM", itemName: "Burnt page" }, { kind: "ITEM", itemName: "Pyromancer garb", countsAs: 25 }] }, 1);
    return seeded;
  }
  const weights = (tasks: { label: string | null; children: { itemName: string | null; countsAs?: number }[] }[]) => tasks.find((t) => t.label === "Pages")!.children.map((c) => [c.itemName, c.countsAs]);

  it("round-trips an Item's Counts as through export and import", () => {
    const { bingo, admin } = withWeightedItem();
    const doc = exportBingo(db, bingo.id);
    expect(weights(doc.tiles.find((t) => t.name === "Tile B")!.tasks)).toEqual([["Burnt page", 1], ["Pyromancer garb", 25]]);
    const imported = importBingo(db, doc, { slug: "weighted-target", createdByUserId: admin.id });
    const tile = getBoardTiles(db, imported.id).find((t) => t.name === "Tile B")!;
    expect(weights(tile.node.children)).toEqual([["Burnt page", 1], ["Pyromancer garb", 25]]);
  });

  it("reads a file exported before Counts as existed as 1", () => {
    const { bingo, admin } = withWeightedItem();
    const doc = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
    const strip = (n: { countsAs?: number; children: unknown[] }) => {
      delete n.countsAs;
      n.children.forEach((c) => strip(c as typeof n));
    };
    for (const t of doc.tiles) t.tasks.forEach(strip);
    const imported = importBingo(db, doc, { slug: "unweighted-target", createdByUserId: admin.id });
    expect(weights(getBoardTiles(db, imported.id).find((t) => t.name === "Tile B")!.node.children)).toEqual([["Burnt page", 1], ["Pyromancer garb", 1]]);
  });

  it("refuses an Item counting as less than 1, leaving no partial bingo", () => {
    const { bingo, admin } = withWeightedItem();
    const doc = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
    doc.tiles.find((t) => t.name === "Tile B")!.tasks.find((t) => t.label === "Pages")!.children[1]!.countsAs = 0;
    expect(() => importBingo(db, doc, { slug: "bad-weight", createdByUserId: admin.id })).toThrow(/Counts as/);
    expect(getBingoBySlug(db, "bad-weight")).toBeUndefined();
  });
});

describe("nodes shared between parents", () => {
  it("are exported once, then referred back to by the same localId", () => {
    const { bingo } = seedFullBingo();
    const tileD = exportBingo(db, bingo.id).tiles.find((t) => t.name === "Tile D")!;
    const [one, two] = tileD.tasks;
    const leaf = one!.children.find((n) => n.itemName === "Shared leaf")!;
    const block = one!.children.find((n) => n.label === "Shared block")!;
    expect(leaf.reuse).toBeUndefined();
    expect(block.children).toHaveLength(2);

    expect(two!.children.map((n) => n.itemName ?? n.label)).toEqual(["Shared leaf", "Own item", "Shared block"]);
    const [leafRef, , blockRef] = two!.children;
    expect(leafRef).toMatchObject({ localId: leaf.localId, reuse: true });
    expect(blockRef).toMatchObject({ localId: block.localId, reuse: true, children: [] });
  });

  it("stay shared on import: one node under two parents, not a copy under each", () => {
    const { bingo: source, admin } = seedFullBingo();
    const imported = importBingo(db, exportBingo(db, source.id), { slug: "shared-target", createdByUserId: admin.id });

    const tileD = getBoardTiles(db, imported.id).find((t) => t.name === "Tile D")!;
    const [one, two] = tileD.node.children;
    expect(two!.children.map((n) => n.itemName ?? n.label)).toEqual(["Shared leaf", "Own item", "Shared block"]);
    expect(two!.children[0]!.id).toBe(one!.children.find((n) => n.itemName === "Shared leaf")!.id);
    expect(two!.children[2]!.id).toBe(one!.children.find((n) => n.label === "Shared block")!.id);
    expect(two!.children[2]!.children.map((n) => n.itemName)).toEqual(["Block a", "Block b"]);
  });

  it("leave the imported bingo with exactly the source's nodes and edges", () => {
    const { bingo: source, admin } = seedFullBingo();
    const imported = importBingo(db, exportBingo(db, source.id), { slug: "count-target", createdByUserId: admin.id });
    expect(nodeAndEdgeCounts(imported.id)).toEqual(nodeAndEdgeCounts(source.id));
  });

  it("import as separate copies from a file exported before sharing was preserved, as before", () => {
    const { bingo, admin } = seedFullBingo();
    const old = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
    // What an old export looked like: no stubs, every occurrence its own full copy.
    const tileD = old.tiles.find((t) => t.name === "Tile D")!;
    const full = tileD.tasks[0]!.children;
    tileD.tasks[1]!.children = [{ ...full[0]! }, tileD.tasks[1]!.children[1]!, { ...full[1]!, children: full[1]!.children.map((c) => ({ ...c })) }];
    for (const c of tileD.tasks[1]!.children) delete c.reuse;
    const imported = importBingo(db, old, { slug: "old-shared", createdByUserId: admin.id });
    const d = getBoardTiles(db, imported.id).find((t) => t.name === "Tile D")!;
    expect(d.node.children[1]!.children.map((n) => n.itemName ?? n.label)).toEqual(["Shared leaf", "Own item", "Shared block"]);
    expect(d.node.children[1]!.children[0]!.id).not.toBe(d.node.children[0]!.children[0]!.id);
  });

  it("reject a reference to a node the file never defines, leaving no partial bingo", () => {
    const { bingo, admin } = seedFullBingo();
    const doc = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
    const two = doc.tiles.find((t) => t.name === "Tile D")!.tasks[1]!;
    two.children[0]!.localId = 424242;
    expect(() => importBingo(db, doc, { slug: "dangling-ref", createdByUserId: admin.id })).toThrow(ServiceError);
    expect(getBingoBySlug(db, "dangling-ref")).toBeUndefined();
  });
});

// A guard for the next field someone adds: every column of what a document describes must either be
// exported (under the name it is exported as) or be listed here as deliberately left out. A new setting
// or board field fails this until it is handled one way or the other.
describe("every column is accounted for", () => {
  // `synthetic`: keys a document has that aren't columns (an id local to the file, a nested list...).
  function accounted(table: Parameters<typeof getTableColumns>[0], exportedKeys: string[], left: string[], synthetic: string[] = []) {
    const exported = exportedKeys.filter((k) => !synthetic.includes(k));
    const columns = Object.keys(getTableColumns(table));
    expect(columns.filter((c) => !exported.includes(c) && !left.includes(c))).toEqual([]);
    // ...and the lists don't name columns that no longer exist.
    expect([...exported, ...left].filter((c) => !columns.includes(c))).toEqual([]);
  }

  it("bingo settings", () => {
    const { bingo } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    // exclusivityRules is the column exclusivityRulesJson, parsed.
    const renamed: Record<string, string> = { exclusivityRules: "exclusivityRulesJson" };
    accounted(
      schema.bingos,
      Object.keys(doc.bingo).map((k) => renamed[k] ?? k),
      [
        "id", "slug", "stage", "createdByUserId", "createdAt", // identity of this one bingo
        "signupOpensAt", "draftScheduledAt", "revealScheduledAt", "startsAt", "endsAt", // the schedule of one event
        "womEnabled", "womGroupId", "womGroupVerificationCode", "womCompetitionId", "womSyncError", "womBulkUpdateSentAt", // Wise Old Man: ids, a secret, sync state
        "draftStarted", "draftOrderLockedUntil", "cutReviewFingerprint", // live draft ceremony — not a template setting
        "leftoverMode", // replaced by cutMode, kept only until the column is dropped
        "wrappedCreditsJson", // replaced by per-image and per-category credits (#281), kept only until the column is dropped
        "wrappedArtCreditsJson", // exported beside the Wrapped art, as the document's wrappedArtCredits
        "achievementsEnabled", // the master switch isn't carried — an import always starts with it on (achievementKeys carries the per-key switches instead)
        "historical", // a Historical Bingo is made by the historical importer, never from a template
      ],
    );
  });

  it("tiles", () => {
    const { bingo } = seedFullBingo();
    const uploads = makeUploads();
    const tile = exportBingo(db, bingo.id, { uploadsDir: uploads.dir }).tiles.find((t) => t.name === "Tile A")!;
    // categoryLocalId is categoryId; image is imageUrl (the file itself); bonusPoints is the tile's own node's points; tasks are its node's children.
    const renamed: Record<string, string> = { categoryLocalId: "categoryId", image: "imageUrl" };
    accounted(schema.tiles, Object.keys(tile).map((k) => renamed[k] ?? k), ["id", "bingoId", "nodeId", "createdAt", "rulesText"], ["bonusPoints", "tasks"]); // rulesText: only a Historical Bingo's Tiles have it
    expect(Object.keys(tile)).toEqual(expect.arrayContaining(["bonusPoints", "tasks"]));
  });

  it("nodes", () => {
    const { bingo } = seedFullBingo();
    const node = exportBingo(db, bingo.id).tiles.find((t) => t.name === "Tile A")!.tasks[0]!;
    const renamed: Record<string, string[]> = {
      pointsGateLocalId: ["pointsGateNodeId"],
      submitGateLocalId: ["submitGateNodeId"],
      valuedAs: ["valuedAsItemName", "valuedAsDivisor", "valuedAsSource"],
    };
    // removedAt: a node a Publish took off the board is on no Tile, so it's never exported.
    accounted(schema.nodes, Object.keys(node).flatMap((k) => renamed[k] ?? [k]), ["id", "bingoId", "removedAt"], ["localId", "children", "reuse"]);
  });

  it("categories and signup questions", () => {
    const { bingo } = seedFullBingo();
    const doc = exportBingo(db, bingo.id);
    accounted(schema.tileCategories, Object.keys(doc.categories[0]!), ["id", "bingoId"], ["localId"]);
    // The signup form's questions: which form is this one (form), and audience, which only a Feedback question has.
    accounted(schema.signupQuestions, Object.keys(doc.signupQuestions[0]!), ["id", "bingoId", "form", "audience"]);
    // The Feedback form's: visibility is signup-only.
    createQuestion(db, { bingoId: bingo.id, form: "feedback", prompt: "Anything else?", type: "text" });
    accounted(schema.signupQuestions, Object.keys(exportBingo(db, bingo.id).feedbackQuestions![0]!), ["id", "bingoId", "form", "visibility"]);
    accounted(schema.superlativeCategories, Object.keys(doc.superlativeCategories![0]!), ["id", "bingoId"]);
  });
});

// ---------------------------------------------------------------------------
// Tile images
// ---------------------------------------------------------------------------

let uploadsToClean: string[] = [];
afterEach(() => {
  for (const dir of uploadsToClean) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  uploadsToClean = [];
});

// An uploads folder holding a real image for Tile A (whose imageUrl the seed data points at it).
function makeUploads() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bingo-images-"));
  uploadsToClean.push(dir);
  fs.mkdirSync(path.join(dir, "tiles"), { recursive: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFuBQCAHP+Af/3rtd1AAAAAElFTkSuQmCC", "base64");
  fs.writeFileSync(path.join(dir, "tiles", "tile-a.png"), png);
  db.update(schema.tiles).set({ imageUrl: "/uploads/tiles/tile-a.png" }).where(eq(schema.tiles.name, "Tile A")).run();
  return { dir, png, tilesDir: path.join(dir, "tiles") };
}

const asImage = (bytes: Buffer, contentType = "image/png") => ({ contentType, data: bytes.toString("base64") });
const tileFiles = (tilesDir: string) => fs.readdirSync(tilesDir).filter((f) => f !== "tile-a.png").sort();

async function importWithImage(image: unknown, slug: string, uploadsDir: string) {
  const { bingo, admin } = seedFullBingo();
  const doc = JSON.parse(JSON.stringify(exportBingo(db, bingo.id))) as BingoExportDocument;
  (doc.tiles.find((t) => t.name === "Tile B") as { image?: unknown }).image = image;
  return importBingoWithImages(db, doc, { slug, createdByUserId: admin.id }, uploadsDir);
}

describe("exporting tile images", () => {
  it("embeds the original file, only when asked, and never the server path", () => {
    const { bingo } = seedFullBingo();
    const { dir, png } = makeUploads();

    const withImages = exportBingo(db, bingo.id, { uploadsDir: dir });
    const tileA = withImages.tiles.find((t) => t.name === "Tile A")!;
    expect(tileA.image).toEqual({ contentType: "image/png", data: png.toString("base64") });
    expect(withImages.tiles.filter((t) => t.image)).toHaveLength(1); // the others have no image
    expect(JSON.stringify(withImages)).not.toContain("/uploads");

    expect(exportBingo(db, bingo.id).tiles.some((t) => t.image)).toBe(false);
  });

  it("skips what it can't or shouldn't read: a missing file, an external link, anything outside the tiles folder", () => {
    const { bingo } = seedFullBingo();
    const { dir } = makeUploads();
    fs.writeFileSync(path.join(dir, "secret.png"), "not for export");
    const setUrl = (imageUrl: string) => db.update(schema.tiles).set({ imageUrl }).where(eq(schema.tiles.name, "Tile A")).run();

    for (const url of ["/uploads/tiles/missing.png", "https://example.com/a.png", "/uploads/tiles/../secret.png", "/uploads/secret.png", "/uploads/tiles/a.svg", "../../etc/passwd"]) {
      setUrl(url);
      expect(exportBingo(db, bingo.id, { uploadsDir: dir }).tiles.find((t) => t.name === "Tile A")!.image).toBeUndefined();
    }
  });
});

describe("importing tile images", () => {
  it("stores the file under a new name, with its display variants, and points the tile at it", async () => {
    const { bingo: source, admin } = seedFullBingo();
    const { dir, png, tilesDir } = makeUploads();
    const doc = exportBingo(db, source.id, { uploadsDir: dir });

    const imported = await importBingoWithImages(db, doc, { slug: "with-image", createdByUserId: admin.id }, dir);

    const tile = getBoardTiles(db, imported.id).find((t) => t.name === "Tile A")!;
    expect(tile.imageUrl).toMatch(/^\/uploads\/tiles\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/);
    expect(tile.imageUrl).not.toBe("/uploads/tiles/tile-a.png");
    const stored = path.join(dir, tile.imageUrl!.replace("/uploads/", ""));
    expect(fs.readFileSync(stored).equals(png)).toBe(true);
    const base = stored.slice(0, -".png".length);
    expect(fs.existsSync(`${base}-thumb.webp`)).toBe(true);
    expect(fs.existsSync(`${base}-full.webp`)).toBe(true);
    // The source's own tile is untouched, and tiles without an image stay without.
    expect(getBoardTiles(db, source.id).find((t) => t.name === "Tile A")!.imageUrl).toBe("/uploads/tiles/tile-a.png");
    expect(getBoardTiles(db, imported.id).find((t) => t.name === "Tile B")!.imageUrl).toBeNull();
    expect(tileFiles(tilesDir)).toHaveLength(3); // the image + its two variants
  });

  it("identifies the image by its bytes, not by what the document says it is", async () => {
    const { dir, png, tilesDir } = makeUploads();
    const jpeg = await sharp(png).jpeg().toBuffer();
    const imported = await importWithImage(asImage(jpeg, "image/png"), "lying-type", dir);
    expect(getBoardTiles(db, imported.id).find((t) => t.name === "Tile B")!.imageUrl).toMatch(/\.jpg$/);
    expect(tileFiles(tilesDir).some((f) => f.endsWith(".jpg"))).toBe(true);
  });

  it("an older file with no images still imports, with no images", async () => {
    const { bingo, admin } = seedFullBingo();
    const { dir, tilesDir } = makeUploads();
    const imported = await importBingoWithImages(db, exportBingo(db, bingo.id), { slug: "no-images", createdByUserId: admin.id }, dir);
    expect(getBoardTiles(db, imported.id).every((t) => t.imageUrl === null)).toBe(true);
    expect(tileFiles(tilesDir)).toEqual([]);
  });

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script></svg>');
  const rejected: [string, () => unknown][] = [
    ["not an object", () => "just a string"],
    ["not base64", () => ({ contentType: "image/png", data: "not base64 !!!" })],
    ["empty", () => ({ contentType: "image/png", data: "" })],
    ["not an image at all", () => asImage(Buffer.from("hello, not a picture"))],
    ["an SVG", () => asImage(svg, "image/svg+xml")],
    ["over 5 MB", () => asImage(Buffer.alloc(5 * 1024 * 1024 + 1, 0), "image/png")],
  ];
  for (const [label, make] of rejected) {
    it(`rejects an image that is ${label}, before writing anything or creating a bingo`, async () => {
      const { dir, tilesDir } = makeUploads();
      await expect(importWithImage(make(), `bad-${label.replace(/\W+/g, "-")}`, dir)).rejects.toBeInstanceOf(ServiceError);
      expect(getBingoBySlug(db, `bad-${label.replace(/\W+/g, "-")}`)).toBeUndefined();
      expect(tileFiles(tilesDir)).toEqual([]);
    });
  }

  it("rejects a truncated real image", async () => {
    const { dir, png, tilesDir } = makeUploads();
    const truncated = png.subarray(0, Math.floor(png.length / 2));
    await expect(importWithImage(asImage(truncated), "truncated", dir)).rejects.toBeInstanceOf(ServiceError);
    expect(tileFiles(tilesDir)).toEqual([]);
  });

  it("removes the files it wrote if the import then fails", async () => {
    const { bingo, admin } = seedFullBingo();
    const { dir, tilesDir } = makeUploads();
    const doc = exportBingo(db, bingo.id, { uploadsDir: dir });
    // "source" is already taken, so the import fails after the images were stored.
    await expect(importBingoWithImages(db, doc, { slug: "source", createdByUserId: admin.id }, dir)).rejects.toThrow(/already exists/);
    expect(tileFiles(tilesDir)).toEqual([]);
  });
});
