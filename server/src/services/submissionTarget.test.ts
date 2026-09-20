import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { addModerator } from "./bingoService";
import { createTile, createTask } from "./boardService";
import { createSubmission, getAllSubmissionsForBingo, getTeamSubmissions } from "./submissionService";
import { resolveSubmissionTarget, resolveSubmissionTeam } from "./submissionTarget";
import { ServiceError } from "./errors";
import { queryAuditLog } from "../audit/query";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const STARTS_AT = new Date("2026-03-01T10:00:00Z");
const NOW = new Date("2026-03-01T12:00:00Z");

const user = (name: string, isAdmin = false) => db.insert(schema.users).values({ discordId: name, discordUsername: name, isAdmin }).returning().get();

// Team A: alice (captain) and bob. Team B: cara. dan is a mod of the bingo and on no team; erin is a mod on team B;
// sam is a site admin; zed plays on no team at all.
function seed() {
  const [alice, bob, cara, dan, erin, sam, zed] = [user("alice"), user("bob"), user("cara"), user("dan"), user("erin"), user("sam", true), user("zed")] as const;
  const bingo = db
    .insert(schema.bingos)
    .values({ slug: "test", name: "Test", boardRows: 2, boardCols: 2, createdByUserId: sam.id, stage: "live", startsAt: STARTS_AT })
    .returning()
    .get();
  const team = (name: string, captain: typeof alice, others: (typeof alice)[] = []) => {
    const t = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name, codeword: `${name}-word` }).returning().get();
    for (const u of [captain, ...others]) db.insert(schema.teamMembers).values({ teamId: t.id, userId: u.id, isCaptain: u === captain }).run();
    return t;
  };
  const teamA = team("Team A", alice, [bob]);
  const teamB = team("Team B", cara, [erin]);
  addModerator(db, { bingoId: bingo.id, userId: dan.id });
  addModerator(db, { bingoId: bingo.id, userId: erin.id });
  return { bingo, teamA, teamB, alice, bob, cara, dan, erin, sam, zed };
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

const fail = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as ServiceError;
  }
  throw new Error("expected it to throw");
};

describe("resolveSubmissionTarget", () => {
  it("submits to your own team for yourself by default, and naming yourself changes nothing", () => {
    const { bingo, teamA, bob } = seed();
    expect(resolveSubmissionTarget(db, bingo, bob, {})).toMatchObject({ team: { id: teamA.id }, submittedByUserId: bob.id, postedByUserId: null });
    expect(resolveSubmissionTarget(db, bingo, bob, { forUserId: bob.id })).toMatchObject({ submittedByUserId: bob.id, postedByUserId: null });
    expect(resolveSubmissionTarget(db, bingo, bob, { teamId: teamA.id })).toMatchObject({ submittedByUserId: bob.id, postedByUserId: null });
  });

  it("lets a player post for a teammate: the teammate is credited, the poster is recorded", () => {
    const { bingo, teamA, alice, bob } = seed();
    const target = resolveSubmissionTarget(db, bingo, bob, { forUserId: alice.id }); // alice is the captain: a member like any other
    expect(target).toMatchObject({ team: { id: teamA.id }, submittedByUserId: alice.id, postedByUserId: bob.id });
  });

  it("refuses a player who isn't on the team, or who names someone from another team", () => {
    const { bingo, teamB, bob, cara, zed } = seed();
    expect(fail(() => resolveSubmissionTarget(db, bingo, zed, {})).status).toBe(403);
    const other = fail(() => resolveSubmissionTarget(db, bingo, bob, { forUserId: cara.id }));
    expect(other.status).toBe(400);
    expect(other.message).toMatch(/isn't on Team A/);
    expect(fail(() => resolveSubmissionTarget(db, bingo, bob, { forUserId: "nobody" })).status).toBe(400);
    expect(fail(() => resolveSubmissionTarget(db, bingo, bob, { teamId: teamB.id, forUserId: cara.id })).status).toBe(403); // a player can't pick another team
  });

  it("lets a mod submit to a team they aren't on, for one of its players", () => {
    const { bingo, teamA, alice, bob, dan } = seed();
    const target = resolveSubmissionTarget(db, bingo, dan, { teamId: teamA.id, forUserId: alice.id });
    expect(target).toMatchObject({ team: { id: teamA.id }, submittedByUserId: alice.id, postedByUserId: dan.id });
    expect(resolveSubmissionTeam(db, bingo, dan, teamA.id).id).toBe(teamA.id);
    expect(bob.id).not.toBe(alice.id);
  });

  it("makes a mod name the player when submitting to another team, and only a player of that team", () => {
    const { bingo, teamA, cara, dan } = seed();
    const none = fail(() => resolveSubmissionTarget(db, bingo, dan, { teamId: teamA.id }));
    expect(none.status).toBe(400);
    expect(none.message).toMatch(/which player/);
    expect(fail(() => resolveSubmissionTarget(db, bingo, dan, { teamId: teamA.id, forUserId: cara.id })).status).toBe(400);
    expect(fail(() => resolveSubmissionTarget(db, bingo, dan, { teamId: teamA.id, forUserId: dan.id })).status).toBe(400); // a mod isn't on that team
  });

  it("treats a site admin as a mod, and a mod on a team can still submit for themselves there", () => {
    const { bingo, teamA, teamB, alice, erin, sam } = seed();
    expect(resolveSubmissionTarget(db, bingo, sam, { teamId: teamA.id, forUserId: alice.id })).toMatchObject({ postedByUserId: sam.id });
    expect(resolveSubmissionTarget(db, bingo, erin, {})).toMatchObject({ team: { id: teamB.id }, submittedByUserId: erin.id, postedByUserId: null });
    // ...and to team A for one of its players.
    expect(resolveSubmissionTarget(db, bingo, erin, { teamId: teamA.id, forUserId: alice.id })).toMatchObject({ team: { id: teamA.id }, postedByUserId: erin.id });
  });

  it("doesn't find a team of another bingo", () => {
    const { bingo, sam, dan } = seed();
    const otherBingo = db.insert(schema.bingos).values({ slug: "other", name: "Other", boardRows: 2, boardCols: 2, createdByUserId: sam.id }).returning().get();
    const foreign = db.insert(schema.teams).values({ bingoId: otherBingo.id, captainUserId: sam.id, name: "Elsewhere", codeword: "x" }).returning().get();
    expect(fail(() => resolveSubmissionTarget(db, bingo, dan, { teamId: foreign.id, forUserId: sam.id })).status).toBe(404);
  });
});

describe("createSubmission on someone's behalf", () => {
  function submit(postedByUserId: string | null, submittedByUserId: string) {
    const { bingo, teamA, alice, bob } = seed();
    const tile = createTile(db, { bingoId: bingo.id, name: "Tile", boardRow: 0, boardCol: 0 });
    const task = createTask(db, tile.id, { kind: "ITEM", itemName: "x", label: "Task", description: "d", points: 10 });
    const ids = { alice: alice.id, bob: bob.id };
    const submission = createSubmission(db, bingo, {
      teamId: teamA.id,
      submittedByUserId: submittedByUserId === "alice" ? ids.alice : ids.bob,
      postedByUserId: postedByUserId === "alice" ? ids.alice : postedByUserId === "bob" ? ids.bob : null,
      claims: [{ nodeId: task.id, itemName: "x" }],
      screenshotUrl: "/x.png",
      now: NOW,
    });
    return { bingo, teamA, submission, ...ids };
  }

  it("records who posted it only when that is someone else", () => {
    const own = submit(null, "bob");
    expect(own.submission.postedByUserId).toBeNull();
    sqlite.close();
    ({ sqlite, db } = createTestDb());
    const posted = submit("bob", "alice");
    expect(posted.submission).toMatchObject({ submittedByUserId: posted.alice, postedByUserId: posted.bob });
  });

  it("ignores a poster who is the same player", () => {
    const same = submit("bob", "bob");
    expect(same.submission.postedByUserId).toBeNull();
  });

  it("names both in the lists the client reads, and in the audit log", () => {
    const { bingo, teamA, submission, alice, bob } = submit("bob", "alice");
    const [detail] = getTeamSubmissions(db, teamA.id);
    expect(detail!.submittedByUser?.id).toBe(alice);
    expect(detail!.postedByUser?.id).toBe(bob);
    const [modRow] = getAllSubmissionsForBingo(db, bingo.id);
    expect(modRow!.postedByUser?.id).toBe(bob);
    expect(modRow!.submission.id).toBe(submission.id);

    const entry = queryAuditLog(db, { bingoId: bingo.id }, { action: ["submission.created"] }).entries[0]!;
    expect(entry.actor?.id).toBe(bob);
    expect(entry.onBehalfOf?.id).toBe(alice);
    expect(entry.label).toBe('bob submitted 1 x for "Tile" (on behalf of alice)');
  });

  it("leaves the audit wording alone for a player's own submission", () => {
    const { bingo } = submit(null, "bob");
    const entry = queryAuditLog(db, { bingoId: bingo.id }, { action: ["submission.created"] }).entries[0]!;
    expect(entry.onBehalfOf).toBeNull();
    expect(entry.label).toBe('bob submitted 1 x for "Tile"');
  });
});
