import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq, ne } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTeam } from "./teamService";
import { createSignup } from "./signupService";
import { adminPair } from "./pairingService";
import { canViewDraftRoom, draftRoomForbiddenMessage, getDraftState, getLeftoverUserIds, getTeamRatings, makePick, pickOrderTeamIndex, setDraftOrder, setPickRating, shuffleDraftOrder, startDraft } from "./draftService";
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

function beginDraft(bingo: typeof schema.bingos.$inferSelect, teamIds?: string[]) {
  const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
  setDraftOrder(db, bingo, teamIds ?? teams.map((t) => t.id));
  return startDraft(db, bingo);
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("canViewDraftRoom", () => {
  const signedUpPlayer = { isMod: false, isLead: false, isOnTeam: false, isSignedUp: true };
  const lead = { isMod: false, isLead: true, isOnTeam: true, isSignedUp: true };
  const mod = { isMod: true, isLead: false, isOnTeam: false, isSignedUp: false };
  const outsider = { isMod: false, isLead: false, isOnTeam: false, isSignedUp: false };

  it("blocks signed-up non-leads during signup and captains", () => {
    expect(canViewDraftRoom("signup", signedUpPlayer)).toBe(false);
    expect(canViewDraftRoom("captains", signedUpPlayer)).toBe(false);
    expect(canViewDraftRoom("signup", lead)).toBe(true);
    expect(canViewDraftRoom("captains", mod)).toBe(true);
  });

  it("lets signed-up non-leads watch during draft", () => {
    expect(canViewDraftRoom("draft", signedUpPlayer)).toBe(true);
    expect(canViewDraftRoom("draft", outsider)).toBe(false);
    expect(canViewDraftRoom("draft", lead)).toBe(true);
    expect(canViewDraftRoom("draft", mod)).toBe(true);
  });

  it("uses scouting copy before draft and draft-room copy after", () => {
    expect(draftRoomForbiddenMessage("captains")).toMatch(/scouting/i);
    expect(draftRoomForbiddenMessage("draft")).toMatch(/draft room/i);
  });
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
    expect(() => startDraft(db, bingo)).toThrow(/set pick order/i);
  });

  it("rejects starting outside the draft stage", () => {
    const bingo = seedBingo({ stage: "signup" });
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    expect(() => startDraft(db, bingo)).toThrow(ServiceError);
  });

  it("rejects starting before pick order is set", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    expect(() => startDraft(db, bingo)).toThrow(/set pick order/i);
  });

  it("sets draftStarted without shuffling", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    const a = createTeam(db, { bingoId: bingo.id, captainUserId: c1.id, name: "A" });
    const b = createTeam(db, { bingoId: bingo.id, captainUserId: c2.id, name: "B" });
    setDraftOrder(db, bingo, [b.id, a.id]);
    startDraft(db, bingo);
    expect(db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!.draftStarted).toBe(true);
    expect(db.select().from(schema.teams).where(eq(schema.teams.id, b.id)).get()!.draftOrder).toBe(1);
    expect(db.select().from(schema.teams).where(eq(schema.teams.id, a.id)).get()!.draftOrder).toBe(2);
  });

  it("rejects starting twice", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    beginDraft(bingo);
    expect(() => startDraft(db, bingo)).toThrow(/already started/i);
  });
});

describe("shuffleDraftOrder", () => {
  it("assigns a distinct draftOrder 1..N and locks picks", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    const c3 = seedCaptain(bingo.id, "c3");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c3.id });

    const { teams, lockedUntil } = shuffleDraftOrder(db, bingo);
    expect(teams.map((t) => t.draftOrder).sort()).toEqual([1, 2, 3]);
    expect(lockedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(getDraftState(db, bingo, { includeAnswers: false }).orderReady).toBe(true);
  });

  it("rejects fewer than 2 teams", () => {
    const bingo = seedBingo();
    const captain = seedCaptain(bingo.id, "captain");
    createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    expect(() => shuffleDraftOrder(db, bingo)).toThrow(/at least 2 teams/i);
  });
});

describe("setDraftOrder", () => {
  it("writes a dense 1..N order and clears the reveal lock", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    const a = createTeam(db, { bingoId: bingo.id, captainUserId: c1.id, name: "A" });
    const b = createTeam(db, { bingoId: bingo.id, captainUserId: c2.id, name: "B" });
    shuffleDraftOrder(db, bingo);
    const teams = setDraftOrder(db, bingo, [b.id, a.id]);
    expect(teams.find((t) => t.id === b.id)!.draftOrder).toBe(1);
    expect(teams.find((t) => t.id === a.id)!.draftOrder).toBe(2);
    expect(db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!.draftOrderLockedUntil).toBeNull();
  });

  it("rejects a list that is not a permutation of current teams", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    const a = createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    expect(() => setDraftOrder(db, bingo, [a.id])).toThrow(/exactly once/i);
    expect(() => setDraftOrder(db, bingo, [a.id, a.id])).toThrow(/exactly once/i);
  });
});

describe("audit trail", () => {
  it("startDraft records draft.started with the team order", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id, name: "A" });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id, name: "B" });

    beginDraft(bingo);

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
    const p2 = seedUser("p2");
    // Two signups for two teams so neither is a leftover (see markLeftovers).
    for (const p of [p1, p2]) createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p.id, rsn: p.discordUsername, answers: [] });
    beginDraft(bingo);
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
    beginDraft(bingo);
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

  it("rejects a pick while the shuffle reveal lock is active", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const p1 = seedUser("p1");
    createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p1.id, rsn: "p1", answers: [] });
    shuffleDraftOrder(db, bingo);
    startDraft(db, bingo);
    const first = db.select().from(schema.teams).where(and(eq(schema.teams.bingoId, bingo.id), eq(schema.teams.draftOrder, 1))).get()!;
    expect(() => makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false })).toThrow(/still being revealed/i);
  });

  it("fixes the pick order as soon as the draft is started, before any pick", () => {
    const { bingo, first, second } = setup(); // setup sets the order and presses Start draft
    expect(() => shuffleDraftOrder(db, bingo)).toThrow(/draft has started/i);
    expect(() => setDraftOrder(db, bingo, [second.id, first.id])).toThrow(/draft has started/i);
    expect(() => startDraft(db, bingo)).toThrow(/already started/i);
  });

  it("keeps it fixed after picks are made too, and leaves the order as it was", () => {
    const { bingo, first, second, p1 } = setup();
    const orderBefore = db.select({ id: schema.teams.id, order: schema.teams.draftOrder }).from(schema.teams).all().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((t) => t.id);
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });
    expect(() => shuffleDraftOrder(db, bingo)).toThrow(/draft has started/i);
    expect(() => setDraftOrder(db, bingo, [second.id, first.id])).toThrow(/draft has started/i);
    const orderAfter = db.select({ id: schema.teams.id, order: schema.teams.draftOrder }).from(schema.teams).all().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((t) => t.id);
    expect(orderAfter).toEqual(orderBefore);
    expect(() => startDraft(db, bingo)).toThrow(/already started/i);
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

    const before = getDraftState(db, bingo, { includeAnswers: false });
    expect(before.draftStarted).toBe(false);
    expect(before.currentPick).toBeNull();
    expect(before.pool).toHaveLength(2);

    beginDraft(bingo);
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
    const first = teams.find((t) => t.draftOrder === 1)!;
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });

    const after = getDraftState(db, bingo, { includeAnswers: false });
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
    const p2 = seedUser("p2");
    createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p2.id, rsn: "p2", answers: [] });

    beginDraft(bingo);
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
    const first = teams.find((t) => t.draftOrder === 1)!;
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });

    const state = getDraftState(db, bingo, { includeAnswers: false });
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

    const withAnswers = getDraftState(db, bingo, { includeAnswers: true });
    expect(withAnswers.pool[0]!.entries[0]!.answers).toHaveLength(1);

    const withoutAnswers = getDraftState(db, bingo, { includeAnswers: false });
    expect(withoutAnswers.pool[0]!.entries[0]!.answers).toBeNull();
  });

  it("hides currentPick until the shuffle reveal lock expires", () => {
    const bingo = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const p1 = seedUser("p1");
    createSignup(db, { ...bingo, stage: "signup" }, { bingoId: bingo.id, userId: p1.id, rsn: "p1", answers: [] });
    shuffleDraftOrder(db, bingo);
    startDraft(db, bingo);
    const locked = getDraftState(db, bingo, { includeAnswers: false });
    expect(locked.orderReady).toBe(true);
    expect(locked.draftStarted).toBe(true);
    expect(locked.orderLockedUntil).not.toBeNull();
    expect(locked.currentPick).toBeNull();
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
    beginDraft(bingo);
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
    const first = teams.find((t) => t.draftOrder === 1)!;
    const second = teams.find((t) => t.draftOrder === 2)!;
    return { bingo, teamA, co1, first, second, p1: p1!, p2: p2!, solo: solo!, pairing };
  }

  it("groups an accepted pair into one draft unit", () => {
    const { bingo, p1, p2, solo, pairing } = setupDuo();
    const state = getDraftState(db, bingo, { includeAnswers: false });
    expect(state.pool).toHaveLength(2);
    const pair = state.pool.find((u) => u.pairingId === pairing.id)!;
    expect(pair.entries.map((e) => e.user.id).sort()).toEqual([p1.id, p2.id].sort());
    expect(state.pool.find((u) => u.pairingId === null)!.entries[0]!.user.id).toBe(solo.id);
  });

  it("reports the co-captain on the team", () => {
    const { bingo, teamA, co1 } = setupDuo();
    const state = getDraftState(db, bingo, { includeAnswers: false });
    expect(state.teams.find((t) => t.id === teamA.id)!.coCaptain).toEqual({ userId: co1.id, rsn: "co1" });
  });

  it("drafts both halves of a pair under one pick number and advances once", () => {
    const { bingo, first, second, p1, p2 } = setupDuo();
    const picks = makePick(db, { bingo, pickedUserId: p2.id, actingUserId: first.captainUserId, actingIsAdmin: true });
    expect(picks.map((p) => p.userId).sort()).toEqual([p1.id, p2.id].sort());
    expect(picks.every((p) => p.pickNumber === 1 && p.teamId === first.id)).toBe(true);

    const state = getDraftState(db, bingo, { includeAnswers: false });
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

describe("leftovers", () => {
  // 2 teams, 3 signups: the newest one doesn't fit a full round.
  function setupLeftover(leftoverMode: "cut" | "singles") {
    const bingo = seedBingo({ leftoverMode });
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const players = ["p1", "p2", "p3"].map((d, i) => {
      const user = seedUser(d);
      db.insert(schema.signups).values({ bingoId: bingo.id, userId: user.id, rsn: d, createdAt: new Date(1_700_000_000_000 + i * 60_000) }).run();
      return user;
    });
    beginDraft(bingo);
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
    const first = teams.find((t) => t.draftOrder === 1)!;
    const second = teams.find((t) => t.draftOrder === 2)!;
    return { bingo, first, second, p1: players[0]!, p2: players[1]!, newest: players[2]! };
  }

  it("marks only the newest signups that don't fill a round", () => {
    const { bingo, newest } = setupLeftover("cut");
    const state = getDraftState(db, bingo, { includeAnswers: false });
    expect(state.pool.filter((u) => u.leftover).map((u) => u.entries[0]!.user.id)).toEqual([newest.id]);
    expect(getLeftoverUserIds(db, bingo)).toEqual(new Set([newest.id]));
  });

  it("marks nothing until there are two teams", () => {
    const bingo = seedBingo({ stage: "signup" });
    const c1 = seedCaptain(bingo.id, "c1");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    const p1 = seedUser("p1");
    createSignup(db, bingo, { bingoId: bingo.id, userId: p1.id, rsn: "p1", answers: [] });
    expect(getLeftoverUserIds(db, bingo).size).toBe(0);
  });

  it("keeps the same signups marked as the draft progresses", () => {
    const { bingo, first, p1, newest } = setupLeftover("cut");
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });
    expect(getLeftoverUserIds(db, bingo)).toEqual(new Set([newest.id]));
  });

  it("cut: refuses to draft a leftover and ends the draft once the main pool is empty", () => {
    const { bingo, first, second, p1, p2, newest } = setupLeftover("cut");
    expect(() => makePick(db, { bingo, pickedUserId: newest.id, actingUserId: first.captainUserId, actingIsAdmin: false })).toThrow(/doesn't fit a full round/i);
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });
    makePick(db, { bingo, pickedUserId: p2.id, actingUserId: second.captainUserId, actingIsAdmin: false });
    const state = getDraftState(db, bingo, { includeAnswers: false });
    expect(state.currentPick).toBeNull();
    expect(state.pool.map((u) => u.entries[0]!.user.id)).toEqual([newest.id]);
  });

  it("singles: drafts leftovers after the main pool, continuing the snake", () => {
    const { bingo, first, second, p1, p2, newest } = setupLeftover("singles");
    expect(() => makePick(db, { bingo, pickedUserId: newest.id, actingUserId: first.captainUserId, actingIsAdmin: false })).toThrow(/singles round/i);
    makePick(db, { bingo, pickedUserId: p1.id, actingUserId: first.captainUserId, actingIsAdmin: false });
    makePick(db, { bingo, pickedUserId: p2.id, actingUserId: second.captainUserId, actingIsAdmin: false });
    const state = getDraftState(db, bingo, { includeAnswers: false });
    // Pick 3 of a 2-team snake goes back to whoever picked last.
    expect(state.currentPick).toMatchObject({ pickNumber: 3, teamId: second.id, singlesRound: true });
    makePick(db, { bingo, pickedUserId: newest.id, actingUserId: second.captainUserId, actingIsAdmin: false });
    expect(getDraftState(db, bingo, { includeAnswers: false }).currentPick).toBeNull();
  });
});

describe("pick ratings", () => {
  it("upserts, clears on zero stars without a note, and stays per team", () => {
    const bingo = seedBingo({ stage: "signup" });
    const capA = seedCaptain(bingo.id, "capA");
    const capB = seedCaptain(bingo.id, "capB");
    const teamA = createTeam(db, { bingoId: bingo.id, captainUserId: capA.id });
    const teamB = createTeam(db, { bingoId: bingo.id, captainUserId: capB.id });
    const player = seedUser("p1");
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: player.id, rsn: "p1", answers: [] });

    setPickRating(db, teamA.id, signup.id, { stars: 2, note: "  solid  " });
    expect(getTeamRatings(db, teamA.id)).toEqual({ [signup.id]: { stars: 2, note: "solid" } });
    expect(getTeamRatings(db, teamB.id)).toEqual({});

    setPickRating(db, teamA.id, signup.id, { stars: 3, note: "" });
    expect(getTeamRatings(db, teamA.id)[signup.id]).toEqual({ stars: 3, note: "" });

    setPickRating(db, teamA.id, signup.id, { stars: 0, note: "" });
    expect(getTeamRatings(db, teamA.id)).toEqual({});

    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "draft.rating_set")).all();
    expect(rows.map((r) => [r.teamId, JSON.parse(r.details)])).toEqual([
      [teamA.id, { rsn: "p1", stars: 2, hasNote: true, cleared: false }],
      [teamA.id, { rsn: "p1", stars: 3, hasNote: false, cleared: false }],
      [teamA.id, { rsn: "p1", stars: 0, hasNote: false, cleared: true }],
    ]);
  });

  it("rejects out-of-range stars and signups from another bingo", () => {
    const bingo = seedBingo({ stage: "signup" });
    const capA = seedCaptain(bingo.id, "capA");
    const teamA = createTeam(db, { bingoId: bingo.id, captainUserId: capA.id });
    const player = seedUser("p1");
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: player.id, rsn: "p1", answers: [] });

    expect(() => setPickRating(db, teamA.id, signup.id, { stars: 4, note: "" })).toThrow(ServiceError);
    expect(() => setPickRating(db, teamA.id, "nope", { stars: 1, note: "" })).toThrow(ServiceError);
  });

  it("rates both halves of a duo pair as one unit", () => {
    const bingo = seedBingo({ signupMode: "duo", stage: "signup" });
    const cap = seedCaptain(bingo.id, "cap");
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: cap.id });
    const [a, b] = ["a", "b"].map((d) => seedUser(d));
    const signupA = createSignup(db, bingo, { bingoId: bingo.id, userId: a!.id, rsn: "a", answers: [] });
    const signupB = createSignup(db, bingo, { bingoId: bingo.id, userId: b!.id, rsn: "b", answers: [] });
    adminPair(db, bingo, { userIdA: a!.id, userIdB: b!.id, createdByUserId: cap.id });

    setPickRating(db, team.id, signupA.id, { stars: 2, note: "strong duo" });
    expect(getTeamRatings(db, team.id)).toEqual({
      [signupA.id]: { stars: 2, note: "strong duo" },
      [signupB.id]: { stars: 2, note: "strong duo" },
    });

    setPickRating(db, team.id, signupB.id, { stars: 0, note: "" });
    expect(getTeamRatings(db, team.id)).toEqual({});

    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "draft.rating_set")).all();
    expect(rows.map((r) => JSON.parse(r.details).rsn)).toEqual(["a & b", "b & a"]);
  });
});
