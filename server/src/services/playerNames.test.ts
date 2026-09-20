import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { playerName } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { queryAuditLog } from "../audit/query";
import { userLabelById } from "../audit/describe";
import { createTask, createTile } from "./boardService";
import { rsnsAcrossBingos, rsnsInBingo, withRsn } from "./playerNames";
import { approveSubmission } from "./scoringService";
import { getContributionCounts } from "./statsService";
import { createSubmission, getAllSubmissionsForBingo, getTeamSubmissions } from "./submissionService";
import { getTeamProgress, getTeamsWithMembers } from "./teamService";
import { setTileInterest } from "./teamService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const STARTS_AT = new Date("2026-03-01T10:00:00Z");
const NOW = new Date("2026-03-01T12:00:00Z");

const user = (name: string) => db.insert(schema.users).values({ discordId: name, discordUsername: `${name}_discord`, discordGlobalName: `${name} Global` }).returning().get();
const signup = (bingoId: string, userId: string, rsn: string, status: "active" | "withdrawn" = "active") =>
  db.insert(schema.signups).values({ bingoId, userId, rsn, status }).returning().get();

// Two bingos. In "one", alice (RSN "Zezima") and bob (RSN "Lynx Titan") are on a team; mod dan doesn't play. In "two",
// alice signed up under a different RSN. bob's signup in "one" was withdrawn after the team was made.
function seed() {
  const [alice, bob, dan] = [user("alice"), user("bob"), user("dan")] as const;
  const bingo = (slug: string) => db.insert(schema.bingos).values({ slug, name: slug, boardRows: 2, boardCols: 2, createdByUserId: dan.id, stage: "live", startsAt: STARTS_AT }).returning().get();
  const one = bingo("one");
  const two = bingo("two");
  signup(one.id, alice.id, "Zezima");
  signup(one.id, bob.id, "Lynx Titan", "withdrawn");
  signup(two.id, alice.id, "Alt Account");
  const team = db.insert(schema.teams).values({ bingoId: one.id, captainUserId: alice.id, name: "Team", codeword: "word" }).returning().get();
  for (const u of [alice, bob]) db.insert(schema.teamMembers).values({ teamId: team.id, userId: u.id, isCaptain: u === alice }).run();
  db.insert(schema.bingoModerators).values({ bingoId: one.id, userId: dan.id }).run();
  const tile = createTile(db, { bingoId: one.id, name: "Tile", boardRow: 0, boardCol: 0 });
  const task = createTask(db, tile.id, { kind: "ITEM", itemName: "x", label: "Task", description: "d", points: 10 });
  return { alice, bob, dan, one, two, team, task };
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("playerName", () => {
  const discord = { discordUsername: "handle", discordGlobalName: "Global", discordGuildNick: "Nick" };
  it("prefers the RSN, then the Discord names in their usual order", () => {
    expect(playerName({ ...discord, rsn: "Zezima" })).toBe("Zezima");
    expect(playerName({ ...discord, rsn: null })).toBe("Nick");
    expect(playerName({ ...discord, discordGuildNick: null })).toBe("Global");
    expect(playerName({ discordUsername: "handle", discordGlobalName: null, discordGuildNick: null })).toBe("handle");
    expect(playerName({ ...discord, rsn: "  " })).toBe("Nick"); // a blank RSN is no RSN
  });
});

describe("rsnsInBingo", () => {
  it("finds the RSN each user signed up with in that bingo, whatever the status, and nothing for a user who didn't", () => {
    const { alice, bob, dan, one, two } = seed();
    const map = rsnsInBingo(db, one.id, [alice.id, bob.id, dan.id]);
    expect(Object.fromEntries(map)).toEqual({ [alice.id]: "Zezima", [bob.id]: "Lynx Titan" });
    expect(rsnsInBingo(db, two.id, [alice.id, bob.id]).get(alice.id)).toBe("Alt Account");
    expect(rsnsInBingo(db, one.id, []).size).toBe(0);
  });

  it("withRsn sets null for someone with no signup, and across bingos each entry gets its own bingo's RSN", () => {
    const { alice, dan, one, two } = seed();
    expect(withRsn(db, one.id, [{ id: alice.id }, { id: dan.id }])).toEqual([{ id: alice.id, rsn: "Zezima" }, { id: dan.id, rsn: null }]);
    const across = rsnsAcrossBingos(db, [{ bingoId: one.id, userId: alice.id }, { bingoId: two.id, userId: alice.id }, { bingoId: null, userId: alice.id }]);
    expect(across.get(`${one.id}|${alice.id}`)).toBe("Zezima");
    expect(across.get(`${two.id}|${alice.id}`)).toBe("Alt Account");
  });
});

describe("what the bingo sends", () => {
  it("names team members by RSN, and a moderator who isn't playing by their Discord name", () => {
    const { alice, bob, one } = seed();
    const [team] = getTeamsWithMembers(db, one.id);
    const byId = new Map(team!.members.map((m) => [m.user.id, m.user]));
    expect(byId.get(alice.id)!.rsn).toBe("Zezima");
    expect(playerName(byId.get(bob.id)!)).toBe("Lynx Titan"); // withdrawn, still named by it
    expect(playerName({ discordUsername: "dan_discord", discordGlobalName: "dan Global", discordGuildNick: null, rsn: null })).toBe("dan Global");
  });

  it("names submitters, posters and the contribution ranking by RSN", () => {
    const { alice, bob, dan, one, team, task } = seed();
    const submission = createSubmission(db, one, {
      teamId: team.id, submittedByUserId: alice.id, postedByUserId: bob.id, claims: [{ nodeId: task.id, itemName: "x" }], screenshotUrl: "/x.png", now: NOW,
    });
    approveSubmission(db, { submissionId: submission.id, reviewedByUserId: dan.id });

    const [detail] = getTeamSubmissions(db, team.id);
    expect(playerName(detail!.submittedByUser!)).toBe("Zezima");
    expect(playerName(detail!.postedByUser!)).toBe("Lynx Titan");
    expect(playerName(getAllSubmissionsForBingo(db, one.id)[0]!.submittedByUser!)).toBe("Zezima");
    expect(getContributionCounts(db, one.id).map((c) => playerName(c.user))).toEqual(["Zezima"]);
  });

  it("names tile interests by RSN", () => {
    const { alice, team, task } = seed();
    const tile = db.select().from(schema.tiles).get()!;
    setTileInterest(db, team.id, alice.id, tile.id, task.id, true);
    const [interest] = getTeamProgress(db, team.id).interests;
    expect(playerName(interest!.user)).toBe("Zezima");
  });
});

describe("the audit log names players by RSN", () => {
  it("in the stored details (labels written by the server) when it knows the bingo, and by Discord name when it doesn't", () => {
    const { alice, dan, one } = seed();
    expect(userLabelById(db, alice.id, one.id)).toBe("Zezima");
    expect(userLabelById(db, alice.id)).toBe("alice Global");
    expect(userLabelById(db, dan.id, one.id)).toBe("dan Global"); // no signup in that bingo
    expect(userLabelById(db, "nobody", one.id)).toBeNull();
  });

  it("for the actor of an entry, by the RSN of the entry's own bingo", () => {
    const { alice, bob, one, team, task } = seed();
    createSubmission(db, one, { teamId: team.id, submittedByUserId: alice.id, postedByUserId: bob.id, claims: [{ nodeId: task.id, itemName: "x" }], screenshotUrl: "/x.png", now: NOW });
    const entry = queryAuditLog(db, { bingoId: "all" }, { action: ["submission.created"] }).entries[0]!;
    expect(playerName(entry.actor!)).toBe("Lynx Titan");
    expect(playerName(entry.onBehalfOf!)).toBe("Zezima");
    expect(entry.label).toMatch(/^Lynx Titan submitted 1 x for "Tile" \(on behalf of Zezima\)$/);
  });
});
