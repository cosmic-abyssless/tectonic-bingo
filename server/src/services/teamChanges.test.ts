// Team changes after signups close (CONTEXT.md "Team", "Signup"): Late signup, Remove from Team, the Draft's
// withdrawal rule, Add member's limits, and a Finished Bingo's lock.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import type { Stage } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { addTeamMember, getCaptainCandidates, getTeamsWithMembers, removeTeamMember, removedFromTeamName, teamsNotLedByPairs } from "./teamService";
import { createLateSignup, withdrawSignup } from "./signupService";
import { getAcceptedPairs } from "./pairingService";
import { getDraftState } from "./draftService";
import { currentCutReviewFingerprint } from "./cutReviewService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

type Person = "admin" | "captainA" | "coA" | "memberA" | "captainB" | "memberB" | "pooled" | "late" | "outsider";

/** Two Teams: A (Captain, co-captain, a drafted member) and B (Captain, a drafted member), plus an undrafted signup. */
function seed(stage: Stage = "live", signupMode: "solo" | "duo" = "solo", tag = "") {
  const people = {} as Record<Person, typeof schema.users.$inferSelect>;
  for (const p of ["admin", "captainA", "coA", "memberA", "captainB", "memberB", "pooled", "late", "outsider"] as const) {
    people[p] = db.insert(schema.users).values({ discordId: `${p}${tag}`, discordUsername: `${p}${tag}`, inGuild: true }).returning().get();
  }
  const bingo = db
    .insert(schema.bingos)
    .values({ slug: `b${tag}`, name: "B", boardRows: 3, boardCols: 3, createdByUserId: people.admin.id, stage, signupMode, cutMode: "even" })
    .returning()
    .get();
  for (const p of ["captainA", "coA", "memberA", "captainB", "memberB", "pooled"] as const) {
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: people[p].id, rsn: `${p}Rsn` }).run();
  }
  const teamA = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.captainA.id, name: "Team A", codeword: "a" }).returning().get();
  const teamB = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.captainB.id, name: "Team B", codeword: "b" }).returning().get();
  db.insert(schema.teamMembers)
    .values([
      { teamId: teamA.id, userId: people.captainA.id, isCaptain: true },
      { teamId: teamA.id, userId: people.coA.id, isCoCaptain: true },
      { teamId: teamA.id, userId: people.memberA.id },
      { teamId: teamB.id, userId: people.captainB.id, isCaptain: true },
      { teamId: teamB.id, userId: people.memberB.id },
    ])
    .run();
  db.insert(schema.draftPicks)
    .values([
      { bingoId: bingo.id, pickNumber: 1, teamId: teamA.id, userId: people.memberA.id, pickedByUserId: people.captainA.id },
      { bingoId: bingo.id, pickNumber: 2, teamId: teamB.id, userId: people.memberB.id, pickedByUserId: people.captainB.id },
    ])
    .run();
  return { bingo, people, teamA, teamB };
}

const setStage = (bingoId: string, stage: Stage) => {
  db.update(schema.bingos).set({ stage }).where(eq(schema.bingos.id, bingoId)).run();
  return db.select().from(schema.bingos).where(eq(schema.bingos.id, bingoId)).get()!;
};
const signupOf = (bingoId: string, userId: string) =>
  db.select().from(schema.signups).where(and(eq(schema.signups.bingoId, bingoId), eq(schema.signups.userId, userId))).get();
const memberIds = (teamId: string) => db.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId)).all().map((m) => m.userId).sort();
const auditOf = (action: string) => db.select().from(schema.auditLog).where(eq(schema.auditLog.action, action)).all();

describe("a Finished bingo", () => {
  it("refuses Late signup, Remove from Team, Add member and withdrawal, until it's moved back to Live", () => {
    const { bingo, people, teamA } = seed("complete");
    const pooled = signupOf(bingo.id, people.pooled.id)!;
    expect(() => createLateSignup(db, bingo, { userId: people.late.id, rsn: "Late", teamId: teamA.id })).toThrow(/finished/);
    expect(() => removeTeamMember(db, teamA.id, people.memberA.id)).toThrow(/finished/);
    expect(() => addTeamMember(db, teamA.id, people.pooled.id)).toThrow(/finished/);
    expect(() => withdrawSignup(db, bingo, pooled.id, { byMod: true })).toThrow(/finished/);

    const live = setStage(bingo.id, "live");
    createLateSignup(db, live, { userId: people.late.id, rsn: "Late", teamId: teamA.id });
    removeTeamMember(db, teamA.id, people.memberA.id);
    addTeamMember(db, teamA.id, people.pooled.id);
    expect(memberIds(teamA.id)).toEqual([people.captainA.id, people.coA.id, people.late.id, people.pooled.id].sort());
  });
});

describe("Late signup", () => {
  it("while Signups are closed goes into the draft pool, and a Cut review applied earlier no longer counts", () => {
    const { bingo: seeded, people, teamA } = seed("captains");
    // Undrafted, with no Teams set yet: clear the draft for this case.
    db.delete(schema.draftPicks).run();
    const bingo = setStage(seeded.id, "captains");
    const before = currentCutReviewFingerprint(db, bingo);
    const signup = createLateSignup(db, bingo, { userId: people.late.id, rsn: " LateRsn " });
    expect(signup).toMatchObject({ rsn: "LateRsn", status: "active", buyinReceivedAt: null });
    expect(getDraftState(db, bingo, { includeAnswers: false }).pool.flatMap((u) => u.entries.map((e) => e.user.id))).toContain(people.late.id);
    expect(currentCutReviewFingerprint(db, bingo)).not.toBe(before);
    expect(() => createLateSignup(db, bingo, { userId: people.outsider.id, rsn: "Out", teamId: teamA.id })).toThrow(/draft pool/);
  });

  it.each(["draft", "reveal", "live"] as const)("at %s puts them on the chosen Team, named by RSN, with no pick and the Shares unchanged", (stage) => {
    const { bingo, people, teamA } = seed(stage);
    const before = getDraftState(db, bingo, { includeAnswers: false });
    createLateSignup(db, bingo, { userId: people.late.id, rsn: "LateRsn", teamId: teamA.id });

    const member = getTeamsWithMembers(db, bingo.id).find((t) => t.id === teamA.id)!.members.find((m) => m.user.id === people.late.id)!;
    expect(member).toMatchObject({ isDrafted: false, isCaptain: false });
    expect(member.user.rsn).toBe("LateRsn");
    expect(db.select().from(schema.draftPicks).where(eq(schema.draftPicks.userId, people.late.id)).all()).toEqual([]);
    const after = getDraftState(db, bingo, { includeAnswers: false });
    expect(after.shares).toEqual(before.shares);
    expect(after.pool.map((u) => [u.entries.map((e) => e.user.id), u.cut])).toEqual(before.pool.map((u) => [u.entries.map((e) => e.user.id), u.cut]));
    // Recorded as the signup and member actions, on the player's behalf.
    expect(auditOf("signup.created")[0]).toMatchObject({ onBehalfOfUserId: people.late.id });
    expect(JSON.parse(auditOf("signup.created")[0]!.details)).toMatchObject({ late: true, reactivated: false });
    expect(auditOf("team.member_added")[0]).toMatchObject({ onBehalfOfUserId: people.late.id, teamId: teamA.id });
  });

  it("needs a Team from the Draft on, and one from this bingo", () => {
    const { bingo, people } = seed("live");
    const other = seed("live", "solo", "2");
    expect(() => createLateSignup(db, bingo, { userId: people.late.id, rsn: "Late" })).toThrow(/Team/);
    expect(() => createLateSignup(db, bingo, { userId: people.late.id, rsn: "Late", teamId: other.teamA.id })).toThrow(/Team not found/);
  });

  it("isn't open while signups are open", () => {
    const { bingo, people } = seed("signup");
    expect(() => createLateSignup(db, bingo, { userId: people.late.id, rsn: "Late" })).toThrow(/signups have closed/);
  });

  it("reactivates a Withdrawn Signup with its answers, and points an active one to Add member", () => {
    const { bingo, people, teamA } = seed("live");
    const question = db.insert(schema.signupQuestions).values({ bingoId: bingo.id, prompt: "Role?", type: "text" }).returning().get();
    const old = db.insert(schema.signups).values({ bingoId: bingo.id, userId: people.late.id, rsn: "OldRsn", status: "withdrawn" }).returning().get();
    db.insert(schema.signupAnswers).values({ signupId: old.id, questionId: question.id, value: "Tank" }).run();

    const signup = createLateSignup(db, bingo, { userId: people.late.id, rsn: "NewRsn", teamId: teamA.id });
    expect(signup).toMatchObject({ id: old.id, rsn: "NewRsn", status: "active" });
    expect(db.select().from(schema.signups).where(eq(schema.signups.userId, people.late.id)).all()).toHaveLength(1);
    expect(db.select().from(schema.signupAnswers).where(eq(schema.signupAnswers.signupId, old.id)).get()?.value).toBe("Tank");

    expect(() => createLateSignup(db, bingo, { userId: people.pooled.id, rsn: "Pooled", teamId: teamA.id })).toThrow(/Add member/);
  });

  it("joins a duo bingo as a single", () => {
    const { bingo, people, teamA } = seed("live", "duo");
    createLateSignup(db, bingo, { userId: people.late.id, rsn: "Late", teamId: teamA.id });
    expect(getAcceptedPairs(db, bingo.id).some((p) => p.userIds.includes(people.late.id))).toBe(false);
  });
});

describe("Remove from Team", () => {
  it("takes a drafted Player off the Team and withdraws their Signup, keeping their Submissions with the Team", () => {
    const { bingo, people, teamA } = seed("live");
    const submission = db.insert(schema.submissions).values({ teamId: teamA.id, submittedByUserId: people.memberA.id, status: "approved" }).returning().get();

    removeTeamMember(db, teamA.id, people.memberA.id, { reason: "  Had to leave  " });

    expect(memberIds(teamA.id)).not.toContain(people.memberA.id);
    expect(signupOf(bingo.id, people.memberA.id)?.status).toBe("withdrawn");
    expect(db.select().from(schema.submissions).where(eq(schema.submissions.id, submission.id)).get()).toMatchObject({ teamId: teamA.id, submittedByUserId: people.memberA.id, status: "approved" });
    // The pick stays too: it's the Team's draft record.
    expect(db.select().from(schema.draftPicks).where(eq(schema.draftPicks.userId, people.memberA.id)).get()).toBeTruthy();
    expect(JSON.parse(auditOf("team.member_removed")[0]!.details)).toMatchObject({ removedFromTeam: true, reason: "Had to leave" });
    expect(auditOf("signup.withdrawn")[0]).toMatchObject({ onBehalfOfUserId: people.memberA.id });
    expect(removedFromTeamName(db, bingo.id, people.memberA.id)).toBe("Team A");
  });

  it("needs a replacement for the Captain, who takes the role; naming the co-captain leaves co-captain empty", () => {
    const { bingo, people, teamA } = seed("reveal");
    expect(() => removeTeamMember(db, teamA.id, people.captainA.id)).toThrow(/take over as Captain/);
    expect(() => removeTeamMember(db, teamA.id, people.captainA.id, { replacementUserId: people.memberB.id })).toThrow(/member of the team/);

    removeTeamMember(db, teamA.id, people.captainA.id, { replacementUserId: people.coA.id });
    const team = getTeamsWithMembers(db, bingo.id).find((t) => t.id === teamA.id)!;
    expect(team.captainUserId).toBe(people.coA.id);
    expect(team.members.map((m) => [m.user.id, m.isCaptain, m.isCoCaptain])).toEqual([
      [people.coA.id, true, false],
      [people.memberA.id, false, false],
    ]);
    expect(signupOf(bingo.id, people.captainA.id)?.status).toBe("withdrawn");
    expect(JSON.parse(auditOf("team.member_removed")[0]!.details)).toMatchObject({ newCaptainName: "coARsn" });
  });

  it("hands a co-captain's role to another member, not the Captain", () => {
    const { bingo, people, teamA } = seed("live");
    expect(() => removeTeamMember(db, teamA.id, people.coA.id)).toThrow(/co-captain/);
    expect(() => removeTeamMember(db, teamA.id, people.coA.id, { replacementUserId: people.captainA.id })).toThrow(/already the Captain/);
    removeTeamMember(db, teamA.id, people.coA.id, { replacementUserId: people.memberA.id });
    const team = getTeamsWithMembers(db, bingo.id).find((t) => t.id === teamA.id)!;
    expect(team.members.map((m) => [m.user.id, m.isCaptain, m.isCoCaptain])).toEqual([
      [people.captainA.id, true, false],
      [people.memberA.id, false, true],
    ]);
  });

  it("leaves one half of a duo's partner on the Team, with the pairing dissolved", () => {
    const { bingo, people, teamA } = seed("live", "duo");
    const pairing = db
      .insert(schema.signupPairings)
      .values({ bingoId: bingo.id, requesterUserId: people.coA.id, targetDiscordId: people.memberA.discordId, status: "accepted", createdByUserId: people.coA.id })
      .returning()
      .get();
    expect(teamsNotLedByPairs(db, bingo.id)).toEqual([]);

    removeTeamMember(db, teamA.id, people.memberA.id);

    expect(memberIds(teamA.id)).toContain(people.coA.id);
    expect(db.select().from(schema.signupPairings).where(eq(schema.signupPairings.id, pairing.id)).get()?.status).toBe("dissolved");
    expect(signupOf(bingo.id, people.coA.id)?.status).toBe("active");
  });

  it("refuses a Team from another bingo", () => {
    const { bingo } = seed("live");
    const other = seed("live", "solo", "2");
    expect(() => removeTeamMember(db, other.teamA.id, other.people.memberA.id, { bingoId: bingo.id })).toThrow(/Team not found/);
    expect(memberIds(other.teamA.id)).toContain(other.people.memberA.id);
  });
});

describe("during the Draft", () => {
  it("an undrafted Signup can be withdrawn, a drafted Player can't be removed", () => {
    const { bingo, people, teamA } = seed("draft");
    expect(withdrawSignup(db, bingo, signupOf(bingo.id, people.pooled.id)!.id, { byMod: true }).status).toBe("withdrawn");
    expect(() => withdrawSignup(db, bingo, signupOf(bingo.id, people.memberA.id)!.id, { byMod: true })).toThrow(/until the Draft ends/);
    expect(() => removeTeamMember(db, teamA.id, people.memberA.id)).toThrow(/until the Draft ends/);
    expect(signupOf(bingo.id, people.memberA.id)?.status).toBe("active");
  });
});

describe("Add member", () => {
  it("offers and accepts only active, Team-less Signups of this bingo, and refuses another bingo's Team", () => {
    const { bingo, people, teamA } = seed("live");
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: people.late.id, rsn: "Gone", status: "withdrawn" }).run();
    expect(getCaptainCandidates(db, bingo.id).map((c) => c.user.id)).toEqual([people.pooled.id]);

    expect(() => addTeamMember(db, teamA.id, people.outsider.id, bingo.id)).toThrow(/late signup/);
    expect(() => addTeamMember(db, teamA.id, people.late.id, bingo.id)).toThrow(/late signup/);
    expect(() => addTeamMember(db, teamA.id, people.memberB.id, bingo.id)).toThrow(/already on a team/);
    const other = seed("live", "solo", "2");
    expect(() => addTeamMember(db, other.teamA.id, people.pooled.id, bingo.id)).toThrow(/Team not found/);

    addTeamMember(db, teamA.id, people.pooled.id, bingo.id);
    expect(memberIds(teamA.id)).toContain(people.pooled.id);
  });
});
