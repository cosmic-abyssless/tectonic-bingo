import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createQuestion } from "./signupService";
import { createSignup, getAllSignups, getSignupForUser, markBuyin, updateSignup, withdrawSignup } from "./signupService";
import { ServiceError } from "./errors";

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

  it("marks a signup withdrawn", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Old", answers: [] });
    const withdrawn = withdrawSignup(db, bingo, signup.id);
    expect(withdrawn.status).toBe("withdrawn");
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
});
