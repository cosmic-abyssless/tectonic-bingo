import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { advanceStage } from "./bingoService";
import { effectiveStartsAt } from "./bingoStart";
import { startDueBingos } from "./bingoStartService";
import { afterStageChange } from "./stageChangeEffects";

// The follow-ups (broadcast, Wise Old Man, Discord) are stageChangeEffects' own business: here, only that they're asked for.
vi.mock("./stageChangeEffects", () => ({ afterStageChange: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const START = new Date("2026-03-01T18:00:00Z");
const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const admin = db.insert(schema.users).values({ discordId: `admin-${Math.random()}`, discordUsername: "admin" }).returning().get();
  return db
    .insert(schema.bingos)
    .values({ slug: `test-${Math.random()}`, name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "reveal", startsAt: START, ...overrides })
    .returning()
    .get();
}
const stageOf = (id: string) => db.select().from(bingos).where(eq(bingos.id, id)).get()!.stage;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  vi.mocked(afterStageChange).mockClear();
});
afterEach(() => {
  sqlite.close();
});

describe("startDueBingos", () => {
  it("leaves a Bingo at Board revealed until its start date, then makes it Live, as the system", () => {
    const bingo = seedBingo();
    expect(startDueBingos(db, at(-1))).toEqual([]);
    expect(stageOf(bingo.id)).toBe("reveal");

    const started = startDueBingos(db, at(0));
    expect(started.map((b) => b.id)).toEqual([bingo.id]);
    expect(stageOf(bingo.id)).toBe("live");
    // The start date stays the admin's, and the transition is the system's.
    expect(effectiveStartsAt(db, started[0]!)).toEqual(START);
    // stage_transitions needs a user, so it names the Bingo's creator: the audit log says it was the system.
    expect(db.select().from(schema.stageTransitions).get()!.changedByUserId).toBe(bingo.createdByUserId);
    const entry = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "stage.changed")).get()!;
    expect(entry.actorType).toBe("system");
    expect(JSON.parse(entry.details)).toEqual({ from: "reveal", to: "live", automatic: true });
    expect(afterStageChange).toHaveBeenCalledWith(db, expect.objectContaining({ id: bingo.id }), "reveal", "live", null);
  });

  it("starts a Bingo whose start passed while the server was down, as it comes back", () => {
    const bingo = seedBingo();
    startDueBingos(db, at(90));
    expect(stageOf(bingo.id)).toBe("live");
  });

  it("starts each Bingo once, however many rounds (or servers) see it due", () => {
    seedBingo();
    expect(startDueBingos(db, at(0))).toHaveLength(1);
    expect(startDueBingos(db, at(0))).toHaveLength(0);
    expect(db.select().from(schema.stageTransitions).all()).toHaveLength(1);
  });

  it("leaves a Bingo an Admin moved back to Board revealed after it started, until its start date moves on", () => {
    const bingo = seedBingo();
    startDueBingos(db, at(0));
    advanceStage(db, { bingoId: bingo.id, toStage: "reveal", changedByUserId: bingo.createdByUserId, now: at(10) });
    startDueBingos(db, at(11));
    expect(stageOf(bingo.id)).toBe("reveal");

    // A new start date ahead of the last time it went Live: it goes Live again at that one.
    db.update(bingos).set({ startsAt: at(60) }).where(eq(bingos.id, bingo.id)).run();
    startDueBingos(db, at(30));
    expect(stageOf(bingo.id)).toBe("reveal");
    startDueBingos(db, at(60));
    expect(stageOf(bingo.id)).toBe("live");
  });

  it("only starts Bingos at Board revealed with a start date", () => {
    const noDate = seedBingo({ startsAt: null });
    const draft = seedBingo({ stage: "draft" });
    const finished = seedBingo({ stage: "complete" });
    expect(startDueBingos(db, at(5))).toEqual([]);
    expect([stageOf(noDate.id), stageOf(draft.id), stageOf(finished.id)]).toEqual(["reveal", "draft", "complete"]);
  });
});
