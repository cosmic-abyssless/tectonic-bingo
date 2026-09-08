import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLines, nodeEdges, nodeItems, nodes, tileWildcards, tiles } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask, createWildcard, deleteTile, generateLines, getTeamNodeStatuses } from "./boardService";
import { createSubmission } from "./submissionService";
import { approveSubmission } from "./scoringService";
import { getNodeTree } from "./graphService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  return db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, ...overrides }).returning().get();
}

function pointsOf(nodeId: string): number {
  return db.select({ points: nodes.points }).from(nodes).where(eq(nodes.id, nodeId)).get()!.points;
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

  it("gives the tile its own empty ALL root node", () => {
    const bingo = seedBingo();
    const tile = createTile(db, { bingoId: bingo.id, name: "A", boardRow: 0, boardCol: 0 });
    const node = getNodeTree(db, tile.nodeId)!;
    expect(node.kind).toBe("ALL");
    expect(node.children).toHaveLength(0);
  });
});

describe("deleteTile", () => {
  it("cascades to tasks, leaves, and wildcards, and detaches from lines without deleting them", () => {
    const bingo = seedBingo();
    const tile = createTile(db, { bingoId: bingo.id, name: "A", boardRow: 0, boardCol: 0 });
    const task = createTask(db, tile.id, { kind: "ALL", label: "Part A", points: 10, description: "d", children: [{ kind: "ITEM", itemNames: ["Item"] }] });
    const leafId = task.children[0]!.id;
    createWildcard(db, { tileId: tile.id, itemName: "Jar", applicableNodeId: leafId });
    const lines = generateLines(db, bingo, 15); // wires this tile into the 3x3 board's lines
    const line = lines.find((l) => l.lineType === "row" && l.lineIndex === 0)!;

    deleteTile(db, tile.id);

    expect(db.select().from(tiles).all()).toHaveLength(0);
    expect(db.select().from(nodes).where(eq(nodes.id, tile.nodeId)).all()).toHaveLength(0);
    expect(db.select().from(nodes).where(eq(nodes.id, task.id)).all()).toHaveLength(0);
    expect(db.select().from(nodes).where(eq(nodes.id, leafId)).all()).toHaveLength(0);
    expect(db.select().from(nodeItems).all()).toHaveLength(0);
    expect(db.select().from(tileWildcards).all()).toHaveLength(0);
    expect(db.select().from(nodeEdges).where(eq(nodeEdges.childId, tile.nodeId)).all()).toHaveLength(0);
    // The line itself survives (it may still reference other tiles) — only the edge to this tile is removed.
    expect(db.select().from(bingoLines).where(eq(bingoLines.id, line.id)).all()).toHaveLength(1);
  });
});

describe("getTeamNodeStatuses", () => {
  it("derives not_started/pending_approval/in_progress/completed without any stored status", () => {
    const bingo = seedBingo({ stage: "live", startsAt: new Date("2026-01-01") });
    const [member] = db.insert(schema.users).values({ discordId: "m", discordUsername: "m" }).returning().all();
    const [team] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: member.id, name: "T", codeword: "cw" }).returning().all();
    const tile = createTile(db, { bingoId: bingo.id, name: "A", boardRow: 0, boardCol: 0 });
    const untouched = createTask(db, tile.id, { kind: "ITEM", label: "Untouched", points: 10, description: "d", itemNames: ["X"] });
    const inProgress = createTask(db, tile.id, { kind: "ITEM", label: "InProgress", points: 10, description: "d", itemNames: ["Y"], quantity: 5 });
    const pending = createTask(db, tile.id, { kind: "ITEM", label: "Pending", points: 10, description: "d", itemNames: ["Z"] });
    const completed = createTask(db, tile.id, { kind: "ITEM", label: "Completed", points: 10, description: "d", itemNames: ["W"] });

    const approvedSub = createSubmission(db, bingo, { teamId: team.id, submittedByUserId: member.id, screenshotUrl: "/x.png", now: new Date("2026-01-02"), claims: [{ nodeId: inProgress.id, itemName: "Y", quantity: 1 }] });
    approveSubmission(db, { submissionId: approvedSub.id, reviewedByUserId: member.id });
    createSubmission(db, bingo, { teamId: team.id, submittedByUserId: member.id, screenshotUrl: "/x.png", now: new Date("2026-01-02"), claims: [{ nodeId: pending.id, itemName: "Z" }] });
    const completedSub = createSubmission(db, bingo, { teamId: team.id, submittedByUserId: member.id, screenshotUrl: "/x.png", now: new Date("2026-01-02"), claims: [{ nodeId: completed.id, itemName: "W" }] });
    approveSubmission(db, { submissionId: completedSub.id, reviewedByUserId: member.id });

    const statuses = getTeamNodeStatuses(db, team.id, bingo.id);
    expect(statuses.get(untouched.id)).toBe("not_started");
    expect(statuses.get(inProgress.id)).toBe("in_progress"); // 1 of 5 needed, approved but not complete
    expect(statuses.get(pending.id)).toBe("pending_approval");
    expect(statuses.get(completed.id)).toBe("completed");
    expect(statuses.get(tile.nodeId)).toBe("pending_approval"); // the tile's own ALL node: not complete, and one descendant (Pending) still has a pending claim
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
    expect(lines.every((l) => pointsOf(l.nodeId) === 15)).toBe(true);

    const diagTlBr = lines.find((l) => l.lineType === "diagonal" && l.lineIndex === 0)!;
    const memberNodeIds = db.select({ childId: nodeEdges.childId }).from(nodeEdges).where(eq(nodeEdges.parentId, diagTlBr.nodeId)).all().map((r) => r.childId);
    const expectedNodeIds = [tileByPos.get("0,0")!.nodeId, tileByPos.get("1,1")!.nodeId, tileByPos.get("2,2")!.nodeId];
    expect(memberNodeIds.sort()).toEqual(expectedNodeIds.sort());
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
    const lines = generateLines(db, bingo, 20);

    const allLines = db.select().from(bingoLines).all();
    expect(allLines).toHaveLength(2 + 2 + 2);
    expect(lines.every((l) => pointsOf(l.nodeId) === 20)).toBe(true);
  });
});
