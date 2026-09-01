import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTeam } from "./teamService";
import { createSignup } from "./signupService";
import { getDraftState, makePick, pickOrderTeamIndex, startDraft } from "./draftService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  return db
    .insert(schema.bingos)
    .values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "draft", ...overrides })
    .returning()
    .get();
}

function seedUser(discordId: string) {
  return db.insert(schema.users).values({ discordId, discordUsername: discordId }).returning().get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("pickOrderTeamIndex", () => {
  it("snakes: round odd ascending, round even descending", () => {
    // 3 teams, 2 full rounds — picks 1..6.
    expect([1, 2, 3, 4, 5, 6].map((p) => pickOrderTeamIndex(3, p))).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it("handles a single team (every pick is theirs)", () => {
    expect([1, 2, 3].map((p) => pickOrderTeamIndex(1, p))).toEqual([0, 0, 0]);
  });

  it("handles a partial third round", () => {
    // 2 teams: round1 asc (0,1), round2 desc (1,0), round3 asc (0,1)
    expect([1, 2, 3, 4, 5].map((p) => pickOrderTeamIndex(2, p))).toEqual([0, 1, 1, 0, 0]);
  });
});

describe("startDraft", () => {
  it("rejects fewer than 2 teams", () => {
    const bingo = seedBingo();
    const captain = seedUser("captain");
    createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    expect(() => startDraft(db, bingo)).toThrow(/at least 2 teams/i);
  });

  it("rejects starting outside the draft stage", () => {
    const bingo = seedBingo({ stage: "signup" });
    const c1 = seedUser("c1");
    const c2 = seedUser("c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    expect(() => startDraft(db, bingo)).toThrow(ServiceError);
  });

  it("assigns a distinct draftOrder 1..N to every team", () => {
    const bingo = seedBingo();
    const c1 = seedUser("c1");
    const c2 = seedUser("c2");
    const c3 = seedUser("c3");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c3.id });

    const teams = startDraft(db, bingo);
    expect(teams.map((t) => t.draftOrder).sort()).toEqual([1, 2, 3]);
  });

  it("rejects starting twice", () => {
    const bingo = seedBingo();
    const c1 = seedUser("c1");
    const c2 = seedUser("c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    startDraft(db, bingo);
    expect(() => startDraft(db, bingo)).toThrow(/already started/i);
  });
});

describe("makePick", () => {
  function setup() {
    const bingo = seedBingo();
    const c1 = seedUser("c1");
    const c2 = seedUser("c2");
    const teamA = createTeam(db, { bingoId: bingo.id, captainUserId: c1.id, name: "A" });
    const teamB = createTeam(db, { bingoId: bingo.id, captainUserId: c2.id, name: "B" });
    const p1 = seedUser("p1");
    const p2 = seedUser("p2");
    for (const p of [p1, p2]) createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p.id, rsn: p.discordUsername, answers: [] });
    startDraft(db, bingo);
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
    const first = teams.find((t) => t.draftOrder === 1)!;
    const second = teams.find((t) => t.draftOrder === 2)!;
    return { bingo, first, second, teamA, teamB, p1, p2 };
  }

  it("rejects a pick before the draft has started", () => {
    const bingo = seedBingo();
    const c1 = seedUser("c1");
    const c2 = seedUser("c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const p1 = seedUser("p1");
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: c1.id, actingIsMod: false })).toThrow(/hasn't started/i);
  });

  it("rejects a pick from the captain whose team isn't on the clock", () => {
    const { bingo, second, p1 } = setup();
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: second.captainUserId, actingIsMod: false })).toThrow(/not your team's turn/i);
  });

  it("rejects a pick from someone who isn't a captain or a mod", () => {
    const { bingo, p1, p2 } = setup();
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: p2.id, actingIsMod: false })).toThrow(/not your team's turn/i);
  });

  it("allows the on-the-clock captain to pick, advancing to the next team", () => {
    const { bingo, first, second, p1, p2 } = setup();
    const pick1 = makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsMod: false });
    expect(pick1).toMatchObject({ pickNumber: 1, teamId: first.id, userId: p1.id });

    const pick2 = makePick(db, { bingo, pickedUserId: p2.id, actingUserId: second.captainUserId, actingIsMod: false });
    expect(pick2).toMatchObject({ pickNumber: 2, teamId: second.id, userId: p2.id });
  });

  it("allows a mod to pick on behalf of whichever team is on the clock", () => {
    const { bingo, first, p1 } = setup();
    const admin = seedUser("mod");
    const pick = makePick(db, { bingo, pickedUserId: p1.id, actingUserId: admin.id, actingIsMod: true });
    expect(pick).toMatchObject({ teamId: first.id, pickedByUserId: admin.id });
  });

  it("rejects picking someone not signed up for this bingo", () => {
    const { bingo, first } = setup();
    const outsider = seedUser("outsider");
    expect(() => makePick(db, { bingo, pickedUserId: outsider.id, actingUserId: first.captainUserId, actingIsMod: false })).toThrow(/isn't signed up/i);
  });

  it("rejects drafting the same player twice", () => {
    const { bingo, first, second, p1 } = setup();
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsMod: false });
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: second.captainUserId, actingIsMod: false })).toThrow(/already been drafted/i);
  });
});

describe("getDraftState", () => {
  it("excludes drafted players from the pool and reports the current pick", () => {
    const bingo = seedBingo();
    const c1 = seedUser("c1");
    const c2 = seedUser("c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const p1 = seedUser("p1");
    const p2 = seedUser("p2");
    for (const p of [p1, p2]) createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p.id, rsn: p.discordUsername, answers: [] });

    const before = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(before.draftStarted).toBe(false);
    expect(before.currentPick).toBeNull();
    expect(before.pool).toHaveLength(2);

    startDraft(db, bingo);
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
    const first = teams.find((t) => t.draftOrder === 1)!;
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsMod: false });

    const after = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(after.draftStarted).toBe(true);
    expect(after.pool.map((e) => e.user.id)).toEqual([p2.id]);
    expect(after.currentPick?.pickNumber).toBe(2);
    expect(after.picks).toHaveLength(1);
    expect(after.pool[0]!.answers).toBeNull();
  });

  it("includes signup answers only when requested", () => {
    const bingo = seedBingo();
    const c1 = seedUser("c1");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    const p1 = seedUser("p1");
    const [question] = db.insert(schema.signupQuestions).values({ bingoId: bingo.id, prompt: "RSN?", type: "text" }).returning().all();
    createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p1.id, rsn: "p1", answers: [{ questionId: question!.id, value: "hi" }] });

    const withAnswers = getDraftState(db, bingo.id, { includeAnswers: true });
    expect(withAnswers.pool[0]!.answers).toHaveLength(1);

    const withoutAnswers = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(withoutAnswers.pool[0]!.answers).toBeNull();
  });
});
