import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { advanceStage, assertBoardEditable, deleteBingo } from "./bingoService";
import { createTask, createTile } from "./boardService";
import { createTeam } from "./teamService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  return db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "reveal", ...overrides }).returning().get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("advanceStage", () => {
  it("backfills startsAt when going live with none set", () => {
    const bingo = seedBingo({ startsAt: null });
    const now = new Date("2026-03-01T00:00:00Z");

    const updated = advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId, now });

    expect(updated.startsAt).toEqual(now);
  });

  it("backfills startsAt when going live with one still in the future", () => {
    const bingo = seedBingo({ startsAt: new Date("2099-01-01T00:00:00Z") });
    const now = new Date("2026-03-01T00:00:00Z");

    const updated = advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId, now });

    expect(updated.startsAt).toEqual(now);
  });

  it("leaves an already-past startsAt untouched when going live", () => {
    const scheduled = new Date("2026-02-27T18:00:00Z");
    const bingo = seedBingo({ startsAt: scheduled });
    const now = new Date("2026-03-01T00:00:00Z");

    const updated = advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId, now });

    expect(updated.startsAt).toEqual(scheduled);
  });

  it("does not touch startsAt for transitions other than going live", () => {
    const bingo = seedBingo({ stage: "draft", startsAt: null });

    const updated = advanceStage(db, { bingoId: bingo.id, toStage: "reveal", changedByUserId: bingo.createdByUserId });

    expect(updated.startsAt).toBeNull();
  });

  it("allows skipping stages and records the jump as one transition", () => {
    const bingo = seedBingo({ stage: "signup" });
    const updated = advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId });
    expect(updated.stage).toBe("live");
    const rows = db.select().from(schema.stageTransitions).where(eq(schema.stageTransitions.bingoId, bingo.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromStage: "signup", toStage: "live" });
  });

  it("allows jumping back several stages", () => {
    const bingo = seedBingo({ stage: "live" });
    expect(advanceStage(db, { bingoId: bingo.id, toStage: "signup", changedByUserId: bingo.createdByUserId }).stage).toBe("signup");
  });

  it("rejects moving to the current stage", () => {
    const bingo = seedBingo({ stage: "signup" });
    expect(() => advanceStage(db, { bingoId: bingo.id, toStage: "signup", changedByUserId: bingo.createdByUserId })).toThrow();
  });

  it("records the transition in stageTransitions", () => {
    const bingo = seedBingo();
    advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId });
    const rows = db.select().from(schema.stageTransitions).where(eq(schema.stageTransitions.bingoId, bingo.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromStage: "reveal", toStage: "live" });
  });

  it("keeps stage and startsAt in sync via the bingos row too", () => {
    const bingo = seedBingo({ startsAt: null });
    advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId });
    const row = db.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!;
    expect(row.stage).toBe("live");
    expect(row.startsAt).not.toBeNull();
  });
});

describe("assertBoardEditable", () => {
  it.each(["planning", "signup", "captains", "draft", "reveal"] as const)("allows edits during %s", (stage) => {
    expect(() => assertBoardEditable(seedBingo({ stage }))).not.toThrow();
  });

  it.each(["live", "complete"] as const)("locks the board during %s", (stage) => {
    expect(() => assertBoardEditable(seedBingo({ stage }))).toThrow(ServiceError);
  });
});

describe("deleteBingo", () => {
  it("removes the bingo and every row that hangs off it, leaving other bingos alone", () => {
    const bingo = seedBingo({ stage: "live" });
    const other = db.insert(schema.bingos).values({ slug: "other", name: "Other", boardRows: 3, boardCols: 3, createdByUserId: bingo.createdByUserId }).returning().get();
    const [player] = db.insert(schema.users).values({ discordId: "player", discordUsername: "player" }).returning().all();

    const question = db.insert(schema.signupQuestions).values({ bingoId: bingo.id, prompt: "Q", type: "text" }).returning().get();
    const signup = db.insert(schema.signups).values({ bingoId: bingo.id, userId: player.id, rsn: "player" }).returning().get();
    db.insert(schema.signupAnswers).values({ signupId: signup.id, questionId: question.id, value: "A" }).run();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: player.id });
    db.insert(schema.draftPicks).values({ bingoId: bingo.id, teamId: team.id, userId: player.id, pickNumber: 1, pickedByUserId: player.id }).run();
    db.insert(schema.teamPointAdjustments).values({ bingoId: bingo.id, teamId: team.id, amount: 5, reason: "r", createdByUserId: bingo.createdByUserId }).run();
    db.insert(schema.stageTransitions).values({ bingoId: bingo.id, fromStage: "planning", toStage: "live", changedByUserId: bingo.createdByUserId }).run();
    db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: player.id }).run();

    const category = db.insert(schema.tileCategories).values({ bingoId: bingo.id, label: "C" }).returning().get();
    const tile = createTile(db, { bingoId: bingo.id, name: "T", boardRow: 0, boardCol: 0, categoryId: category.id });
    const task = createTask(db, tile.id, { kind: "ITEM", label: "Leaf", itemName: "Leaf" });
    db.insert(schema.bingoLines).values({ bingoId: bingo.id, nodeId: tile.nodeId, lineType: "row", lineIndex: 0 }).run();
    db.insert(schema.teamNodeState).values({ teamId: team.id, nodeId: task.id, completedAt: new Date() }).run();
    const submission = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: player.id }).returning().get();
    db.insert(schema.submissionScreenshots).values({ submissionId: submission.id, storageUrl: "/x.png" }).run();
    db.insert(schema.claims).values({ submissionId: submission.id, nodeId: task.id }).run();

    deleteBingo(db, bingo.id);

    const tables = [
      schema.bingoModerators, schema.stageTransitions, schema.signupQuestions, schema.signups, schema.signupAnswers, schema.teams, schema.teamMembers,
      schema.draftPicks, schema.nodes, schema.nodeEdges, schema.tileCategories, schema.tiles, schema.bingoLines, schema.teamNodeState, schema.submissions,
      schema.submissionScreenshots, schema.claims, schema.teamPointAdjustments,
    ];
    for (const table of tables) expect(db.select().from(table).all()).toEqual([]);
    expect(db.select().from(bingos).all().map((b) => b.id)).toEqual([other.id]);
  });

  it("404s for an unknown bingo", () => {
    expect(() => deleteBingo(db, "nope")).toThrow(ServiceError);
  });
});
