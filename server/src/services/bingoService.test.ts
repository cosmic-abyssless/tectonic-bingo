import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { advanceStage, assertBoardEditable } from "./bingoService";
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

  it("rejects skipping a stage", () => {
    const bingo = seedBingo({ stage: "signup" });
    expect(() => advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId })).toThrow();
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
  it.each(["planning", "signup", "captains", "draft"] as const)("allows edits during %s", (stage) => {
    expect(() => assertBoardEditable(seedBingo({ stage }))).not.toThrow();
  });

  it.each(["reveal", "live", "complete"] as const)("locks the board during %s", (stage) => {
    expect(() => assertBoardEditable(seedBingo({ stage }))).toThrow(ServiceError);
  });
});
