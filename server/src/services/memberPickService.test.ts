import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { formatSignupAnswer } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createQuestion, createSignup, getAllSignups, getSignupForUser, updateQuestion, updateSignup } from "./signupService";
import { getPickableMembers, memberNames } from "./memberPickService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

const user = (discordId: string, extra: Partial<typeof schema.users.$inferInsert> = {}) =>
  db.insert(schema.users).values({ discordId, discordUsername: discordId, ...extra }).returning().get();

function seed(question: { multiplePicks?: boolean; maxPicks?: number | null; required?: boolean } = {}) {
  const admin = user("admin", { isAdmin: true });
  const me = user("me");
  const zezima = user("zez", { discordGlobalName: "Zez" });
  const lynx = user("lynx");
  const bingo = db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "signup" }).returning().get();
  const q = createQuestion(db, { bingoId: bingo.id, prompt: "Who would you like to play with?", type: "member", ...question });
  return { admin, me, zezima, lynx, bingo, question: q };
}

type Bingo = typeof schema.bingos.$inferSelect;
const signUp = (bingo: Bingo, userId: string, questionId: string, value: string, rsn = "Player") =>
  createSignup(db, bingo, { bingoId: bingo.id, userId, rsn, answers: [{ questionId, value }] });
const stored = (signupId: string) => db.select().from(schema.signupAnswers).where(eq(schema.signupAnswers.signupId, signupId)).get()!.value;

describe("Member pick settings", () => {
  it("is one pick by default, and can be several with an optional maximum", () => {
    const { bingo, question } = seed();
    expect(question).toMatchObject({ type: "member", multiplePicks: false, maxPicks: null });
    const several = createQuestion(db, { bingoId: bingo.id, prompt: "Who have you played with?", type: "member", multiplePicks: true, maxPicks: 3 });
    expect(several).toMatchObject({ multiplePicks: true, maxPicks: 3 });
    expect(updateQuestion(db, several.id, { maxPicks: null }).maxPicks).toBeNull();
  });

  it("refuses a maximum on one pick, a bad maximum, and the settings on other types", () => {
    const { bingo, question } = seed();
    expect(() => updateQuestion(db, question.id, { maxPicks: 2 })).toThrow(/several members can have a maximum/);
    expect(() => createQuestion(db, { bingoId: bingo.id, prompt: "x", type: "member", multiplePicks: true, maxPicks: 0 })).toThrow(/whole number/);
    expect(() => createQuestion(db, { bingoId: bingo.id, prompt: "x", type: "member", multiplePicks: true, maxPicks: 1.5 })).toThrow(/whole number/);
    expect(() => createQuestion(db, { bingoId: bingo.id, prompt: "x", type: "text", multiplePicks: true })).toThrow(/Only a Member pick/);
  });

  it("drops the maximum when several goes back to one, and both when the question stops being a Member pick", () => {
    const { question } = seed({ multiplePicks: true, maxPicks: 4 });
    expect(updateQuestion(db, question.id, { multiplePicks: false })).toMatchObject({ multiplePicks: false, maxPicks: null });
    updateQuestion(db, question.id, { multiplePicks: true, maxPicks: 4 });
    expect(updateQuestion(db, question.id, { type: "text" })).toMatchObject({ type: "text", multiplePicks: false, maxPicks: null });
  });
});

describe("the pickable member list", () => {
  it("is every logged-in clan member but the answerer, named by latest signup RSN or else Discord name", () => {
    const { me, zezima, lynx, admin, bingo } = seed();
    user("gone", { inGuild: false });
    // Lynx signed up to an older bingo as "Old Lynx" and to this one as "Lynx Titan": the latest wins.
    const older = db.insert(schema.bingos).values({ slug: "older", name: "Older", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "signup" }).returning().get();
    db.insert(schema.signups).values({ bingoId: older.id, userId: lynx.id, rsn: "Old Lynx", createdAt: new Date("2026-01-01") }).run();
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: lynx.id, rsn: "Lynx Titan", createdAt: new Date("2026-09-01") }).run();

    const members = getPickableMembers(db, me.id);
    expect(members).toEqual([
      { userId: admin.id, name: "admin", discordName: "admin" },
      { userId: lynx.id, name: "Lynx Titan", discordName: "lynx" },
      { userId: zezima.id, name: "Zez", discordName: "Zez" },
    ]);
  });

  it("carries names only, nothing else about the account", () => {
    const { me } = seed();
    for (const m of getPickableMembers(db, me.id)) expect(Object.keys(m).sort()).toEqual(["discordName", "name", "userId"]);
  });
});

describe("Member pick answers", () => {
  it("are stored as user ids and read back with the members' current names", () => {
    const { bingo, me, zezima, lynx, question } = seed({ multiplePicks: true });
    const signup = signUp(bingo, me.id, question.id, JSON.stringify([zezima.id, lynx.id]));
    expect(stored(signup.id)).toBe(JSON.stringify([zezima.id, lynx.id]));

    signUp(bingo, lynx.id, question.id, "[]", "Lynx Titan");
    const answer = getSignupForUser(db, bingo.id, me.id)!.answers[0]!;
    expect(formatSignupAnswer("member", answer.value)).toBe("Zez, Lynx Titan");
    const roster = getAllSignups(db, bingo.id).find((r) => r.signup.id === signup.id)!;
    expect(formatSignupAnswer("member", roster.answers[0]!.value)).toBe("Zez, Lynx Titan");
  });

  it("refuses self-picks, unknown or out-of-clan users, and the same member twice", () => {
    const { bingo, me, zezima, question } = seed({ multiplePicks: true });
    const gone = user("gone", { inGuild: false });
    expect(() => signUp(bingo, me.id, question.id, JSON.stringify([me.id]))).toThrow(/can't pick yourself/);
    expect(() => signUp(bingo, me.id, question.id, JSON.stringify(["nobody"]))).toThrow(/Only clan members/);
    expect(() => signUp(bingo, me.id, question.id, JSON.stringify([gone.id]))).toThrow(/Only clan members/);
    expect(() => signUp(bingo, me.id, question.id, JSON.stringify([zezima.id, zezima.id]))).toThrow(/picked twice/);
    expect(() => signUp(bingo, me.id, question.id, "Zezima")).toThrow(/list of members/);
  });

  it("holds one pick, or several up to the maximum", () => {
    const one = seed();
    expect(() => signUp(one.bingo, one.me.id, one.question.id, JSON.stringify([one.zezima.id, one.lynx.id]))).toThrow(/only one/);
    const capped = createQuestion(db, { bingoId: one.bingo.id, prompt: "One at most", type: "member", multiplePicks: true, maxPicks: 1 });
    expect(() => signUp(one.bingo, one.me.id, capped.id, JSON.stringify([one.zezima.id, one.lynx.id]))).toThrow(/at most 1 member$/);
  });

  it("needs a pick when required", () => {
    const { bingo, me, zezima, question } = seed({ required: true });
    expect(() => signUp(bingo, me.id, question.id, "[]")).toThrow(/required question/);
    expect(() => signUp(bingo, me.id, question.id, "")).toThrow(/required question/);
    expect(() => signUp(bingo, me.id, question.id, JSON.stringify([zezima.id]))).not.toThrow();
  });

  it("takes back the named form the server sends out", () => {
    const { bingo, me, zezima, question } = seed();
    const signup = signUp(bingo, me.id, question.id, JSON.stringify([{ id: zezima.id, name: "Zez" }]));
    expect(stored(signup.id)).toBe(JSON.stringify([zezima.id]));
  });

  it("keeps a pick, and its name, after the member leaves the clan", () => {
    const { bingo, me, zezima, lynx, question } = seed({ multiplePicks: true });
    const signup = signUp(bingo, me.id, question.id, JSON.stringify([zezima.id]));
    db.update(schema.users).set({ inGuild: false }).where(eq(schema.users.id, zezima.id)).run();
    expect(formatSignupAnswer("member", getSignupForUser(db, bingo.id, me.id)!.answers[0]!.value)).toBe("Zez");
    // Saving the form with them still picked works; picking them afresh wouldn't.
    expect(() => updateSignup(db, bingo, signup.id, { answers: [{ questionId: question.id, value: JSON.stringify([zezima.id, lynx.id]) }] })).not.toThrow();
    expect(stored(signup.id)).toBe(JSON.stringify([zezima.id, lynx.id]));
    updateSignup(db, bingo, signup.id, { answers: [{ questionId: question.id, value: JSON.stringify([lynx.id]) }] });
    expect(() => updateSignup(db, bingo, signup.id, { answers: [{ questionId: question.id, value: JSON.stringify([lynx.id, zezima.id]) }] })).toThrow(/Only clan members/);
  });

  it("names a member by their RSN in this bingo first", () => {
    const { bingo, zezima, lynx, question } = seed();
    signUp(bingo, zezima.id, question.id, "", "Zezima");
    expect(memberNames(db, bingo.id, [zezima.id, lynx.id])).toEqual(new Map([[zezima.id, "Zezima"], [lynx.id, "lynx"]]));
  });

  it("records the change in the audit log by name", () => {
    const { bingo, me, zezima, question } = seed();
    const signup = signUp(bingo, me.id, question.id, "");
    updateSignup(db, bingo, signup.id, { answers: [{ questionId: question.id, value: JSON.stringify([zezima.id]) }] });
    const entry = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.updated")).get()!;
    expect(JSON.parse(entry.details)).toEqual({ changes: { before: { [question.prompt]: "—" }, after: { [question.prompt]: "Zez" } } });
  });
});
