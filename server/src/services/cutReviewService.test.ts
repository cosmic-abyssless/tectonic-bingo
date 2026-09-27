import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTeam, getTeamsForBingo } from "./teamService";
import { adminPair, getAcceptedPairs } from "./pairingService";
import { applyCutReview, assertCutReviewSatisfied, currentCutReviewFingerprint, getCutReviewPreview, scoreCutChanges } from "./cutReviewService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const bingo = db
    .insert(schema.bingos)
    .values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "captains", signupMode: "duo", cutMode: "even", ...overrides })
    .returning()
    .get();
  return { bingo, admin };
}

function seedUser(discordId: string) {
  return db.insert(schema.users).values({ discordId, discordUsername: discordId }).returning().get();
}

// A captain needs an active signup, same as teamService.createTeam requires.
function seedCaptain(bingoId: string, discordId: string) {
  const user = seedUser(discordId);
  db.insert(schema.signups).values({ bingoId, userId: user.id, rsn: discordId }).run();
  return user;
}

function signUp(bingoId: string, discordId: string, at: Date) {
  const user = seedUser(discordId);
  db.insert(schema.signups).values({ bingoId, userId: user.id, rsn: discordId, createdAt: at }).run();
  return user;
}

// 2 Teams (led by captains with no partner of their own), one accepted pair and two singles in the pool: the
// same shape as the planner's "1 pair + 2 singles" example — 2 Avoidable cut, 0 Unavoidable.
function seedAvoidableScenario() {
  const { bingo, admin } = seedBingo();
  const signupStage = { ...bingo, stage: "signup" as const };
  const c1 = seedCaptain(bingo.id, "c1");
  const c2 = seedCaptain(bingo.id, "c2");
  createTeam(db, { bingoId: bingo.id, captainUserId: c1.id, name: "A" });
  createTeam(db, { bingoId: bingo.id, captainUserId: c2.id, name: "B" });
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  const a = signUp(bingo.id, "a", new Date(base));
  const b = signUp(bingo.id, "b", new Date(base + 1000));
  adminPair(db, signupStage, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id });
  const c = signUp(bingo.id, "c", new Date(base + 2000));
  const d = signUp(bingo.id, "d", new Date(base + 3000));
  return { bingo, admin, c1, c2, a, b, c, d };
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("getCutReviewPreview / scoreCutChanges", () => {
  it("splits cutPlayersNow into Avoidable and Unavoidable, and proposes the fix", () => {
    const { bingo, c, d } = seedAvoidableScenario();
    const preview = getCutReviewPreview(db, bingo);
    expect(preview.plan.cutPlayersNow).toBe(2);
    expect(preview.plan.cutPlayers).toBe(0);
    expect(preview.avoidableCount).toBe(2);
    expect(preview.unavoidableCount).toBe(0);
    expect(preview.plan.changes).toEqual([{ kind: "pair", signupIds: [c.id, d.id] }]);
  });

  it("scores an admin's own edit against the current pool", () => {
    const { bingo, c, d } = seedAvoidableScenario();
    expect(scoreCutChanges(db, bingo, [{ kind: "pair", signupIds: [c.id, d.id] }])).toBe(0);
    expect(scoreCutChanges(db, bingo, [])).toBe(2);
  });

  it("rejects scoring a change that no longer fits the roster", () => {
    const { bingo, a, c } = seedAvoidableScenario();
    // "a" already has a partner ("b") — pairing them with "c" doesn't fit.
    expect(() => scoreCutChanges(db, bingo, [{ kind: "pair", signupIds: [a.id, c.id] }])).toThrow(ServiceError);
  });

  it("reports 0 Avoidable once nothing but an Unavoidable cut is left (2 Teams, 3 singles)", () => {
    const { bingo } = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    signUp(bingo.id, "x", new Date(base));
    signUp(bingo.id, "y", new Date(base + 1000));
    signUp(bingo.id, "z", new Date(base + 2000));
    const preview = getCutReviewPreview(db, bingo);
    expect(preview.avoidableCount).toBe(0);
    expect(preview.unavoidableCount).toBe(1);
    expect(preview.plan.changes).toEqual([]);
  });
});

describe("applyCutReview", () => {
  it("applies every change, through the existing audited operations, and records the review", () => {
    const { bingo, admin, c, d } = seedAvoidableScenario();
    const result = applyCutReview(db, bingo, [{ kind: "pair", signupIds: [c.id, d.id] }], admin.id);
    expect(result.cutPlayers).toBe(0);

    expect(getAcceptedPairs(db, bingo.id).some((p) => p.userIds.includes(c.id) && p.userIds.includes(d.id))).toBe(true);
    // 2, not 1: seedAvoidableScenario's own setup (pairing "a" & "b") already recorded one.
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.admin_paired")).all()).toHaveLength(2);
    const applied = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "draft.cut_review_applied")).get()!;
    expect(JSON.parse(applied.details)).toMatchObject({ cutPlayers: 0, cutPlayersNow: 2 });

    const fresh = db.select({ cutReviewFingerprint: schema.bingos.cutReviewFingerprint }).from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!;
    expect(fresh.cutReviewFingerprint).toBe(currentCutReviewFingerprint(db, bingo));
  });

  it("an empty change list is valid — a deliberate 'keep these cuts' — and still records the review", () => {
    const { bingo, admin } = seedAvoidableScenario();
    const result = applyCutReview(db, bingo, [], admin.id);
    expect(result.cutPlayers).toBe(2); // nothing changed, so both are still cut
    const applied = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "draft.cut_review_applied")).get()!;
    expect(JSON.parse(applied.details).changes).toEqual([]);
  });

  it("adds a Team, choosing the captain's own accepted partner as co-captain automatically", () => {
    const { bingo, admin, c, d } = seedAvoidableScenario();
    // "c" and "d" are unpaired singles; make them the new Team's captain and (via applyCutReview's own lookup) partner.
    adminPair(db, { ...bingo, stage: "signup" }, { userIdA: c.id, userIdB: d.id, createdByUserId: admin.id });
    applyCutReview(db, bingo, [{ kind: "addTeam", captainUserId: c.id }], admin.id);
    const teams = getTeamsForBingo(db, bingo.id);
    expect(teams).toHaveLength(3);
    const newTeam = teams.find((t) => t.captainUserId === c.id)!;
    const coCaptain = db.select().from(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, newTeam.id), eq(schema.teamMembers.isCoCaptain, true))).get();
    expect(coCaptain?.userId).toBe(d.id);
  });

  it("removes a Team with no draft history", () => {
    const { bingo, admin, c1 } = seedAvoidableScenario();
    const teamToRemove = getTeamsForBingo(db, bingo.id).find((t) => t.captainUserId === c1.id)!;
    applyCutReview(db, bingo, [{ kind: "removeTeam", teamId: teamToRemove.id }], admin.id);
    expect(getTeamsForBingo(db, bingo.id).some((t) => t.id === teamToRemove.id)).toBe(false);
  });

  it("never half-applies a stale plan: rolls back every change in the same call", () => {
    const { bingo, admin, a, c, d } = seedAvoidableScenario();
    const teamCountBefore = getTeamsForBingo(db, bingo.id).length;
    // A valid addTeam change alongside a pairing that's already stale ("a" already has a partner).
    expect(() =>
      applyCutReview(
        db,
        bingo,
        [
          { kind: "addTeam", captainUserId: c.id },
          { kind: "pair", signupIds: [a.id, d.id] },
        ],
        admin.id,
      ),
    ).toThrow(ServiceError);
    expect(getTeamsForBingo(db, bingo.id)).toHaveLength(teamCountBefore);
    // 2, not 0: seedAvoidableScenario's own setup (Teams "A" and "B") already recorded two; the attempted 3rd
    // Team, and its audit row, must not have survived the rollback.
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "team.created")).all()).toHaveLength(2);
  });
});

describe("assertCutReviewSatisfied", () => {
  it("refuses while a cut is Avoidable and no review has been applied", () => {
    const { bingo } = seedAvoidableScenario();
    expect(() => assertCutReviewSatisfied(db, bingo)).toThrow(ServiceError);
    try {
      assertCutReviewSatisfied(db, bingo);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).code).toBe("cut_review_required");
    }
  });

  it("allows once a review is applied, even with every change dropped", () => {
    const { bingo, admin } = seedAvoidableScenario();
    applyCutReview(db, bingo, [], admin.id);
    expect(() => assertCutReviewSatisfied(db, bingo)).not.toThrow();
  });

  it("refuses again once the roster changes after that review", () => {
    const { bingo, admin } = seedAvoidableScenario();
    applyCutReview(db, bingo, [], admin.id);
    signUp(bingo.id, "e", new Date("2026-02-01T00:00:00Z"));
    expect(() => assertCutReviewSatisfied(db, bingo)).toThrow(/cuts can be avoided/i);
  });

  it("allows when nothing is Avoidable, without ever applying a review", () => {
    const { bingo } = seedBingo();
    const c1 = seedCaptain(bingo.id, "c1");
    const c2 = seedCaptain(bingo.id, "c2");
    createTeam(db, { bingoId: bingo.id, captainUserId: c1.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: c2.id });
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    signUp(bingo.id, "x", new Date(base));
    signUp(bingo.id, "y", new Date(base + 1000));
    signUp(bingo.id, "z", new Date(base + 2000));
    expect(() => assertCutReviewSatisfied(db, bingo)).not.toThrow();
  });

  it('allows with cutMode "none", without ever applying a review', () => {
    const { bingo } = seedAvoidableScenario();
    db.update(schema.bingos).set({ cutMode: "none" }).where(eq(schema.bingos.id, bingo.id)).run();
    expect(() => assertCutReviewSatisfied(db, { ...bingo, cutMode: "none" })).not.toThrow();
  });
});
