import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { addTeamMember, createTeam, removeTeamMember } from "./teamService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingoAndUsers() {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const [captain] = db.insert(schema.users).values({ discordId: "captain", discordUsername: "captain" }).returning().all();
  const [captain2] = db.insert(schema.users).values({ discordId: "captain2", discordUsername: "captain2" }).returning().all();
  const [member] = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().all();
  const bingo = db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id }).returning().get();
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
