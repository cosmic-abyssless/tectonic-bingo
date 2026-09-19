import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createQuestion, deleteQuestion, reorderQuestions, updateQuestion } from "./signupService";
import { createSignup, getAllSignups, getSignupForUser, markBuyin, updateSignup, withdrawSignup } from "./signupService";
import { ServiceError } from "./errors";
import { createTeam } from "./teamService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const [member] = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().all();
  const bingo = db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "signup", ...overrides }).returning().get();
  return { bingo, adminId: admin.id, memberId: member.id };
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("createSignup", () => {
  it("creates a signup with answers during the signup stage", () => {
    const { bingo, memberId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Combat style?", type: "text" });
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [{ questionId: q.id, value: "Melee" }] });
    expect(signup.rsn).toBe("MyRsn");

    const found = getSignupForUser(db, bingo.id, memberId);
    expect(found?.answers).toEqual([expect.objectContaining({ questionId: q.id, value: "Melee" })]);
  });

  it("rejects signups outside the signup stage", () => {
    const { bingo, memberId } = seedBingo({ stage: "planning" });
    expect(() => createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] })).toThrow(ServiceError);
  });

  it("rejects a second signup from the same user", () => {
    const { bingo, memberId } = seedBingo();
    createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    expect(() => createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Again", answers: [] })).toThrow(/already signed up/);
  });

  it("rejects a missing answer to a required question", () => {
    const { bingo, memberId } = seedBingo();
    createQuestion(db, { bingoId: bingo.id, prompt: "Required Q", type: "text", required: true });
    expect(() => createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] })).toThrow(/required question/);
  });

  it("stores womId/rsnVerified when passed, and defaults to unverified when omitted", () => {
    const { bingo, memberId, adminId } = seedBingo();
    const verified = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [], womId: "1135", rsnVerified: true });
    expect(verified.womId).toBe("1135");
    expect(verified.rsnVerified).toBe(true);

    const unverified = createSignup(db, bingo, { bingoId: bingo.id, userId: adminId, rsn: "OtherRsn", answers: [] });
    expect(unverified.womId).toBeNull();
    expect(unverified.rsnVerified).toBe(false);
  });
});

describe("updateSignup / withdrawSignup", () => {
  it("updates rsn and answers during the signup stage", () => {
    const { bingo, memberId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Q", type: "text" });
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Old", answers: [{ questionId: q.id, value: "A" }] });

    updateSignup(db, bingo, signup.id, { rsn: "New", answers: [{ questionId: q.id, value: "B" }] });

    const found = getSignupForUser(db, bingo.id, memberId)!;
    expect(found.signup.rsn).toBe("New");
    expect(found.answers).toEqual([expect.objectContaining({ value: "B" })]);
  });

  it("rejects edits outside the signup stage", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Old", answers: [] });
    const closedBingo = { ...bingo, stage: "draft" as const };
    expect(() => updateSignup(db, closedBingo, signup.id, { rsn: "New" })).toThrow(ServiceError);
  });

  it("updates womId/rsnVerified alongside rsn, resetting to unverified when omitted", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Old", answers: [] });

    updateSignup(db, bingo, signup.id, { rsn: "New", womId: "1135", rsnVerified: true });
    expect(getSignupForUser(db, bingo.id, memberId)!.signup).toEqual(expect.objectContaining({ rsn: "New", womId: "1135", rsnVerified: true }));

    updateSignup(db, bingo, signup.id, { rsn: "Newer" });
    expect(getSignupForUser(db, bingo.id, memberId)!.signup).toEqual(expect.objectContaining({ rsn: "Newer", womId: null, rsnVerified: false }));
  });

  it("marks a signup withdrawn", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Old", answers: [] });
    const withdrawn = withdrawSignup(db, bingo, signup.id);
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("refuses to withdraw a player who leads a team", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Cap", answers: [] });
    createTeam(db, { bingoId: bingo.id, captainUserId: memberId });
    expect(() => withdrawSignup(db, bingo, signup.id)).toThrow(/leads a team/);
  });

  it("lets mods, but not players, withdraw during the captains stage", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Late", answers: [] });
    const captainsStage = { ...bingo, stage: "captains" as const };
    expect(() => withdrawSignup(db, captainsStage, signup.id)).toThrow(/signup stage/);
    expect(withdrawSignup(db, captainsStage, signup.id, { byMod: true }).status).toBe("withdrawn");
    expect(() => withdrawSignup(db, { ...bingo, stage: "draft" }, signup.id, { byMod: true })).toThrow(/draft has started/);
  });
});

describe("getAllSignups / markBuyin", () => {
  it("returns the roster with answers and joined user info", () => {
    const { bingo, memberId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Q", type: "text" });
    createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [{ questionId: q.id, value: "A" }] });

    const roster = getAllSignups(db, bingo.id);
    expect(roster).toHaveLength(1);
    expect(roster[0].user.discordUsername).toBe("member");
    expect(roster[0].answers).toEqual([expect.objectContaining({ value: "A" })]);
    expect(roster[0].caCurrent).toBeNull();
    expect(roster[0].caPeak).toBeNull();
  });

  it("exposes persisted Current/Peak CA without the raw RuneProfile blob", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    db.update(schema.signups)
      .set({
        caCurrentJson: JSON.stringify({ tier: "easy", points: 41 }),
        caPeakJson: JSON.stringify({ tier: "master", points: 1965 }),
        runeProfileDataJson: JSON.stringify({ username: "secret-alt", combatAchievements: [] }),
      })
      .where(eq(schema.signups.id, signup.id))
      .run();

    const roster = getAllSignups(db, bingo.id);
    expect(roster[0].caCurrent).toEqual({ tier: "easy", points: 41 });
    expect(roster[0].caPeak).toEqual({ tier: "master", points: 1965 });
    expect(JSON.stringify(roster[0])).not.toContain("secret-alt");
    expect(roster[0].signup).not.toHaveProperty("runeProfileDataJson");
  });

  it("records who collected and who recorded the buy-in, and can unmark it", () => {
    const { bingo, memberId, adminId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });

    const marked = markBuyin(db, bingo, signup.id, { received: true, collectedByUserId: adminId, recordedByUserId: adminId });
    expect(marked.buyinReceivedAt).not.toBeNull();
    expect(marked.buyinCollectedByUserId).toBe(adminId);
    expect(marked.buyinRecordedByUserId).toBe(adminId);

    const unmarked = markBuyin(db, bingo, signup.id, { received: false, recordedByUserId: adminId });
    expect(unmarked.buyinReceivedAt).toBeNull();
  });

  it("rejects marking buy-in outside signup/draft/reveal", () => {
    const { bingo, memberId, adminId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    const liveBingo = { ...bingo, stage: "live" as const };
    expect(() => markBuyin(db, liveBingo, signup.id, { received: true, recordedByUserId: adminId })).toThrow(ServiceError);
  });

  it("joins the collector's user info onto the roster, and clears it when unmarked", () => {
    const { bingo, memberId, adminId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });

    markBuyin(db, bingo, signup.id, { received: true, collectedByUserId: adminId, recordedByUserId: adminId });
    const withCollector = getAllSignups(db, bingo.id);
    expect(withCollector[0].collectedByUser?.discordUsername).toBe("admin");

    markBuyin(db, bingo, signup.id, { received: false, recordedByUserId: adminId });
    const withoutCollector = getAllSignups(db, bingo.id);
    expect(withoutCollector[0].collectedByUser).toBeNull();
  });
});

describe("audit trail", () => {
  it("question CRUD records created/updated/deleted/reordered", () => {
    const { bingo } = seedBingo();
    const q1 = createQuestion(db, { bingoId: bingo.id, prompt: "Q1", type: "text" });
    const q2 = createQuestion(db, { bingoId: bingo.id, prompt: "Q2", type: "text" });
    updateQuestion(db, q1.id, { prompt: "Q1 edited" });
    reorderQuestions(db, bingo.id, [q2.id, q1.id]);
    deleteQuestion(db, q2.id);

    const actions = db.select().from(schema.auditLog).all().map((r) => r.action);
    expect(actions).toEqual(["question.created", "question.created", "question.updated", "question.reordered", "question.deleted"]);
    const updated = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "question.updated")).get()!;
    expect(JSON.parse(updated.details).changes).toEqual({ before: { prompt: "Q1" }, after: { prompt: "Q1 edited" } });
  });

  it("createSignup records signup.created, flagging a re-signup as reactivated", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    withdrawSignup(db, bingo, signup.id);
    createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "NewRsn", answers: [] });

    const created = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.created")).all();
    expect(created).toHaveLength(2);
    expect(JSON.parse(created[0]!.details)).toMatchObject({ reactivated: false });
    expect(JSON.parse(created[1]!.details)).toMatchObject({ reactivated: true, rsn: "NewRsn" });
  });

  it("updateSignup records rsn before/after and which answers changed", () => {
    const { bingo, memberId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Q", type: "text" });
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Old", answers: [{ questionId: q.id, value: "A" }] });

    updateSignup(db, bingo, signup.id, { rsn: "New", answers: [{ questionId: q.id, value: "B" }] });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.updated")).get()!;
    const details = JSON.parse(row.details);
    expect(details.rsn).toEqual({ before: "Old", after: "New" });
    expect(details.answersChanged).toEqual([q.id]);
  });

  it("withdrawSignup records signup.withdrawn", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    withdrawSignup(db, bingo, signup.id);
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.withdrawn")).get()!;
    expect(JSON.parse(row.details)).toEqual({ rsn: "MyRsn" });
    expect(row.onBehalfOfUserId).toBeNull();
  });

  it("a mod withdrawal records who the signup belonged to", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    withdrawSignup(db, bingo, signup.id, { byMod: true });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.withdrawn")).get()!;
    expect(row.onBehalfOfUserId).toBe(memberId);
  });

  it("markBuyin records the before receivedAt state and the collector's name", () => {
    const { bingo, memberId, adminId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    markBuyin(db, bingo, signup.id, { received: true, collectedByUserId: adminId, recordedByUserId: adminId });
    markBuyin(db, bingo, signup.id, { received: false, recordedByUserId: adminId });

    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.buyin_marked")).all();
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[0]!.details)).toMatchObject({ received: true, collectedByName: "admin", before: { receivedAt: null } });
    const secondBefore = JSON.parse(rows[1]!.details).before.receivedAt;
    expect(secondBefore).not.toBeNull();
  });
});

describe("re-signing up after withdrawing", () => {
  it("reactivates the withdrawn row with the new details and cleared buy-in", () => {
    const { bingo, memberId, adminId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Style?", type: "text" });
    const first = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "OldRsn", answers: [{ questionId: q.id, value: "Melee" }] });
    markBuyin(db, bingo, first.id, { received: true, recordedByUserId: adminId });
    withdrawSignup(db, bingo, first.id);

    const again = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "NewRsn", answers: [{ questionId: q.id, value: "Range" }] });
    expect(again).toMatchObject({ id: first.id, rsn: "NewRsn", status: "active", buyinReceivedAt: null });
    expect(getSignupForUser(db, bingo.id, memberId)!.answers.map((a) => a.value)).toEqual(["Range"]);
    expect(getAllSignups(db, bingo.id)).toHaveLength(1);
  });
});
