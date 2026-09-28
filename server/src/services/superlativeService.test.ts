import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { ServiceError } from "./errors";
import * as superlativeService from "./superlativeService";
import { removeTeamMember } from "./teamService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

function seed(stage: "signup" | "live" | "complete" = "live") {
  const mkUser = (name: string) => db.insert(schema.users).values({ discordId: name, discordUsername: name }).returning().get();
  const captain = mkUser("captain");
  const alice = mkUser("alice");
  const bob = mkUser("bob");
  const outsider = mkUser("outsider");
  const bingo = db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: captain.id, stage }).returning().get();
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "team-a" }).returning().get();
  db.insert(schema.teamMembers)
    .values([
      { teamId: team.id, userId: captain.id, isCaptain: true },
      { teamId: team.id, userId: alice.id },
      { teamId: team.id, userId: bob.id },
    ])
    .run();
  const otherTeam = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: outsider.id, name: "Team B", codeword: "team-b" }).returning().get();
  db.insert(schema.teamMembers).values([{ teamId: otherTeam.id, userId: outsider.id, isCaptain: true }]).run();
  return { bingo, team, otherTeam, captain, alice, bob, outsider };
}

describe("categories", () => {
  it("creates, renames, reorders and deletes categories at any stage", () => {
    const { bingo } = seed("signup");
    const mvp = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    const spirit = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team Spirit" });
    expect(superlativeService.getCategories(db, bingo.id).map((c) => c.name)).toEqual(["Team MVP", "Team Spirit"]);

    superlativeService.reorderCategories(db, bingo.id, [spirit.id, mvp.id]);
    expect(superlativeService.getCategories(db, bingo.id).map((c) => c.id)).toEqual([spirit.id, mvp.id]);

    const renamed = superlativeService.renameCategory(db, mvp.id, "The MVP");
    expect(renamed.name).toBe("The MVP");

    superlativeService.deleteCategory(db, spirit.id);
    expect(superlativeService.getCategories(db, bingo.id).map((c) => c.id)).toEqual([mvp.id]);
  });

  it("keeps a category's votes on rename, and drops them on delete", () => {
    const { bingo, team, alice, bob } = seed("live");
    const cat = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    superlativeService.setVote(db, bingo, { categoryId: cat.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });

    superlativeService.renameCategory(db, cat.id, "MVP");
    expect(superlativeService.computeWinners(db, bingo.id, team.id)).toEqual([{ categoryId: cat.id, categoryName: "MVP", winnerUserIds: [bob.id] }]);

    superlativeService.deleteCategory(db, cat.id);
    expect(superlativeService.computeWinners(db, bingo.id, team.id)).toEqual([]);
  });

  it("refuses a 4th category, since each Team's share card fits 3", () => {
    const { bingo } = seed("signup");
    for (const name of ["One", "Two", "Three"]) superlativeService.createCategory(db, { bingoId: bingo.id, name });
    expect(() => superlativeService.createCategory(db, { bingoId: bingo.id, name: "Four" })).toThrow(/at most 3 superlative categories/);
    expect(superlativeService.getCategories(db, bingo.id)).toHaveLength(3);
  });

  it("lets a Bingo that already has more than 3 keep, rename and delete them, but not add another", () => {
    const { bingo } = seed("signup");
    db.insert(schema.superlativeCategories)
      .values(["One", "Two", "Three", "Four"].map((name, sortOrder) => ({ bingoId: bingo.id, name, sortOrder })))
      .run();
    const [first] = superlativeService.getCategories(db, bingo.id);
    expect(superlativeService.renameCategory(db, first!.id, "First").name).toBe("First");
    expect(() => superlativeService.createCategory(db, { bingoId: bingo.id, name: "Five" })).toThrow(ServiceError);

    superlativeService.deleteCategory(db, first!.id);
    expect(() => superlativeService.createCategory(db, { bingoId: bingo.id, name: "Five" })).toThrow(ServiceError);
    superlativeService.deleteCategory(db, superlativeService.getCategories(db, bingo.id)[0]!.id);
    expect(superlativeService.createCategory(db, { bingoId: bingo.id, name: "Five" }).name).toBe("Five");
  });

  it("rejects a blank name", () => {
    const { bingo } = seed("signup");
    expect(() => superlativeService.createCategory(db, { bingoId: bingo.id, name: "  " })).toThrow(ServiceError);
  });
});

describe("voting", () => {
  it("lets a teammate cast, change and clear a pick during Live", () => {
    const { bingo, team, alice, bob } = seed("live");
    const cat = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });

    superlativeService.setVote(db, bingo, { categoryId: cat.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });
    let ballot = superlativeService.getBallot(db, bingo, team.id, alice.id);
    expect(ballot.categories[0]?.myPick).toBe(bob.id);
    expect(ballot.categories[0]?.votedCount).toBe(1);

    superlativeService.setVote(db, bingo, { categoryId: cat.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: team.captainUserId });
    ballot = superlativeService.getBallot(db, bingo, team.id, alice.id);
    expect(ballot.categories[0]?.myPick).toBe(team.captainUserId);
    expect(ballot.categories[0]?.votedCount).toBe(1);

    superlativeService.clearVote(db, bingo, { categoryId: cat.id, voterUserId: alice.id });
    ballot = superlativeService.getBallot(db, bingo, team.id, alice.id);
    expect(ballot.categories[0]?.myPick).toBeNull();
    expect(ballot.categories[0]?.votedCount).toBe(0);
  });

  it("never lists the voter themselves among the teammates", () => {
    const { bingo, team, alice } = seed("live");
    const ballot = superlativeService.getBallot(db, bingo, team.id, alice.id);
    expect(ballot.teammates.map((t) => t.id)).not.toContain(alice.id);
  });

  it("rejects a self-vote", () => {
    const { bingo, team, alice } = seed("live");
    const cat = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    expect(() => superlativeService.setVote(db, bingo, { categoryId: cat.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: alice.id })).toThrow(/yourself/);
  });

  it("rejects a vote for someone outside the Team", () => {
    const { bingo, team, alice, outsider } = seed("live");
    const cat = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    expect(() => superlativeService.setVote(db, bingo, { categoryId: cat.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: outsider.id })).toThrow(ServiceError);
  });

  it("rejects voting outside Live", () => {
    const { bingo, team, alice, bob } = seed("signup");
    const cat = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    expect(() => superlativeService.setVote(db, bingo, { categoryId: cat.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id })).toThrow(/live/);
  });
});

describe("removing a member", () => {
  it("drops their votes and every vote cast for them", () => {
    const { bingo, team, alice, bob } = seed("live");
    const cat = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    superlativeService.setVote(db, bingo, { categoryId: cat.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });
    superlativeService.setVote(db, bingo, { categoryId: cat.id, teamId: team.id, voterUserId: bob.id, nomineeUserId: team.captainUserId });

    removeTeamMember(db, team.id, bob.id);

    const votes = db.select().from(schema.superlativeVotes).where(eq(schema.superlativeVotes.categoryId, cat.id)).all();
    expect(votes).toEqual([]);
  });
});

describe("winners", () => {
  it("shares a tie, and leaves out a category with no votes", () => {
    const { bingo, team, alice, bob } = seed("live");
    const mvp = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    superlativeService.createCategory(db, { bingoId: bingo.id, name: "No votes" });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: team.captainUserId, nomineeUserId: bob.id });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: bob.id, nomineeUserId: alice.id });

    // bob: 2 votes, alice: 1 vote -> bob alone wins (no tie yet); tie it by adding one more for alice isn't possible
    // without a fourth voter, so instead assert the single-winner case and a genuine tie separately below.
    expect(superlativeService.computeWinners(db, bingo.id, team.id)).toEqual([{ categoryId: mvp.id, categoryName: "Team MVP", winnerUserIds: [bob.id] }]);
  });

  it("shares a genuine tie between nominees", () => {
    const { bingo, team, alice, bob } = seed("live");
    const mvp = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: bob.id, nomineeUserId: alice.id });

    const [winners] = superlativeService.computeWinners(db, bingo.id, team.id);
    expect(new Set(winners?.winnerUserIds)).toEqual(new Set([alice.id, bob.id]));
  });
});

describe("tallies", () => {
  it("refuses before the bingo is finished", () => {
    const { bingo } = seed("live");
    expect(() => superlativeService.getTallies(db, bingo)).toThrow(ServiceError);
  });

  it("counts votes per nominee per category per team once finished", () => {
    const { bingo, team, alice, bob } = seed("live");
    const mvp = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: team.captainUserId, nomineeUserId: bob.id });

    const finished = { ...bingo, stage: "complete" as const };
    const [teamTally] = superlativeService.getTallies(db, finished).filter((t) => t.teamId === team.id);
    expect(teamTally?.tallies).toEqual([{ categoryId: mvp.id, categoryName: "Team MVP", counts: [{ user: expect.objectContaining({ id: bob.id }), votes: 2 }] }]);
  });
});

describe("turnout", () => {
  it("counts who has voted per Team and per category while Live, never who", () => {
    const { bingo, team, otherTeam, captain, alice, bob } = seed("live");
    const mvp = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    const spirit = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team Spirit" });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });
    superlativeService.setVote(db, bingo, { categoryId: spirit.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: captain.id, nomineeUserId: alice.id });

    const turnout = superlativeService.getTurnout(db, bingo);
    expect(turnout.find((t) => t.teamId === team.id)).toEqual({
      teamId: team.id,
      teamName: "Team A",
      color: null,
      players: 3,
      votedAny: 2,
      votedAll: 1,
      categories: [
        { categoryId: mvp.id, categoryName: "Team MVP", voted: 2 },
        { categoryId: spirit.id, categoryName: "Team Spirit", voted: 1 },
      ],
    });
    expect(turnout.find((t) => t.teamId === otherTeam.id)).toMatchObject({ players: 1, votedAny: 0, votedAll: 0 });
  });

  it("stops counting a Player once they're removed from the Team", () => {
    const { bingo, team, alice, bob } = seed("live");
    const mvp = superlativeService.createCategory(db, { bingoId: bingo.id, name: "Team MVP" });
    superlativeService.setVote(db, bingo, { categoryId: mvp.id, teamId: team.id, voterUserId: alice.id, nomineeUserId: bob.id });
    removeTeamMember(db, team.id, alice.id);
    expect(superlativeService.getTurnout(db, bingo).find((t) => t.teamId === team.id)).toMatchObject({ players: 2, votedAny: 0 });
  });
});
