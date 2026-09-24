import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createQuestion, deleteQuestion, reorderQuestions, updateQuestion } from "./signupService";
import { createSignup, getAllSignups, getAnswerCounts, getSignupForUser, markBuyin, setSignupTimezone, updateSignup, withdrawSignup } from "./signupService";
import { cancelRequest, requestPairing } from "./pairingService";
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

describe("multiple-choice questions", () => {
  const seedQuestion = (required = false) => {
    const { bingo, memberId } = seedBingo();
    const question = createQuestion(db, { bingoId: bingo.id, prompt: "Which bosses?", type: "multiselect", optionsJson: JSON.stringify(["Vorkath", "Zulrah", "Hydra"]), required });
    return { bingo, memberId, question };
  };
  const stored = (signupId: string) => db.select().from(schema.signupAnswers).where(eq(schema.signupAnswers.signupId, signupId)).get()!.value;

  it("needs options, like a single-choice question", () => {
    const { bingo } = seedBingo();
    expect(() => createQuestion(db, { bingoId: bingo.id, prompt: "Which?", type: "multiselect" })).toThrow(ServiceError);
  });

  it("stores the chosen options as a cleaned list, and none as an empty list", () => {
    const { bingo, memberId, question } = seedQuestion();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Player", answers: [{ questionId: question.id, value: JSON.stringify([" Zulrah ", "Vorkath", "Zulrah", ""]) }] });
    expect(JSON.parse(stored(signup.id))).toEqual(["Zulrah", "Vorkath"]);
    const other = db.insert(schema.users).values({ discordId: "other", discordUsername: "other" }).returning().get();
    const none = createSignup(db, bingo, { bingoId: bingo.id, userId: other.id, rsn: "Other", answers: [{ questionId: question.id, value: "" }] });
    expect(JSON.parse(stored(none.id))).toEqual([]);
  });

  it("refuses an answer that isn't a list of choices", () => {
    const { bingo, memberId, question } = seedQuestion();
    for (const value of ["Zulrah", "{\"a\":1}", "[1,2]", "not json"]) {
      expect(() => createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Player", answers: [{ questionId: question.id, value }] }), value).toThrow(ServiceError);
    }
    expect(() => createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Player", answers: [{ questionId: question.id, value: JSON.stringify(Array.from({ length: 101 }, (_, i) => `c${i}`)) }] })).toThrow(/Too many/);
  });

  it("counts an empty list as unanswered when the question is required", () => {
    const { bingo, memberId, question } = seedQuestion(true);
    const attempt = (value: string) => () => createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Player", answers: [{ questionId: question.id, value }] });
    expect(attempt("[]")).toThrow(/every required question/);
    expect(attempt("")).toThrow(/every required question/);
    expect(attempt(JSON.stringify(["Hydra"]))).not.toThrow();
  });

  it("is cleaned the same way when a signup is edited", () => {
    const { bingo, memberId, question } = seedQuestion();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Player", answers: [{ questionId: question.id, value: JSON.stringify(["Hydra"]) }] });
    updateSignup(db, bingo, signup.id, { answers: [{ questionId: question.id, value: JSON.stringify(["Zulrah ", "Zulrah"]) }] });
    expect(JSON.parse(stored(signup.id))).toEqual(["Zulrah"]);
    expect(() => updateSignup(db, bingo, signup.id, { answers: [{ questionId: question.id, value: "Zulrah" }] })).toThrow(ServiceError);
  });

  it("still refuses a blank answer to a required question of any other type", () => {
    const { bingo, memberId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Timezone", type: "text", required: true });
    expect(() => createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Player", answers: [{ questionId: q.id, value: "   " }] })).toThrow(/every required question/);
  });
});

describe("question helper text", () => {
  const helper = (id: string) => db.select().from(schema.signupQuestions).where(eq(schema.signupQuestions.id, id)).get()!.helperText;

  it("stores the helper text trimmed, and treats blank or absent as none", () => {
    const { bingo } = seedBingo();
    const q = (helperText?: string | null) => createQuestion(db, { bingoId: bingo.id, prompt: "Timezone", type: "text", helperText });
    expect(q("  Which UTC offset do you play in?  ").helperText).toBe("Which UTC offset do you play in?");
    expect(q("   ").helperText).toBeNull();
    expect(q(null).helperText).toBeNull();
    expect(q().helperText).toBeNull();
  });

  it("refuses helper text that is too long or not text", () => {
    const { bingo } = seedBingo();
    const create = (helperText: unknown) => () => createQuestion(db, { bingoId: bingo.id, prompt: "Q", type: "text", helperText: helperText as string });
    expect(create("x".repeat(500))).not.toThrow();
    expect(create("x".repeat(501))).toThrow(ServiceError);
    expect(create(42)).toThrow(ServiceError);
  });

  it("can be set, changed and cleared on an existing question, without touching the rest", () => {
    const { bingo } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Gear tier", type: "select", optionsJson: JSON.stringify(["low", "high"]), required: true });
    updateQuestion(db, q.id, { helperText: " Pick the closest one. " });
    expect(helper(q.id)).toBe("Pick the closest one.");
    updateQuestion(db, q.id, { prompt: "Gear tier?" }); // an unrelated edit leaves it alone
    expect(helper(q.id)).toBe("Pick the closest one.");
    updateQuestion(db, q.id, { helperText: "" });
    expect(helper(q.id)).toBeNull();
    const after = db.select().from(schema.signupQuestions).where(eq(schema.signupQuestions.id, q.id)).get()!;
    expect(after).toMatchObject({ prompt: "Gear tier?", required: true, type: "select" });
    expect(() => updateQuestion(db, q.id, { helperText: "x".repeat(501) })).toThrow(ServiceError);
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

  it("exposes persisted EHB/EHP without the raw WOM blob", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    db.update(schema.signups)
      .set({ womDataJson: JSON.stringify({ ehb: 42.4, ehp: 110, type: "ironman", displayName: "secret-wom" }) })
      .where(eq(schema.signups.id, signup.id))
      .run();

    const roster = getAllSignups(db, bingo.id);
    expect(roster[0].womStats).toEqual({ ehb: 42.4, ehp: 110 });
    expect(JSON.stringify(roster[0])).not.toContain("secret-wom");
    expect(roster[0].signup).not.toHaveProperty("womDataJson");
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

  it("exposes a player's outstanding pairing request, resolved to the target's RSN", () => {
    const { bingo, memberId } = seedBingo({ signupMode: "duo" });
    createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    const [target] = db.insert(schema.users).values({ discordId: "target", discordUsername: "target" }).returning().all();
    createSignup(db, bingo, { bingoId: bingo.id, userId: target.id, rsn: "TargetRsn", answers: [] });

    const pairing = requestPairing(db, bingo, { requester: { id: memberId, discordId: "member" }, targetDiscordId: "target" });

    const roster = getAllSignups(db, bingo.id);
    const me = roster.find((r) => r.user.id === memberId)!;
    expect(me.outgoingPairingRequest?.pairing.id).toBe(pairing.id);
    expect(me.outgoingPairingRequest?.target).toMatchObject({ rsn: "TargetRsn", name: "TargetRsn" });
    // Not `pairing` — that stays null until the target accepts; a pending request is its own, separate thing.
    expect(me.pairing).toBeNull();
  });

  it("still resolves the request target when they haven't signed up, or even logged in, yet", () => {
    const { bingo, memberId } = seedBingo({ signupMode: "duo" });
    createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "MyRsn", answers: [] });
    db.insert(schema.users).values({ discordId: "loggedInOnly", discordUsername: "LoggedInOnly" }).run();
    requestPairing(db, bingo, { requester: { id: memberId, discordId: "member" }, targetDiscordId: "loggedInOnly" });

    const loggedInOnly = getAllSignups(db, bingo.id).find((r) => r.user.id === memberId)!;
    expect(loggedInOnly.outgoingPairingRequest?.target.rsn).toBeNull();
    expect(loggedInOnly.outgoingPairingRequest?.target.user?.discordUsername).toBe("LoggedInOnly");
    expect(loggedInOnly.outgoingPairingRequest?.target.name).toBe("LoggedInOnly");

    // Cancel that one, then request someone with no user row at all — the fully unresolved case.
    cancelRequest(db, bingo, { id: memberId, discordId: "member" }, loggedInOnly.outgoingPairingRequest!.pairing.id);
    requestPairing(db, bingo, { requester: { id: memberId, discordId: "member" }, targetDiscordId: "neverLoggedIn" });

    const neverLoggedIn = getAllSignups(db, bingo.id).find((r) => r.user.id === memberId)!;
    expect(neverLoggedIn.outgoingPairingRequest?.target.user).toBeNull();
    expect(neverLoggedIn.outgoingPairingRequest?.target.rsn).toBeNull();
    expect(neverLoggedIn.outgoingPairingRequest?.target.name).toBe("neverLoggedIn");
  });
});

describe("question visibility", () => {
  it("defaults to captains and rejects an unknown level", () => {
    const { bingo } = seedBingo();
    expect(createQuestion(db, { bingoId: bingo.id, prompt: "Q", type: "text" }).visibility).toBe("captains");
    expect(() => createQuestion(db, { bingoId: bingo.id, prompt: "Q", type: "text", visibility: "everyone" as never })).toThrow(ServiceError);
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Q2", type: "text", visibility: "mods" });
    expect(() => updateQuestion(db, q.id, { visibility: "nobody" as never })).toThrow(ServiceError);
    expect(updateQuestion(db, q.id, { visibility: "admins" }).visibility).toBe("admins");
  });

  it("limits which answers the roster carries to the viewer's level and up", () => {
    const { bingo, memberId } = seedBingo();
    const open = createQuestion(db, { bingoId: bingo.id, prompt: "Open", type: "text" });
    const mods = createQuestion(db, { bingoId: bingo.id, prompt: "Mods", type: "text", visibility: "mods" });
    const admins = createQuestion(db, { bingoId: bingo.id, prompt: "Admins", type: "text", visibility: "admins" });
    createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Me", answers: [open, mods, admins].map((q) => ({ questionId: q.id, value: q.prompt })) });
    const seen = (viewer: "captain" | "mod" | "admin") => getAllSignups(db, bingo.id, viewer)[0]!.answers.map((a) => a.value).sort();
    expect(seen("captain")).toEqual(["Open"]);
    expect(seen("mod")).toEqual(["Mods", "Open"]);
    expect(seen("admin")).toEqual(["Admins", "Mods", "Open"]);
    // The player always has their own.
    expect(getSignupForUser(db, bingo.id, memberId)!.answers).toHaveLength(3);
  });

  it("keeps an admins-only answer's values out of the signup.updated audit entry", () => {
    const { bingo, memberId } = seedBingo();
    const admins = createQuestion(db, { bingoId: bingo.id, prompt: "Secret", type: "text", visibility: "admins" });
    const open = createQuestion(db, { bingoId: bingo.id, prompt: "Open", type: "text" });
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Me", answers: [{ questionId: admins.id, value: "a" }, { questionId: open.id, value: "x" }] });
    updateSignup(db, bingo, signup.id, { answers: [{ questionId: admins.id, value: "b" }, { questionId: open.id, value: "y" }] });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.updated")).get()!;
    expect(JSON.parse(row.details)).toEqual({ changes: { before: { Secret: "(hidden)", Open: "x" }, after: { Secret: "(hidden)", Open: "y" } } });
  });
});

describe("deleting a question with answers", () => {
  it("deletes its answers with it (only its own), counts non-blank ones, and records how many went", () => {
    const { bingo, adminId, memberId } = seedBingo();
    const tz = createQuestion(db, { bingoId: bingo.id, prompt: "What time zone?", type: "text" });
    const other = createQuestion(db, { bingoId: bingo.id, prompt: "Other", type: "text" });
    createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "A", answers: [{ questionId: tz.id, value: "EST" }, { questionId: other.id, value: "x" }] });
    createSignup(db, bingo, { bingoId: bingo.id, userId: adminId, rsn: "B", answers: [{ questionId: tz.id, value: "" }] });
    expect(getAnswerCounts(db, bingo.id)).toEqual({ [tz.id]: 1, [other.id]: 1 });

    deleteQuestion(db, tz.id);

    expect(db.select().from(schema.signupQuestions).all().map((q) => q.id)).toEqual([other.id]);
    expect(db.select().from(schema.signupAnswers).all().map((a) => a.questionId)).toEqual([other.id]);
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "question.deleted")).get()!;
    expect(JSON.parse(row.details)).toMatchObject({ prompt: "What time zone?", answersDeleted: 1 });
  });
});

describe("timezone", () => {
  it("stores a valid zone on create, rejects an invalid one, and allows none (signups from before it was asked)", () => {
    const { bingo, memberId } = seedBingo();
    expect(() => createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Me", timezone: "EST-ish", answers: [] })).toThrow(ServiceError);
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Me", timezone: " America/New_York ", answers: [] });
    expect(signup.timezone).toBe("America/New_York");

    const [other] = db.insert(schema.users).values({ discordId: "other", discordUsername: "other" }).returning().all();
    expect(createSignup(db, bingo, { bingoId: bingo.id, userId: other.id, rsn: "Other", answers: [] }).timezone).toBeNull();
  });

  it("a player's update sets it and records the change on signup.updated", () => {
    const { bingo, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Me", answers: [] });
    expect(() => updateSignup(db, bingo, signup.id, { timezone: "nope" })).toThrow(ServiceError);

    expect(updateSignup(db, bingo, signup.id, { timezone: "Europe/London" }).timezone).toBe("Europe/London");
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.updated")).get()!;
    expect(JSON.parse(row.details)).toEqual({ changes: { before: { Timezone: "—" }, after: { Timezone: "Europe/London" } } });

    // Saving the same zone again is no change, so no second entry.
    updateSignup(db, bingo, signup.id, { timezone: "Europe/London" });
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.updated")).all()).toHaveLength(1);
  });

  it("a mod can set or clear it outside the signup stage, audited on the player's behalf", () => {
    const { bingo, adminId, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Me", answers: [] });
    const live = { ...bingo, stage: "live" as const };

    expect(setSignupTimezone(db, live, signup.id, "America/Chicago", adminId).timezone).toBe("America/Chicago");
    expect(setSignupTimezone(db, live, signup.id, null, adminId).timezone).toBeNull();
    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.timezone_set")).all();
    expect(rows.map((r) => JSON.parse(r.details))).toEqual([
      { before: null, after: "America/Chicago" },
      { before: "America/Chicago", after: null },
    ]);
    expect(rows[0]).toMatchObject({ actorUserId: adminId, onBehalfOfUserId: memberId });

    // Setting the same value again is a no-op, not another audit row.
    setSignupTimezone(db, live, signup.id, null, adminId);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.timezone_set")).all()).toHaveLength(2);
  });

  it("a mod can't set an invalid zone, touch another bingo's signup, or edit a finished bingo", () => {
    const { bingo, adminId, memberId } = seedBingo();
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Me", answers: [] });
    expect(() => setSignupTimezone(db, bingo, signup.id, "Mars/Olympus", adminId)).toThrow(ServiceError);
    expect(() => setSignupTimezone(db, { ...bingo, id: "some-other-bingo" }, signup.id, "Europe/London", adminId)).toThrow("Signup not found");
    expect(() => setSignupTimezone(db, { ...bingo, stage: "complete" }, signup.id, "Europe/London", adminId)).toThrow(ServiceError);
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

  it("updateSignup records the RSN and each changed answer, before and after, by the question's prompt", () => {
    const { bingo, memberId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Timezone", type: "text" });
    const kept = createQuestion(db, { bingoId: bingo.id, prompt: "Hours", type: "text" });
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Old", answers: [{ questionId: q.id, value: "UTC" }, { questionId: kept.id, value: "4" }] });

    updateSignup(db, bingo, signup.id, { rsn: "New", answers: [{ questionId: q.id, value: "UTC+1" }, { questionId: kept.id, value: "4" }] });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.updated")).get()!;
    expect(JSON.parse(row.details)).toEqual({ changes: { before: { RSN: "Old", Timezone: "UTC" }, after: { RSN: "New", Timezone: "UTC+1" } } });
  });

  it("updateSignup records nothing when the form is saved unchanged", () => {
    const { bingo, memberId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Timezone", type: "text" });
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Same", answers: [{ questionId: q.id, value: "UTC" }] });

    updateSignup(db, bingo, signup.id, { rsn: "Same", answers: [{ questionId: q.id, value: "UTC" }] });
    // A question left unanswered and then submitted blank isn't a change either.
    const later = createQuestion(db, { bingoId: bingo.id, prompt: "Notes", type: "text" });
    updateSignup(db, bingo, signup.id, { rsn: "Same", answers: [{ questionId: q.id, value: "UTC" }, { questionId: later.id, value: "" }] });

    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.updated")).all()).toHaveLength(0);
  });

  it("updateSignup shows multiple-choice answers as their choices, and a blank as a dash", () => {
    const { bingo, memberId } = seedBingo();
    const bosses = createQuestion(db, { bingoId: bingo.id, prompt: "Bosses", type: "multiselect", optionsJson: JSON.stringify(["Zulrah", "Vorkath", "Cerberus"]) });
    const signup = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "Me", answers: [] });

    updateSignup(db, bingo, signup.id, { rsn: "Me", answers: [{ questionId: bosses.id, value: JSON.stringify(["Zulrah", "Vorkath"]) }] });

    const details = JSON.parse(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.updated")).get()!.details);
    expect(details.changes).toEqual({ before: { Bosses: "—" }, after: { Bosses: "Zulrah, Vorkath" } });
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
  it("reactivates the withdrawn row with the new details, keeping the buy-in", () => {
    const { bingo, memberId, adminId } = seedBingo();
    const q = createQuestion(db, { bingoId: bingo.id, prompt: "Style?", type: "text" });
    const first = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "OldRsn", answers: [{ questionId: q.id, value: "Melee" }] });
    markBuyin(db, bingo, first.id, { received: true, collectedByUserId: adminId, recordedByUserId: adminId });
    withdrawSignup(db, bingo, first.id);

    const again = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "NewRsn", answers: [{ questionId: q.id, value: "Range" }] });
    expect(again).toMatchObject({ id: first.id, rsn: "NewRsn", status: "active" });
    expect(again.buyinReceivedAt).not.toBeNull();
    expect(again.buyinCollectedByUserId).toBe(adminId);
    expect(again.buyinRecordedByUserId).toBe(adminId);
    expect(getSignupForUser(db, bingo.id, memberId)!.answers.map((a) => a.value)).toEqual(["Range"]);
    expect(getAllSignups(db, bingo.id)).toHaveLength(1);
  });

  it("still lets a mod clear the buy-in after a re-signup, e.g. if the GP was refunded", () => {
    const { bingo, memberId, adminId } = seedBingo();
    const first = createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "OldRsn", answers: [] });
    markBuyin(db, bingo, first.id, { received: true, recordedByUserId: adminId });
    withdrawSignup(db, bingo, first.id);
    createSignup(db, bingo, { bingoId: bingo.id, userId: memberId, rsn: "NewRsn", answers: [] });

    const cleared = markBuyin(db, bingo, first.id, { received: false, recordedByUserId: adminId });
    expect(cleared.buyinReceivedAt).toBeNull();
  });
});
