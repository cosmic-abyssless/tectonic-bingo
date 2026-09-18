import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { addTeamMember, createPointAdjustment, createTeam, deleteTeam, getCaptainCandidates, getTeamProgress, getTeamsWithMembers, isTeamLead, removeTeamMember, setTileInterest, updateTeam } from "./teamService";
import { createTask, createTile } from "./boardService";
import { adminPair } from "./pairingService";
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

  it("assigns each new team a distinct palette colour", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    const teamA = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    const teamB = createTeam(db, { bingoId: bingo.id, captainUserId: member.id });
    expect(teamA.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(teamB.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(teamA.color).not.toBe(teamB.color);
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

describe("updateTeam", () => {
  it("trims and saves a new codeword", () => {
    const { bingo, captain } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    expect(updateTeam(db, team.id, { codeword: "  open sesame " }).codeword).toBe("open sesame");
  });

  it("rejects an empty codeword or name", () => {
    const { bingo, captain } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    expect(() => updateTeam(db, team.id, { codeword: "   " })).toThrow(/codeword/);
    expect(() => updateTeam(db, team.id, { name: "" })).toThrow(/name/);
  });

  it("rejects a codeword already used by another team in the same bingo", () => {
    const { bingo, captain, captain2 } = seedBingoAndUsers();
    const teamA = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    const teamB = createTeam(db, { bingoId: bingo.id, captainUserId: captain2.id });
    expect(() => updateTeam(db, teamB.id, { codeword: teamA.codeword })).toThrow(/already uses/);
  });
});

describe("getTeamsWithMembers", () => {
  it("attaches each team roster with the captain flagged and listed first", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    // Re-insert the captain's row after the member's so the sort, not insertion order, puts the captain on top.
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    addTeamMember(db, team.id, member.id);
    db.delete(schema.teamMembers).where(eq(schema.teamMembers.userId, captain.id)).run();
    db.insert(schema.teamMembers).values({ teamId: team.id, userId: captain.id, isCaptain: true }).run();

    const [withMembers] = getTeamsWithMembers(db, bingo.id);
    expect(withMembers.id).toBe(team.id);
    expect(withMembers.members.map((m) => [m.user.id, m.isCaptain])).toEqual([
      [captain.id, true],
      [member.id, false],
    ]);
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

  it("refuses to remove a drafted player", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    addTeamMember(db, team.id, member.id);
    db.insert(schema.draftPicks).values({ bingoId: bingo.id, pickNumber: 1, teamId: team.id, userId: member.id, pickedByUserId: captain.id }).run();

    expect(() => removeTeamMember(db, team.id, member.id)).toThrow(/drafted/);
    expect(getTeamsWithMembers(db, bingo.id)[0]!.members).toHaveLength(2);
  });
});

describe("deleteTeam", () => {
  it("removes the team and its members", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    addTeamMember(db, team.id, member.id);

    deleteTeam(db, team.id);

    expect(getTeamsWithMembers(db, bingo.id)).toEqual([]);
    expect(db.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, team.id)).all()).toEqual([]);
  });

  it("refuses once the team has game history", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    db.insert(schema.draftPicks).values({ bingoId: bingo.id, pickNumber: 1, teamId: team.id, userId: member.id, pickedByUserId: captain.id }).run();

    expect(() => deleteTeam(db, team.id)).toThrow(ServiceError);
    expect(getTeamsWithMembers(db, bingo.id)).toHaveLength(1);
  });
});

describe("audit trail", () => {
  it("createTeam records team.created with the visibility scoped to the team", () => {
    const { bingo, captain } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id, name: "Alpha" });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "team.created")).get()!;
    expect(row.teamId).toBe(team.id);
    expect(row.visibility).toBe("team");
    expect(JSON.parse(row.details)).toMatchObject({ name: "Alpha", captainName: "captain" });
  });

  it("updateTeam records a rename with before/after names and never the codeword value", () => {
    const { bingo, captain } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id, name: "Old Name" });
    updateTeam(db, team.id, { name: "New Name", codeword: "brand-new-word" });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "team.updated")).get()!;
    const details = JSON.parse(row.details);
    expect(details.changes.before.name).toBe("Old Name");
    expect(details.changes.after.name).toBe("New Name");
    expect(details.codeword).toEqual({ changed: true });
    expect(JSON.stringify(details)).not.toContain("brand-new-word");
  });

  it("updateTeam no-ops (no audit row) for an empty patch", () => {
    const { bingo, captain } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    updateTeam(db, team.id, {});
    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "team.updated")).all();
    expect(rows).toHaveLength(0);
  });

  it("addTeamMember / removeTeamMember record their actions", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    addTeamMember(db, team.id, member.id);
    removeTeamMember(db, team.id, member.id);
    const added = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "team.member_added")).get()!;
    const removed = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "team.member_removed")).get()!;
    expect(JSON.parse(added.details)).toMatchObject({ userId: member.id, displayName: "member" });
    expect(JSON.parse(removed.details)).toMatchObject({ userId: member.id, displayName: "member" });
  });

  it("deleteTeam records team.deleted with the member count captured before the delete", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    addTeamMember(db, team.id, member.id);
    deleteTeam(db, team.id);
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "team.deleted")).get()!;
    expect(JSON.parse(row.details)).toMatchObject({ memberCount: 2, captainName: "captain" });
  });

  it("createPointAdjustment records points.adjusted scoped to the team", () => {
    const { bingo, captain } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    createPointAdjustment(db, { teamId: team.id, bingoId: bingo.id, amount: 15, reason: "bonus", createdByUserId: captain.id });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "points.adjusted")).get()!;
    expect(row.teamId).toBe(team.id);
    expect(JSON.parse(row.details)).toEqual({ amount: 15, reason: "bonus" });
  });
});

describe("createTeam with a co-captain", () => {
  it("adds the co-captain as a lead who can't be removed", () => {
    const { bingo, captain, member } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id, coCaptainUserId: member.id });
    expect(isTeamLead(db, team.id, member.id)).toBe(true);
    expect(isTeamLead(db, team.id, captain.id)).toBe(true);
    const [withMembers] = getTeamsWithMembers(db, bingo.id);
    expect(withMembers!.members.map((m) => [m.user.id, m.isCaptain, m.isCoCaptain])).toEqual([
      [captain.id, true, false],
      [member.id, false, true],
    ]);
    expect(() => removeTeamMember(db, team.id, member.id)).toThrow(/co-captain/);
  });

  it("keeps duo pairs together", () => {
    const { bingo, captain, captain2, member } = seedBingoAndUsers();
    const duo = { ...bingo, stage: "signup" as const, signupMode: "duo" as const };
    adminPair(db, duo, { userIdA: captain.id, userIdB: member.id, createdByUserId: captain.id });
    expect(() => createTeam(db, { bingoId: bingo.id, captainUserId: captain.id })).toThrow(/pick them as the co-captain/);
    expect(() => createTeam(db, { bingoId: bingo.id, captainUserId: captain2.id, coCaptainUserId: member.id })).toThrow(/paired with someone else/);
    expect(() => createTeam(db, { bingoId: bingo.id, captainUserId: captain.id, coCaptainUserId: member.id })).not.toThrow();
  });
});

describe("tile interests", () => {
  function seedTeamAndTile() {
    const { bingo, captain, member } = seedBingoAndUsers();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: captain.id });
    addTeamMember(db, team.id, member.id);
    const tile = createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 0 });
    const taskA = createTask(db, tile.id, { kind: "ITEM", label: "Tanzanite fang", points: 10, itemName: "Tanzanite fang" }, 0);
    const taskB = createTask(db, tile.id, { kind: "ITEM", label: "Magic fang", points: 10, itemName: "Magic fang" }, 1);
    return { bingo, team, tile, taskA, taskB, captain, member };
  }

  it("raises and lowers a hand on a part, shown in the team's progress with who raised it", () => {
    const { team, tile, taskA, taskB, captain, member } = seedTeamAndTile();
    setTileInterest(db, team.id, captain.id, tile.id, taskA.id, true);
    setTileInterest(db, team.id, member.id, tile.id, taskB.id, true);
    // Same person may be on several parts of the same tile.
    setTileInterest(db, team.id, captain.id, tile.id, taskB.id, true);
    expect(getTeamProgress(db, team.id).interests.map((i) => [i.tileId, i.taskId, i.user.id])).toEqual([
      [tile.id, taskA.id, captain.id],
      [tile.id, taskB.id, member.id],
      [tile.id, taskB.id, captain.id],
    ]);

    setTileInterest(db, team.id, captain.id, tile.id, taskA.id, false);
    expect(getTeamProgress(db, team.id).interests.map((i) => [i.taskId, i.user.id])).toEqual([
      [taskB.id, member.id],
      [taskB.id, captain.id],
    ]);

    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "team.tile_interest_set")).all();
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.teamId === team.id && r.visibility === "team")).toBe(true);
    expect(JSON.parse(rows[3]!.details)).toEqual({ tileName: "Zulrah", taskLabel: "Tanzanite fang", interested: false });
  });

  it("is idempotent and rejects tasks that aren't a part of the tile", () => {
    const { bingo, team, tile, taskA, captain } = seedTeamAndTile();
    setTileInterest(db, team.id, captain.id, tile.id, taskA.id, true);
    setTileInterest(db, team.id, captain.id, tile.id, taskA.id, true);
    expect(db.select().from(schema.tileInterests).all()).toHaveLength(1);

    const other = db.insert(schema.bingos).values({ slug: "other", name: "Other", boardRows: 1, boardCols: 1, createdByUserId: captain.id }).returning().get();
    const foreign = createTile(db, { bingoId: other.id, name: "Foreign", boardRow: 0, boardCol: 0 });
    const foreignTask = createTask(db, foreign.id, { kind: "ITEM", label: "Foreign part", points: 1, itemName: "Foreign" }, 0);
    expect(() => setTileInterest(db, team.id, captain.id, foreign.id, foreignTask.id, true)).toThrow(ServiceError);

    // Right bingo, wrong tile: the task must hang off the tile it's claimed for.
    const sibling = createTile(db, { bingoId: bingo.id, name: "Sibling", boardRow: 0, boardCol: 1 });
    expect(() => setTileInterest(db, team.id, captain.id, sibling.id, taskA.id, true)).toThrow(ServiceError);
  });

  it("drops a member's hands when they leave the team", () => {
    const { team, tile, taskA, member } = seedTeamAndTile();
    setTileInterest(db, team.id, member.id, tile.id, taskA.id, true);
    removeTeamMember(db, team.id, member.id);
    expect(getTeamProgress(db, team.id).interests).toEqual([]);
  });
});
