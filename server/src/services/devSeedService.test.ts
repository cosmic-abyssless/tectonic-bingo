import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createQuestion } from "./signupService";
import { seedTestSignups } from "./devSeedService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  return db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "signup", ...overrides }).returning().get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("seedTestSignups", () => {
  it("creates the requested number of active signups with distinct users", () => {
    const bingo = seedBingo();
    const created = seedTestSignups(db, bingo, 5);

    expect(created).toHaveLength(5);
    expect(created.every((s) => s.status === "active")).toBe(true);
    expect(new Set(created.map((s) => s.userId)).size).toBe(5);
  });

  it("auto-answers every signup question so required ones don't block creation", () => {
    const bingo = seedBingo();
    createQuestion(db, { bingoId: bingo.id, prompt: "Willing to captain?", type: "boolean", required: true });
    createQuestion(db, { bingoId: bingo.id, prompt: "Preferred role", type: "select", optionsJson: JSON.stringify(["dps", "support"]), required: true });

    const created = seedTestSignups(db, bingo, 3);
    expect(created).toHaveLength(3);

    const answers = db.select().from(schema.signupAnswers).where(eq(schema.signupAnswers.signupId, created[0]!.id)).all();
    expect(answers).toHaveLength(2);
    const boolAnswer = answers.find((a) => ["true", "false"].includes(a.value));
    expect(boolAnswer).toBeDefined();
    const selectAnswer = answers.find((a) => a.value === "dps" || a.value === "support");
    expect(selectAnswer).toBeDefined();
  });

  it("rejects seeding outside the signup stage, same as a real player would be", () => {
    const bingo = seedBingo({ stage: "captains" });
    expect(() => seedTestSignups(db, bingo, 3)).toThrow(/signup stage/i);
  });
});
