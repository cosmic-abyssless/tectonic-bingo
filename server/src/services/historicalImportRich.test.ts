// A rich (version 2) historical bundle (#319): the validator's checks on its sections, and what the importer makes of
// them, over the rich fixture in testUtils/fixtures/richHistoricalBundle.ts (which says what each Team should score).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { validateHistoricalBundle, type HistoricalBundle, type HistoricalBundleTask } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { richHistoricalBundle, SAMPLE_BUNDLE } from "../testUtils/fixtures/richHistoricalBundle";
import { importHistoricalBundle } from "./historicalImportService";
import { getCutUserIds, getDraftState } from "./draftService";

vi.mock("../ws", () => ({ broadcast: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let admin: typeof schema.users.$inferSelect;
let uploadsDir: string;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "historical-rich-"));
});
afterEach(() => {
  sqlite.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

const rich = richHistoricalBundle;
const problemsOf = (b: unknown) => validateHistoricalBundle(b).problems;
const importIt = (b: HistoricalBundle = rich()) => importHistoricalBundle(db, b, { createdByUserId: admin.id, uploadsDir });
const tasksOf = (b: HistoricalBundle, row: number, col: number) => b.tiles.find((t) => t.boardRow === row && t.boardCol === col)!.tasks!;
const teamIdOf = (bingoId: string, name: string) => db.select().from(schema.teams).where(and(eq(schema.teams.bingoId, bingoId), eq(schema.teams.name, name))).get()!.id;
const userIdOf = (discordId: string) => db.select().from(schema.users).where(eq(schema.users.discordId, discordId)).get()!.id;

describe("checking a rich bundle", () => {
  it("passes the rich fixture, and a version 2 bundle with none of the rich sections", () => {
    expect(problemsOf(rich())).toEqual([]);
    expect(problemsOf({ ...structuredClone(SAMPLE_BUNDLE), version: 2 })).toEqual([]);
  });

  it("keeps a version 1 bundle sparse", () => {
    expect(problemsOf({ ...rich(), version: 1 })).toEqual(["version: a version 1 bundle has no lines, submissions, signups, draft, Tile tasks; those need version 2"]);
  });

  it("checks requirement trees", () => {
    const b = rich();
    const [any, neck] = tasksOf(b, 0, 0) as [HistoricalBundleTask & { children: unknown[] }, HistoricalBundleTask];
    any.children = [];
    Object.assign(neck, { key: "vork-sum", kind: "SUM", quantity: 2, children: [{ kind: "ANY", children: [{ kind: "ITEM", item: "x" }] }] });
    const [sum, call] = tasksOf(b, 0, 1) as [HistoricalBundleTask & { key: string }, HistoricalBundleTask];
    sum.key = "vork-any";
    Object.assign(call, { kind: "COUNT", min: 3, children: [{ kind: "ITEM", item: "a" }] });
    tasksOf(b, 0, 2)[0]!.withholdUntilPrevious = true;
    b.submissions = [];
    expect(problemsOf(b)).toEqual([
      'tiles[0] "Vorkath" tasks[0]: a ANY needs children',
      'tiles[0] "Vorkath" tasks[1]: a SUM\'s children must all be ITEMs',
      'tiles[1] "Zulrah" tasks[0]: key "vork-any" is used twice',
      'tiles[1] "Zulrah" tasks[1]: min 3 is more than its 1 children',
      'tiles[1] "Zulrah" tasks[1]: only a MANUAL Task has completions',
      'tiles[2] "Barrows" tasks[0]: the first Task can\'t withhold its points until the one before it',
    ]);
  });

  it("checks Proof screenshot settings and MANUAL completions", () => {
    const b = rich();
    tasksOf(b, 0, 2)[0]!.requiresProof = true;
    const call = tasksOf(b, 0, 1)[1]!;
    call.completions = [{ team: "Sea Snakes", at: "2024-03-03T12:00:00Z" }, { team: "sea snakes", at: "nope" }, { team: "Nobody", at: "2024-03-03T12:00:00Z" }];
    expect(problemsOf(b)).toEqual([
      'tiles[1] "Zulrah" tasks[1] completions[1]: Team "sea snakes" completes it twice',
      'tiles[1] "Zulrah" tasks[1] completions[1]: at must be a date',
      'tiles[1] "Zulrah" tasks[1] completions[2]: "Nobody" isn\'t one of the Teams',
      'tiles[2] "Barrows" tasks[0]: the Tile already requires a Proof screenshot Tile-wide, so its Tasks can\'t have their own',
    ]);
  });

  it("checks Lines", () => {
    const b = rich();
    b.lines = [
      { type: "row", index: 0, points: 50 },
      { type: "row", index: 0, points: 50 },
      { type: "column", index: 3, points: 10 },
      { type: "diagonal", index: 2, points: 10 },
      { type: "custom", index: 0, points: 10, cells: [{ boardRow: 0, boardCol: 0 }, { boardRow: 5, boardCol: 5 }] },
    ];
    expect(problemsOf(b)).toEqual([
      "lines[1]: row 0 is listed twice",
      "lines[2]: there's no column 4",
      "lines[3]: a diagonal is index 0 or 1, on a square board",
      "lines[4].cells[1]: isn't a Tile's position",
    ]);
  });

  it("checks Submissions: the Team, the Player, the dates, the Claims and Proof", () => {
    const b = rich();
    const [s0, s1, s2, s3] = b.submissions!;
    s0!.player = "100000000000000001"; // Lava Dragons'
    s1!.reviewedAt = "2024-03-01T00:00:00.000Z";
    s1!.claims = [{ leaf: "zul-fang", item: "Magic fang", quantity: 1 }, { leaf: "zul-sum", item: null, quantity: 1 }, { leaf: "zul-call", item: "x", quantity: 0 }];
    s2!.screenshot = "shot-sea-1";
    s3!.claims = [];
    b.submissions!.find((s) => s.key === "lava-proof")!.proof = { boardRow: 0, boardCol: 0, task: null };
    b.submissions!.find((s) => s.key === "sea-proof")!.proof = { boardRow: 0, boardCol: 1, task: "zul-sum" };
    expect(problemsOf(b)).toEqual([
      'Submission "sea-1": Magma Mike isn\'t on Team "Sea Snakes"',
      'Submission "sea-2": reviewed before it was submitted',
      'Submission "sea-2" claims[0]: its leaf "zul-fang" accepts Tanzanite fang, not "Magic fang"',
      'Submission "sea-2" claims[1]: "zul-sum" isn\'t the key of an ITEM or MANUAL leaf',
      'Submission "sea-2" claims[2]: quantity must be a whole number from 1',
      'Submission "sea-2" claims[2]: a MANUAL leaf takes no item',
      'Submission "sea-3": screenshot "shot-sea-1" is used twice',
      'Submission "lava-1": a drop needs its Claims',
      'Submission "lava-proof": its Tile doesn\'t require a Proof screenshot Tile-wide',
      'Submission "sea-proof": proof.task "zul-sum" isn\'t a Task that requires a Proof screenshot',
    ]);
  });

  it("checks Signups: every Player has one, and a Cut signup is someone who wasn't drafted", () => {
    const b = rich();
    const entries = b.signups!.entries;
    entries.splice(entries.findIndex((e) => e.discordId === "100000000000000013"), 1);
    entries.find((e) => e.discordId === "100000000000000001")!.timezone = "Mars/Olympus";
    entries.find((e) => e.discordId === "100000000000000002")!.answers = { favourite: "Zulrah" };
    entries.find((e) => e.discordId === "100000000000000003")!.cut = true;
    delete entries.find((e) => e.rsn === "Driftwood")!.rsn;
    entries.find((e) => e.rsn === "Sandy")!.cut = false;
    expect(problemsOf(b)).toEqual([
      'signups.entries[0] (Magma Mike): timezone must be an IANA zone like "Europe/London", or null',
      'signups.entries[1] (Cinder): an answer to "favourite", which isn\'t a question',
      "signups.entries[2] (Old Flame): a Cut signup isn't one of the players (they were drafted onto a Team)",
      "signups.entries[2] (Old Flame): a Cut signup needs its rsn",
      "signups.entries[8] (100000000000000031): a Cut signup needs its rsn",
      "signups.entries[9] (Sandy): isn't one of the players (a signup that wasn't drafted is cut)",
      "signups: Kelp Lord has no signup",
    ]);
  });

  it("checks the Draft runs in snake order, without the Captains and co-captains", () => {
    const b = rich();
    const picks = b.draft!.picks;
    picks[3] = { pick: 4, team: "Lava Dragons", player: "100000000000000003" };
    picks[4] = { pick: 5, team: "Sea Snakes", player: "100000000000000012" };
    expect(problemsOf(b)).toEqual([
      'draft pick 4: is Team "Lava Dragons"\'s, but in snake order it\'s Rock Crabs\'s',
      'draft pick 5: is Team "Sea Snakes"\'s, but in snake order it\'s Lava Dragons\'s',
      "draft pick 5: Brine leads their Team, so isn't drafted",
    ]);
    b.draft = { ...b.draft!, order: ["Sea Snakes", "Lava Dragons"], picks: [{ pick: 2, team: "Sea Snakes", player: "100000000000000013" }] };
    expect(problemsOf(b)).toEqual(["draft.order: must list every Team once", "draft.picks: pick 1 is numbered 2; picks run 1, 2, 3..."]);
  });
});

describe("importing a rich bundle", () => {
  it("creates each Tile's Tasks and their requirement trees, with Freeze and Proof screenshot settings", async () => {
    const { bingo } = await importIt();
    const vorkath = db.select().from(schema.tiles).where(and(eq(schema.tiles.bingoId, bingo.id), eq(schema.tiles.name, "Vorkath"))).get()!;
    expect(vorkath).toMatchObject({ hasFreezePeriod: true, freezeDurationMinutes: 60, requiresProof: false });
    const barrows = db.select().from(schema.tiles).where(and(eq(schema.tiles.bingoId, bingo.id), eq(schema.tiles.name, "Barrows"))).get()!;
    expect(barrows).toMatchObject({ requiresProof: true, proofNote: "Your kill count", hasFreezePeriod: false });

    const children = (parentId: string) =>
      db.select({ node: schema.nodes }).from(schema.nodeEdges).innerJoin(schema.nodes, eq(schema.nodeEdges.childId, schema.nodes.id)).where(eq(schema.nodeEdges.parentId, parentId)).orderBy(schema.nodeEdges.sortOrder).all().map((r) => r.node);
    const [any, neck] = children(vorkath.nodeId);
    expect(any).toMatchObject({ kind: "ANY", label: "Any Vorkath unique", points: 10, pointsGateNodeId: null });
    expect(children(any!.id).map((n) => [n.kind, n.itemName])).toEqual([["ITEM", "Vorkath's head"], ["ITEM", "Draconic visage"]]);
    expect(neck).toMatchObject({ kind: "ITEM", itemName: "Dragonbone necklace", points: 20, pointsGateNodeId: any!.id });

    const zulrah = db.select().from(schema.tiles).where(and(eq(schema.tiles.bingoId, bingo.id), eq(schema.tiles.name, "Zulrah"))).get()!;
    const [sum, call] = children(zulrah.nodeId);
    expect(sum).toMatchObject({ kind: "SUM", quantity: 3, points: 15 });
    expect(call).toMatchObject({ kind: "MANUAL", description: "Kill Zulrah on a clan call", requiresProof: true, proofNote: "The whole team in one screenshot" });
  });

  it("recomputes the scores from the approved Submissions: withheld points, rejected drops, MANUAL Tasks and Lines", async () => {
    const { scoring } = await importIt();
    const team = (name: string) => scoring!.teams.find((t) => t.team === name)!;
    expect(scoring!.teams.map((t) => [t.team, t.total])).toEqual([
      ["Lava Dragons", 70],
      ["Sea Snakes", 125],
      ["Rock Crabs", 5],
    ]);
    const days = (name: string) => team(name).perDay.filter((d) => d.points > 0).map((d) => [d.date, d.points]);
    expect(days("Sea Snakes")).toEqual([["2024-03-02", 35], ["2024-03-03", 20], ["2024-03-04", 70]]);
    // Dragonbone necklace on the 2nd, but its 20 wait for a Vorkath unique on the 4th.
    expect(days("Lava Dragons")).toEqual([["2024-03-04", 35], ["2024-03-06", 15], ["2024-03-07", 20]]);
    expect(days("Rock Crabs")).toEqual([["2024-03-03", 5]]);
    // Every day of the Bingo, start to end.
    expect(team("Rock Crabs").perDay.map((d) => d.date)).toEqual(Array.from({ length: 15 }, (_, i) => `2024-03-${String(i + 1).padStart(2, "0")}`));
  });

  it("stores the Submissions as reviewed then, by nobody recorded, with their Claims and pending screenshots", async () => {
    const { bingo } = await importIt();
    const lava = teamIdOf(bingo.id, "Lava Dragons");
    const subs = db.select().from(schema.submissions).where(eq(schema.submissions.teamId, lava)).orderBy(schema.submissions.submittedAt).all();
    expect(subs.map((s) => [s.kind, s.status])).toEqual([
      ["drop", "approved"],
      ["drop", "approved"],
      ["drop", "rejected"],
      ["drop", "approved"],
      ["drop", "approved"],
      ["drop", "approved"],
      ["proof", "approved"],
    ]);
    expect(subs[0]).toMatchObject({ submittedByUserId: userIdOf("100000000000000002"), reviewedByUserId: null, submittedAt: new Date("2024-03-02T10:00:00Z"), reviewedAt: new Date("2024-03-02T12:00:00Z") });
    const claims = db.select().from(schema.claims).where(eq(schema.claims.submissionId, subs[3]!.id)).all();
    expect(claims.map((c) => [c.itemName, c.quantity])).toEqual([["Tanzanite fang", 2]]);

    const shots = db.select().from(schema.submissionScreenshots).where(inArray(schema.submissionScreenshots.submissionId, subs.map((s) => s.id))).all();
    expect(shots).toHaveLength(7);
    expect(shots.every((s) => s.storageUrl === "")).toBe(true);
    expect(shots.find((s) => s.historicalKey === "shot-lava-proof")).toMatchObject({ screenshotType: "proof" });
    expect(shots.find((s) => s.historicalKey === "shot-lava-1")).toMatchObject({ screenshotType: "main", submissionId: subs[0]!.id });

    const proof = subs[6]!;
    const barrows = db.select().from(schema.tiles).where(and(eq(schema.tiles.bingoId, bingo.id), eq(schema.tiles.name, "Barrows"))).get()!;
    expect(proof).toMatchObject({ proofTileId: barrows.id, proofTaskId: null });
    // A drop recorded without a screenshot has none.
    const sea3 = db.select().from(schema.submissions).where(and(eq(schema.submissions.teamId, teamIdOf(bingo.id, "Sea Snakes")), eq(schema.submissions.submittedByUserId, userIdOf("100000000000000012")))).get()!;
    expect(db.select().from(schema.submissionScreenshots).where(eq(schema.submissionScreenshots.submissionId, sea3.id)).all()).toEqual([]);
  });

  it("gives a MANUAL Task to each Team that completed it, credited to its Captain", async () => {
    const { bingo } = await importIt();
    const rocks = teamIdOf(bingo.id, "Rock Crabs");
    const subs = db.select().from(schema.submissions).where(eq(schema.submissions.teamId, rocks)).all();
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ status: "approved", submittedByUserId: userIdOf("100000000000000021"), reviewedAt: new Date("2024-03-03T20:00:00Z") });
    expect(db.select().from(schema.submissionScreenshots).where(eq(schema.submissionScreenshots.submissionId, subs[0]!.id)).all()).toEqual([]);
  });

  it("records the row's Line", async () => {
    const { bingo } = await importIt();
    const lines = db.select().from(schema.bingoLines).innerJoin(schema.nodes, eq(schema.bingoLines.nodeId, schema.nodes.id)).where(eq(schema.bingoLines.bingoId, bingo.id)).all();
    expect(lines.map((l) => [l.bingo_lines.lineType, l.bingo_lines.lineIndex, l.nodes.points])).toEqual([["row", 0, 50]]);
    expect(db.select().from(schema.nodeEdges).where(eq(schema.nodeEdges.parentId, lines[0]!.nodes.id)).all()).toHaveLength(3);
  });

  it("records every Signup at its time with its answers, Cut signups included", async () => {
    const { bingo, usersCreated } = await importIt();
    expect(usersCreated).toBe(11);
    const rows = db.select().from(schema.signups).where(eq(schema.signups.bingoId, bingo.id)).all();
    expect(rows).toHaveLength(11);
    const magma = rows.find((s) => s.rsn === "Magma Mike")!;
    expect(magma).toMatchObject({ timezone: "Europe/London", createdAt: new Date("2024-02-20T09:00:00Z") });

    const questions = db.select().from(schema.signupQuestions).where(eq(schema.signupQuestions.bingoId, bingo.id)).orderBy(schema.signupQuestions.sortOrder).all();
    expect(questions.map((q) => [q.prompt, q.type, q.visibility])).toEqual([
      ["How many hours a day can you play?", "text", "captains"],
      ["Anything else?", "textarea", "captains"],
    ]);
    const answers = db.select().from(schema.signupAnswers).where(eq(schema.signupAnswers.signupId, magma.id)).all();
    expect(answers.map((a) => a.value).sort()).toEqual(["2", "Happy to captain"]);

    // Cut: signed up, on no Team. A blank answer isn't stored.
    const sandy = rows.find((s) => s.rsn === "Sandy")!;
    expect(db.select().from(schema.teamMembers).where(eq(schema.teamMembers.userId, sandy.userId)).all()).toEqual([]);
    expect(db.select().from(schema.signupAnswers).where(eq(schema.signupAnswers.signupId, sandy.id)).all()).toEqual([]);
    expect(db.select().from(schema.users).where(eq(schema.users.id, sandy.userId)).get()).toMatchObject({ discordUsername: "Sandy B", inGuild: true });
    expect(db.select().from(schema.users).where(eq(schema.users.discordId, "100000000000000031")).get()).toMatchObject({ discordUsername: "Driftwood", inGuild: false });
  });

  it("records the Draft: its order and every pick, made by the Team's Captain", async () => {
    const { bingo } = await importIt();
    const teams = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).orderBy(schema.teams.draftOrder).all();
    expect(teams.map((t) => [t.draftOrder, t.name])).toEqual([[1, "Sea Snakes"], [2, "Lava Dragons"], [3, "Rock Crabs"]]);
    const picks = db.select().from(schema.draftPicks).where(eq(schema.draftPicks.bingoId, bingo.id)).orderBy(schema.draftPicks.pickNumber).all();
    const nameOf = new Map(teams.map((t) => [t.id, t.name]));
    expect(picks.map((p) => [p.pickNumber, nameOf.get(p.teamId)])).toEqual([[1, "Sea Snakes"], [2, "Lava Dragons"], [3, "Rock Crabs"], [4, "Rock Crabs"], [5, "Lava Dragons"]]);
    expect(picks[1]).toMatchObject({ userId: userIdOf("100000000000000002"), pickedByUserId: userIdOf("100000000000000001"), createdAt: new Date("2024-02-28T20:00:00Z") });
  });

  it("shows the Draft as over: its picks as recorded, nobody left to pick, and the Cut signups", async () => {
    const { bingo } = await importIt();
    const state = getDraftState(db, bingo, { includeAnswers: false });
    expect(state).toMatchObject({ pool: [], currentPick: null, draftStarted: true, orderLockedUntil: null, cutCount: 2 });
    expect(state.picks.map((p) => p.pickNumber)).toEqual([1, 2, 3, 4, 5]);
    expect([...getCutUserIds(db, bingo)].sort()).toEqual([userIdOf("100000000000000031"), userIdOf("100000000000000032")].sort());
  });

  it("audits the rich sections too", async () => {
    await importIt();
    const entry = db.select().from(schema.auditLog).all()[0]!;
    expect(JSON.parse(entry.details).counts).toEqual({
      tiles: 9, teams: 3, players: 9, usersCreated: 11, unknownPlayers: 1, standings: 3, womCompetition: true,
      tasks: 5, lines: 1, submissions: 11, signups: 11, cutSignups: 2, draftPicks: 5,
    });
  });

  it("returns no scoring for a sparse bundle", async () => {
    const { scoring } = await importIt(structuredClone(SAMPLE_BUNDLE));
    expect(scoring).toBeNull();
  });
});
