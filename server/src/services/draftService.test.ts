import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq, ne } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTeam } from "./teamService";
import { createSignup } from "./signupService";
import { adminPair } from "./pairingService";
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

// createTeam now requires the captain to have an active signup — seed one directly.
function seedCaptain(bingoId: string, discordId: string) {
  const user = seedUser(discordId);
  db.insert(schema.signups).values({ bingoId, userId: user.id, rsn: discordId }).run();
  return user;
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
    const captain = seedCaptain(bingo.id, "captain");
    createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    expect(() => startDraft(db, bingo)).toThrow(/at least 2 teams/i);
  });

  it("rejects starting outside the draft stage", () => {
    const bingo = seedBingo({ stage: "signup" });
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    expect(() => startDraft(db, bingo)).toThrow(ServiceError);
  });

  it("assigns a distinct draftOrder 1..N to every team", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    const c3 = seedCaptain(bingo.id, "c3");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c3.id });

    const teams = startDraft(db, bingo);
    expect(teams.map((t) => t.draftOrder).sort()).toEqual([1, 2, 3]);
  });

  it("rejects starting twice", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    startDraft(db, bingo);
    expect(() => startDraft(db, bingo)).toThrow(/already started/i);
  });
});

describe("audit trail", () => {
  it("startDraft records draft.started with the team order", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id, name: "A" });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id, name: "B" });

    startDraft(db, bingo);

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "draft.started")).get()!;
    expect(row.visibility).toBe("public");
    const details = JSON.parse(row.details);
    expect(details.order).toHaveLength(2);
    expect(details.order.map((o: { name: string }) => o.name).sort()).toEqual(["A", "B"]);
  });

  it("makePick records draft.pick scoped to the drafting team, with onBehalfOfUserId set for an admin override", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id, name: "A" });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id, name: "B" });
    const p1 = seedUser("p1");
    createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p1.id, rsn: "p1", answers: [] });
    startDraft(db, bingo);
    const first = db.select().from(schema.teams).where(and(eq(schema.teams.bingoId, bingo.id), eq(schema.teams.draftOrder, 1))).get()!;

    const [admin] = db.insert(schema.users).values({ discordId: "siteadmin", discordUsername: "siteadmin" }).returning().all();
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: admin.id, actingIsAdmin: true });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "draft.pick")).get()!;
    expect(row.teamId).toBe(first.id);
    expect(row.onBehalfOfUserId).toBe(first.captainUserId);
    expect(JSON.parse(row.details)).toMatchObject({ userIds: [p1.id], displayNames: ["p1"], pair: false });
  });
});

describe("makePick", () => {
  function setup() {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
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
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const p1 = seedUser("p1");
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: c1.id, actingIsAdmin: false })).toThrow(/hasn't started/i);
  });

  it("rejects a pick from the captain whose team isn't on the clock", () => {
    const { bingo, second, p1 } = setup();
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: second.captainUserId, actingIsAdmin: false })).toThrow(/not your team's turn/i);
  });

  it("rejects a pick from someone who isn't the captain or a site admin", () => {
    const { bingo, p1, p2 } = setup();
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: p2.id, actingIsAdmin: false })).toThrow(/not your team's turn/i);
  });

  it("allows the on-the-clock captain to pick, advancing to the next team", () => {
    const { bingo, first, second, p1, p2 } = setup();
    const pick1 = makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });
    expect(pick1).toMatchObject([{ pickNumber: 1, teamId: first.id, userId: p1.id }]);

    const pick2 = makePick(db, { bingo, pickedUserId: p2.id, actingUserId: second.captainUserId, actingIsAdmin: false });
    expect(pick2).toMatchObject([{ pickNumber: 2, teamId: second.id, userId: p2.id }]);
  });

  it("allows a site admin to pick on behalf of whichever team is on the clock", () => {
    const { bingo, first, p1 } = setup();
    const admin = seedUser("admin-actor");
    const pick = makePick(db, { bingo, pickedUserId: p1.id, actingUserId: admin.id, actingIsAdmin: true });
    expect(pick).toMatchObject([{ teamId: first.id, pickedByUserId: admin.id }]);
  });

  it("rejects picking someone not signed up for this bingo", () => {
    const { bingo, first } = setup();
    const outsider = seedUser("outsider");
    expect(() => makePick(db, { bingo, pickedUserId: outsider.id, actingUserId: first.captainUserId, actingIsAdmin: false })).toThrow(/isn't signed up/i);
  });

  it("rejects drafting the same player twice", () => {
    const { bingo, first, second, p1 } = setup();
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: second.captainUserId, actingIsAdmin: false })).toThrow(/already been drafted/i);
  });
});

describe("getDraftState", () => {
  it("excludes drafted players from the pool and reports the current pick", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
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
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });

    const after = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(after.draftStarted).toBe(true);
    expect(after.pool.map((u) => u.entries[0]!.user.id)).toEqual([p2.id]);
    expect(after.currentPick?.pickNumber).toBe(2);
    expect(after.picks).toHaveLength(1);
    expect(after.pool[0]!.entries[0]!.answers).toBeNull();
  });

  it("includes each team's captain RSN and each pick's RSN", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const p1 = seedUser("p1");
    createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p1.id, rsn: "PlayerOneRsn", answers: [] });

    startDraft(db, bingo);
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
    const first = teams.find((t) => t.draftOrder === 1)!;
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });

    const state = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(state.teams.every((t) => t.captainRsn === "c1" || t.captainRsn === "c2")).toBe(true);
    expect(state.picks[0]).toMatchObject({ userId: p1.id, rsn: "PlayerOneRsn" });
  });

  it("includes signup answers only when requested", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    const p1 = seedUser("p1");
    const [question] = db.insert(schema.signupQuestions).values({ bingoId: bingo.id, prompt: "RSN?", type: "text" }).returning().all();
    createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p1.id, rsn: "p1", answers: [{ questionId: question!.id, value: "hi" }] });

    const withAnswers = getDraftState(db, bingo.id, { includeAnswers: true });
    expect(withAnswers.pool[0]!.entries[0]!.answers).toHaveLength(1);

    const withoutAnswers = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(withoutAnswers.pool[0]!.entries[0]!.answers).toBeNull();
  });
});

describe("duo mode", () => {
  function setupDuo() {
    const bingo = seedBingo({ signupMode: "duo" });
    const signupStage = { ...bingo, stage: "signup" as const };
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    const co1 = seedUser("co1");
    createSignup(db, signupStage, { bingoId: bingo.id, userId: co1.id, rsn: "co1", answers: [] });
    adminPair(db, signupStage, { userIdA: c1.id, userIdB: co1.id, createdByUserId: c1.id });
    const teamA = createTeam(db, { bingoId: bingo.id, captainUserId: c1.id, coCaptainUserId: co1.id, name: "A" });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id, name: "B" });

    const [p1, p2, solo] = ["p1", "p2", "solo"].map((d) => seedUser(d));
    for (const p of [p1!, p2!, solo!]) createSignup(db, signupStage, { bingoId: bingo.id, userId: p.id, rsn: p.discordUsername, answers: [] });
    const pairing = adminPair(db, signupStage, { userIdA: p1!.id, userIdB: p2!.id, createdByUserId: c1.id });
    startDraft(db, bingo);
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
    const first = teams.find((t) => t.draftOrder === 1)!;
    const second = teams.find((t) => t.draftOrder === 2)!;
    return { bingo, teamA, co1, first, second, p1: p1!, p2: p2!, solo: solo!, pairing };
  }

  it("groups an accepted pair into one draft unit", () => {
    const { bingo, p1, p2, solo, pairing } = setupDuo();
    const state = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(state.pool).toHaveLength(2);
    const pair = state.pool.find((u) => u.pairingId === pairing.id)!;
    expect(pair.entries.map((e) => e.user.id).sort()).toEqual([p1.id, p2.id].sort());
    expect(state.pool.find((u) => u.pairingId === null)!.entries[0]!.user.id).toBe(solo.id);
  });

  it("reports the co-captain on the team", () => {
    const { bingo, teamA, co1 } = setupDuo();
    const state = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(state.teams.find((t) => t.id === teamA.id)!.coCaptain).toEqual({ userId: co1.id, rsn: "co1" });
  });

  it("drafts both halves of a pair under one pick number and advances once", () => {
    const { bingo, first, second, p1, p2 } = setupDuo();
    const picks = makePick(db, { bingo, pickedUserId: p2.id, actingUserId: first.captainUserId, actingIsAdmin: true });
    expect(picks.map((p) => p.userId).sort()).toEqual([p1.id, p2.id].sort());
    expect(picks.every((p) => p.pickNumber === 1 && p.teamId === first.id)).toBe(true);

    const state = getDraftState(db, bingo.id, { includeAnswers: false });
    expect(state.currentPick).toMatchObject({ pickNumber: 2, teamId: second.id });
    expect(state.pool).toHaveLength(1);
  });

  it("lets the co-captain pick for the team", () => {
    const { bingo, teamA, co1, solo } = setupDuo();
    // Make sure team A is on the clock regardless of the shuffle.
    db.update(schema.teams).set({ draftOrder: 1 }).where(eq(schema.teams.id, teamA.id)).run();
    db.update(schema.teams).set({ draftOrder: 2 }).where(and(eq(schema.teams.bingoId, bingo.id), ne(schema.teams.id, teamA.id))).run();
    const picks = makePick(db, { bingo, pickedUserId: solo.id, actingUserId: co1.id, actingIsAdmin: false });
    expect(picks).toHaveLength(1);
    expect(picks[0]!.teamId).toBe(teamA.id);
  });
});
