import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { addTeamMember, createTeam, getCaptainCandidates, removeTeamMember } from "./teamService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingoAndUsers() {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const [captain] = db.insert(schema.users).values({ discordId: "captain", discordUsername: "captain" }).returning().all();
  const [captain2] = db.insert(schema.users).values({ discordId: "captain2", discordUsername: "captain2" }).returning().all();
  const [member] = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().all();
  const bingo = db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id }).returning().get();
  // A captain must have an active signup — sign up everyone who might captain in these tests.
  for (const u of [captain, captain2, member]) {
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: u.id, rsn: u.discordUsername }).run();
  }
  return { bingo, captain, captain2, member };
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("createTeam", () => {
  it("creates the team and adds the captain as a member", () => {
    const { bingo, captain } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id, name: "Alpha" });
    expect(team.captainUserId).toBe(captain.id);
    expect(team.codeword).toMatch(/^[a-z]+-[a-z]+$/);

    const members = db.select().from(schema.teamMembers).all();
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ teamId: team.id, userId: captain.id, isCaptain: true });
  });

  it("rejects a captain already captaining another team in this bingo", () => {
    const { bingo, captain } = seedBingoAndUsers();
    createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    expect(() => createTeam(db, { bingoId: bingo.id, captainUserId: captain.id })).toThrow(ServiceError);
  });

  it("assigns distinct codewords across two teams", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    const teamA = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    const teamB = createTeam(db, { bingoId: bingo.id, captainUserId: member.id });
    expect(teamA.codeword).not.toBe(teamB.codeword);
  });

  it("rejects a captain with no signup for this bingo", () => {
    const { bingo } = seedBingoAndUsers();
    const [outsider] = db.insert(schema.users).values({ discordId: "outsider", discordUsername: "outsider" }).returning().all();
    expect(() => createTeam(db, { bingoId: bingo.id, captainUserId: outsider.id })).toThrow(/active signup/);
  });

  it("rejects a captain whose signup was withdrawn", () => {
    const { bingo, captain } = seedBingoAndUsers();
    db.update(schema.signups).set({ status: "withdrawn" }).where(eq(schema.signups.bingoId, bingo.id)).run();
    expect(() => createTeam(db, { bingoId: bingo.id, captainUserId: captain.id })).toThrow(/active signup/);
  });
});

describe("getCaptainCandidates", () => {
  it("returns active signups not already on a team", () => {
    const { bingo, captain, captain2, member } = seedBingoAndUsers();
    createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });

    const candidates = getCaptainCandidates(db, bingo.id);
    expect(candidates.map((c) => c.user.id).sort()).toEqual([captain2.id, member.id].sort());
  });

  it("excludes withdrawn signups", () => {
    const { bingo, captain, captain2, member } = seedBingoAndUsers();
    db.update(schema.signups).set({ status: "withdrawn" }).where(and(eq(schema.signups.bingoId, bingo.id), eq(schema.signups.userId, member.id))).run();

    const candidates = getCaptainCandidates(db, bingo.id);
    expect(candidates.map((c) => c.user.id).sort()).toEqual([captain.id, captain2.id].sort());
  });
});

describe("addTeamMember / removeTeamMember", () => {
  it("rejects adding a user who is already on a team in this bingo", () => {
    const { bingo, captain, captain2, member } = seedBingoAndUsers();
    const teamA = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    addTeamMember(db, teamA.id, member.id);

    const teamB = createTeam(db, { bingoId: bingo.id, captainUserId: captain2.id });
    expect(() => addTeamMember(db, teamB.id, member.id)).toThrow(ServiceError);
  });

  it("refuses to remove the captain from their own team", () => {
    const { bingo, captain } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    expect(() => removeTeamMember(db, team.id, captain.id)).toThrow(/captain/);
  });
});
