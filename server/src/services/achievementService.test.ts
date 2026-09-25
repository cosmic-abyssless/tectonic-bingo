import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import { ACHIEVEMENT_KEYS, type AchievementKey } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile } from "./boardService";
import { createSubmission, setSubmissionReaction } from "./submissionService";
import { changeSubmissionAttribution } from "./submissionTarget";
import { setTileInterest } from "./teamService";
import { GePriceTable } from "./gePriceService";
import { fillMissingGpValuesAndNotify } from "./gpValueService";
import { repriceSubmission } from "./gpRepriceService";
import * as achievementService from "./achievementService";
import { runWithAuditContext } from "../audit/context";
import { broadcast } from "../ws";

vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const STARTS_AT = new Date("2026-03-01T00:00:00Z");

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  vi.mocked(broadcast).mockReset();
});

afterEach(() => {
  sqlite.close();
});

/** Runs `fn` with the given clock and device time zone in the ambient audit context — what a real request carries. */
function at<T>(now: Date, timezone: string, fn: () => T): T {
  return runWithAuditContext({ requestId: "r", actorUserId: null, actorType: "system", actorRole: "system", recorded: 0, skip: null, now, timezone }, fn);
}

function seed() {
  const mkUser = (name: string) => db.insert(schema.users).values({ discordId: name, discordUsername: name }).returning().get();
  const captain = mkUser("captain");
  const alice = mkUser("alice");
  const bob = mkUser("bob");
  const carol = mkUser("carol"); // captains a second team, and stands in for a moderator with no team of their own
  const [bingo] = db.insert(schema.bingos).values({ slug: "test", name: "Test Bingo", boardRows: 2, boardCols: 6, createdByUserId: captain.id, stage: "live", startsAt: STARTS_AT }).returning().all();
  db.transaction((tx) => achievementService.initializeAchievementSettings(tx, bingo.id, STARTS_AT));
  const [team] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "team-a" }).returning().all();
  db.insert(schema.teamMembers)
    .values([
      { teamId: team.id, userId: captain.id, isCaptain: true },
      { teamId: team.id, userId: alice.id },
      { teamId: team.id, userId: bob.id },
    ])
    .run();
  const [otherTeam] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: carol.id, name: "Team B", codeword: "team-b" }).returning().all();
  db.insert(schema.teamMembers).values([{ teamId: otherTeam.id, userId: carol.id, isCaptain: true }]).run();
  return { bingo: getBingo(bingo.id), team, otherTeam, captain, alice, bob, carol };
}

function getBingo(id: string) {
  return db.select().from(schema.bingos).where(eq(schema.bingos.id, id)).get()!;
}

function addTile(bingoId: string, row: number, col: number) {
  return createTile(db, { bingoId, name: `Tile ${row}-${col}`, boardRow: row, boardCol: col });
}

/** A tile with one bare ITEM task — the task IS the tile's only Part (CONTEXT.md "Part": a bare leaf is its own Part). */
function tileWithLeaf(bingoId: string, row: number, col: number, itemName = `item-${row}-${col}`) {
  const tile = addTile(bingoId, row, col);
  const leaf = createTask(db, tile.id, { kind: "ITEM", itemName, label: itemName, description: "d", points: 10 });
  return { tile, leafId: leaf.id, itemName };
}

function submit(bingo: typeof schema.bingos.$inferSelect, teamId: string, submittedByUserId: string, leafId: string, itemName: string, opts: { postedByUserId?: string; now?: Date; tz?: string } = {}) {
  const now = opts.now ?? STARTS_AT;
  return at(now, opts.tz ?? "UTC", () =>
    createSubmission(db, bingo, { teamId, submittedByUserId, postedByUserId: opts.postedByUserId, claims: [{ nodeId: leafId, itemName }], screenshotUrl: "/x.png", now }),
  );
}

function myAchievements(bingo: typeof schema.bingos.$inferSelect, userId: string) {
  return achievementService.getMyAchievements(db, getBingo(bingo.id), userId);
}

function earned(bingo: typeof schema.bingos.$inferSelect, userId: string, key: AchievementKey): boolean {
  return !!myAchievements(bingo, userId).achievements.find((a) => a.key === key)?.earned;
}

// ---------------------------------------------------------------------------
// Posting a Submission
// ---------------------------------------------------------------------------

describe("Strong start", () => {
  it("is earned by the poster, not the credited player, on their first post", () => {
    const { bingo, team, alice, bob } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, alice.id, leafId, itemName, { postedByUserId: bob.id }); // bob posts a drop credited to alice

    expect(earned(bingo, bob.id, "strong_start")).toBe(true);
    expect(earned(bingo, alice.id, "strong_start")).toBe(false); // alice hasn't posted anything herself yet
  });

  it("is not earned before the bingo is live", () => {
    const { bingo, team, alice } = seed();
    db.update(schema.bingos).set({ stage: "reveal" }).where(eq(schema.bingos.id, bingo.id)).run();
    // setTileInterest has no stage guard of its own — a good probe for achievementService's own Live check.
    const t = tileWithLeaf(bingo.id, 0, 0);
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, alice.id, t.tile.id, t.leafId, true));
    expect(earned(getBingo(bingo.id), alice.id, "eager_beaver")).toBe(false);
  });

  it("earns nothing for a moderator posting to a team they aren't a member of", () => {
    const { bingo, team, carol } = seed(); // carol captains Team B, not Team A
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, team.captainUserId, leafId, itemName, { postedByUserId: carol.id });
    expect(earned(bingo, carol.id, "strong_start")).toBe(false);
  });
});

describe("Partner slayer", () => {
  it("is earned when the poster credits a different teammate, not when posting for themselves", () => {
    const { bingo, team, alice, bob } = seed();
    const a = tileWithLeaf(bingo.id, 0, 0);
    const b = tileWithLeaf(bingo.id, 0, 1);
    submit(bingo, team.id, bob.id, a.leafId, a.itemName, { postedByUserId: alice.id }); // for a teammate
    submit(bingo, team.id, alice.id, b.leafId, b.itemName); // for herself

    expect(earned(bingo, alice.id, "partner_slayer")).toBe(true);
  });
});

describe("Night owl / Early bird", () => {
  it("go by the device's local hour, not the server's", () => {
    const { bingo, team, alice, bob } = seed();
    const a = tileWithLeaf(bingo.id, 0, 0);
    const b = tileWithLeaf(bingo.id, 0, 1);
    // 2026-03-02T02:30Z is 02:30 in UTC (Night owl) but 21:30 the prior day in America/New_York (neither).
    const instant = new Date("2026-03-02T02:30:00Z");
    submit(bingo, team.id, alice.id, a.leafId, a.itemName, { now: instant, tz: "UTC" });
    submit(bingo, team.id, bob.id, b.leafId, b.itemName, { now: instant, tz: "America/New_York" });

    expect(earned(bingo, alice.id, "night_owl")).toBe(true);
    expect(earned(bingo, bob.id, "night_owl")).toBe(false);
    expect(earned(bingo, bob.id, "early_bird")).toBe(false);
  });

  it("Early bird covers 06:00-08:59 device-local", () => {
    const { bingo, team, alice } = seed();
    const a = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, alice.id, a.leafId, a.itemName, { now: new Date("2026-03-02T06:00:00Z"), tz: "UTC" });
    expect(earned(bingo, alice.id, "early_bird")).toBe(true);
    expect(earned(bingo, alice.id, "night_owl")).toBe(false);
  });

  it.each([
    ["01:59", null],
    ["02:00", "night_owl"],
    ["05:59", "night_owl"],
    ["06:00", "early_bird"],
    ["08:59", "early_bird"],
    ["09:00", null],
  ] as const)("a post at %s earns %s", (time, key) => {
    const { bingo, team, alice } = seed();
    const a = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, alice.id, a.leafId, a.itemName, { now: new Date(`2026-03-02T${time}:00Z`), tz: "UTC" });
    expect(earned(bingo, alice.id, "night_owl")).toBe(key === "night_owl");
    expect(earned(bingo, alice.id, "early_bird")).toBe(key === "early_bird");
  });
});

describe("Regular", () => {
  it("counts distinct device-local dates, with progress, needing 5", () => {
    const { bingo, team, alice } = seed();
    const tiles = Array.from({ length: 5 }, (_, i) => tileWithLeaf(bingo.id, 0, i));
    for (let day = 0; day < 4; day++) {
      submit(bingo, team.id, alice.id, tiles[day]!.leafId, tiles[day]!.itemName, { now: new Date(STARTS_AT.getTime() + day * 86_400_000) });
    }
    const progress = myAchievements(bingo, alice.id).achievements.find((a) => a.key === "regular")!.progress;
    expect(progress).toEqual({ current: 4, target: 5 });
    expect(earned(bingo, alice.id, "regular")).toBe(false);

    submit(bingo, team.id, alice.id, tiles[4]!.leafId, tiles[4]!.itemName, { now: new Date(STARTS_AT.getTime() + 4 * 86_400_000) });
    expect(earned(bingo, alice.id, "regular")).toBe(true);
  });

  it("a device-local date crosses at the device's midnight, not UTC's", () => {
    const { bingo, team, alice } = seed();
    const tiles = Array.from({ length: 2 }, (_, i) => tileWithLeaf(bingo.id, 0, i));
    // Same UTC calendar day, but on opposite sides of midnight in a UTC-8 zone.
    submit(bingo, team.id, alice.id, tiles[0]!.leafId, tiles[0]!.itemName, { now: new Date("2026-03-02T02:00:00Z"), tz: "America/Los_Angeles" }); // 2026-03-01 local
    submit(bingo, team.id, alice.id, tiles[1]!.leafId, tiles[1]!.itemName, { now: new Date("2026-03-02T20:00:00Z"), tz: "America/Los_Angeles" }); // 2026-03-02 local
    expect(myAchievements(bingo, alice.id).achievements.find((a) => a.key === "regular")!.progress).toEqual({ current: 2, target: 5 });
  });
});

describe("Globetrotter", () => {
  it("counts distinct tiles posted to, needing 5", () => {
    const { bingo, team, alice } = seed();
    const tiles = Array.from({ length: 5 }, (_, i) => tileWithLeaf(bingo.id, 0, i));
    tiles.slice(0, 4).forEach((t) => submit(bingo, team.id, alice.id, t.leafId, t.itemName));
    expect(earned(bingo, alice.id, "globetrotter")).toBe(false);
    submit(bingo, team.id, alice.id, tiles[4]!.leafId, tiles[4]!.itemName);
    expect(earned(bingo, alice.id, "globetrotter")).toBe(true);
  });
});

describe("Called it (hidden)", () => {
  it("is earned posting a drop for a Part the poster currently has interest marked on", () => {
    const { bingo, team, alice } = seed();
    const { tile, leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, alice.id, tile.id, leafId, true));
    submit(bingo, team.id, alice.id, leafId, itemName);
    expect(earned(bingo, alice.id, "called_it")).toBe(true);
  });

  it("is not earned without a current interest mark on a Part containing the claim", () => {
    const { bingo, team, alice } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, alice.id, leafId, itemName);
    expect(earned(bingo, alice.id, "called_it")).toBe(false);
  });

  it("a visible one's flavour only comes once it's earned", () => {
    const { bingo, team, alice } = seed();
    const read = () => myAchievements(bingo, alice.id).achievements.find((a) => a.key === "strong_start")!;
    expect(read()).toMatchObject({ masked: false, flavor: null, earned: false });
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, alice.id, leafId, itemName);
    expect(read().flavor).toBeTruthy();
  });

  it("is masked in the read until earned", () => {
    const { bingo, alice } = seed();
    const entry = myAchievements(bingo, alice.id).achievements.find((a) => a.key === "called_it")!;
    expect(entry).toMatchObject({ hidden: true, masked: true, name: null, description: null, flavor: null, itemName: null, earned: false });
  });
});

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

describe("Popular", () => {
  const react = (submissionId: string, userId: string, emoji: "🔥" | "🎉" | "😂" | "💀" | "👀") =>
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, submissionId, userId, emoji, true));

  it("is earned by the Player a Submission is credited to, once teammates leave it 5 Reactions (several emojis each count)", () => {
    const { bingo, team, captain, alice, bob } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    const sub = submit(bingo, team.id, bob.id, leafId, itemName);
    react(sub.id, alice.id, "🔥");
    react(sub.id, alice.id, "🎉");
    react(sub.id, alice.id, "😂");
    react(sub.id, captain.id, "🔥");
    expect(earned(bingo, bob.id, "popular")).toBe(false);
    react(sub.id, captain.id, "👀");
    expect(earned(bingo, bob.id, "popular")).toBe(true);
    // The reactors don't earn it for reacting.
    expect(earned(bingo, alice.id, "popular")).toBe(false);
    expect(earned(bingo, captain.id, "popular")).toBe(false);
  });

  it("goes to whoever the drop is credited to, not a teammate who posted it for them", () => {
    const { bingo, team, captain, alice, bob } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    const sub = submit(bingo, team.id, bob.id, leafId, itemName, { postedByUserId: alice.id });
    for (const emoji of ["🔥", "🎉", "😂", "💀", "👀"] as const) react(sub.id, captain.id, emoji);
    expect(earned(bingo, bob.id, "popular")).toBe(true);
    expect(earned(bingo, alice.id, "popular")).toBe(false);
  });

  it("doesn't count the Player's own Reactions, nor Reactions spread over several Submissions", () => {
    const { bingo, team, alice, bob } = seed();
    const a = tileWithLeaf(bingo.id, 0, 0);
    const b = tileWithLeaf(bingo.id, 0, 1);
    const subA = submit(bingo, team.id, bob.id, a.leafId, a.itemName);
    const subB = submit(bingo, team.id, bob.id, b.leafId, b.itemName);
    for (const emoji of ["🔥", "🎉", "😂", "💀", "👀"] as const) react(subA.id, bob.id, emoji);
    for (const emoji of ["🔥", "🎉", "😂"] as const) react(subA.id, alice.id, emoji);
    for (const emoji of ["💀", "👀"] as const) react(subB.id, alice.id, emoji);
    expect(earned(bingo, bob.id, "popular")).toBe(false);
  });

  it("stays hidden, and isn't taken away when Reactions are removed", () => {
    const { bingo, team, captain, alice, bob } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    const sub = submit(bingo, team.id, bob.id, leafId, itemName);
    expect(myAchievements(bingo, bob.id).achievements.find((a) => a.key === "popular")).toMatchObject({ hidden: true, masked: true });
    for (const emoji of ["🔥", "🎉", "😂"] as const) react(sub.id, alice.id, emoji);
    for (const emoji of ["💀", "👀"] as const) react(sub.id, captain.id, emoji);
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, sub.id, alice.id, "🔥", false));
    expect(earned(bingo, bob.id, "popular")).toBe(true);
  });
});

describe("Hypeman / Cheerleader / Superfan / Main character", () => {
  it("Hypeman is earned reacting to a teammate's submission, not one's own (that's Main character instead)", () => {
    const { bingo, team, alice, bob } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    const sub = submit(bingo, team.id, alice.id, leafId, itemName);
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, sub.id, bob.id, "🔥", true));
    expect(earned(bingo, bob.id, "hypeman")).toBe(true);
    expect(earned(bingo, bob.id, "main_character")).toBe(false);
  });

  it("Main character (hidden) is earned reacting to one's own submission", () => {
    const { bingo, team, alice } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    const sub = submit(bingo, team.id, alice.id, leafId, itemName);
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, sub.id, alice.id, "🎉", true));
    expect(earned(bingo, alice.id, "main_character")).toBe(true);
    expect(earned(bingo, alice.id, "hypeman")).toBe(false);
  });

  it("Cheerleader counts distinct submissions reacted to (any emoji, once each), needing 10", () => {
    const { bingo, team, alice, bob } = seed();
    const subs = Array.from({ length: 10 }, (_, i) => {
      const t = tileWithLeaf(bingo.id, Math.floor(i / 6), i % 6);
      return submit(bingo, team.id, bob.id, t.leafId, t.itemName);
    });
    subs.slice(0, 9).forEach((s) => at(STARTS_AT, "UTC", () => setSubmissionReaction(db, s.id, alice.id, "🔥", true)));
    // Cheerleader is Hidden: no progress shows until it's earned, or "9/10" would give it away.
    expect(myAchievements(bingo, alice.id).achievements.find((a) => a.key === "cheerleader")!).toMatchObject({ masked: true, progress: null });
    expect(earned(bingo, alice.id, "cheerleader")).toBe(false);

    // A second emoji on an already-reacted submission doesn't count twice.
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, subs[0]!.id, alice.id, "🎉", true));
    expect(earned(bingo, alice.id, "cheerleader")).toBe(false);

    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, subs[9]!.id, alice.id, "🔥", true));
    expect(earned(bingo, alice.id, "cheerleader")).toBe(true);
    expect(myAchievements(bingo, alice.id).achievements.find((a) => a.key === "cheerleader")!.progress).toEqual({ current: 10, target: 10 });
  });

  it("Superfan (hidden) needs a reaction to a submission from every OTHER current team member", () => {
    const { bingo, team, alice, bob, captain } = seed();
    const bobsTile = tileWithLeaf(bingo.id, 0, 0);
    const bobSub = submit(bingo, team.id, bob.id, bobsTile.leafId, bobsTile.itemName);
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, bobSub.id, alice.id, "🔥", true));
    expect(earned(bingo, alice.id, "superfan")).toBe(false); // captain's never gotten a reaction yet

    const captainsTile = tileWithLeaf(bingo.id, 0, 1);
    const captainSub = submit(bingo, team.id, captain.id, captainsTile.leafId, captainsTile.itemName);
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, captainSub.id, alice.id, "🔥", true));
    expect(earned(bingo, alice.id, "superfan")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Interest
// ---------------------------------------------------------------------------

describe("Eager beaver", () => {
  it("is earned marking interest ON; turning it off doesn't earn anything", () => {
    const { bingo, team, alice, bob } = seed();
    const bobsTile = tileWithLeaf(bingo.id, 0, 0);
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, bob.id, bobsTile.tile.id, bobsTile.leafId, true));
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, bob.id, bobsTile.tile.id, bobsTile.leafId, false));
    expect(earned(bingo, bob.id, "eager_beaver")).toBe(true); // never taken away

    const alicesTile = tileWithLeaf(bingo.id, 0, 1);
    // Interest never marked ON for alice at all — nothing earned.
    expect(earned(bingo, alice.id, "eager_beaver")).toBe(false);
  });
});

describe("Ragequit", () => {
  it("is earned taking interest OFF, not marking it on", () => {
    const { bingo, team, bob } = seed();
    const t = tileWithLeaf(bingo.id, 0, 0);
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, bob.id, t.tile.id, t.leafId, true));
    expect(earned(bingo, bob.id, "ragequit")).toBe(false);
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, bob.id, t.tile.id, t.leafId, false));
    expect(earned(bingo, bob.id, "ragequit")).toBe(true);
  });

  it("isn't earned by a no-op toggle (interest that was never on)", () => {
    const { bingo, team, bob } = seed();
    const t = tileWithLeaf(bingo.id, 0, 0);
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, bob.id, t.tile.id, t.leafId, false));
    expect(earned(bingo, bob.id, "ragequit")).toBe(false);
  });

  it("counts interest marked before Live but taken off during it; not taken off before Live", () => {
    const { bingo, team, alice, bob } = seed();
    db.update(schema.bingos).set({ stage: "reveal" }).where(eq(schema.bingos.id, bingo.id)).run();
    const a = tileWithLeaf(bingo.id, 0, 0);
    const b = tileWithLeaf(bingo.id, 0, 1);
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, alice.id, a.tile.id, a.leafId, true));
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, bob.id, b.tile.id, b.leafId, true));
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, bob.id, b.tile.id, b.leafId, false)); // during reveal
    db.update(schema.bingos).set({ stage: "live" }).where(eq(schema.bingos.id, bingo.id)).run();
    at(STARTS_AT, "UTC", () => setTileInterest(db, team.id, alice.id, a.tile.id, a.leafId, false)); // during Live
    expect(earned(getBingo(bingo.id), alice.id, "ragequit")).toBe(true);
    expect(earned(getBingo(bingo.id), bob.id, "ragequit")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Big spender / GP value fill
// ---------------------------------------------------------------------------

async function loadedTable(price: number): Promise<GePriceTable> {
  const mapping = [{ id: 1, name: "Twisted bow" }];
  const latest = { data: { "1": { high: price, low: price } } };
  const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).endsWith("/mapping") ? mapping : latest)));
  const table = new GePriceTable(fetchImpl as unknown as typeof fetch, () => 0, () => true);
  await table.refreshIfStale();
  return table;
}

describe("Big spender", () => {
  it("is earned once the GP value fill prices a claim at 25m or more — checked against the submission's creation time", async () => {
    const { bingo, team, alice } = seed();
    const { leafId } = tileWithLeaf(bingo.id, 0, 0, "Twisted bow");
    const sub = submit(bingo, team.id, alice.id, leafId, "Twisted bow"); // the global price table is cold in tests, so this claim starts with no GP value
    expect(earned(bingo, alice.id, "big_spender")).toBe(false);

    const table = await loadedTable(30_000_000);
    fillMissingGpValuesAndNotify(db, table);
    expect(earned(bingo, alice.id, "big_spender")).toBe(true);
    void sub;
  });

  it("is not earned when the total stays under 25m", async () => {
    const { bingo, team, alice } = seed();
    tileWithLeaf(bingo.id, 0, 0, "Twisted bow");
    const { leafId } = tileWithLeaf(bingo.id, 0, 1, "Twisted bow");
    submit(bingo, team.id, alice.id, leafId, "Twisted bow");
    fillMissingGpValuesAndNotify(db, await loadedTable(1_000_000));
    expect(earned(bingo, alice.id, "big_spender")).toBe(false);
  });

  it("a moderator's re-price never triggers it", async () => {
    const { bingo, team, alice } = seed();
    const { leafId } = tileWithLeaf(bingo.id, 0, 0, "Twisted bow");
    const sub = submit(bingo, team.id, alice.id, leafId, "Twisted bow");
    fillMissingGpValuesAndNotify(db, await loadedTable(1_000_000)); // first-priced under the threshold
    expect(earned(bingo, alice.id, "big_spender")).toBe(false);

    await repriceSubmission(db, bingo.id, sub.id, await loadedTable(30_000_000)); // now worth well over 25m
    expect(earned(bingo, alice.id, "big_spender")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Page opens
// ---------------------------------------------------------------------------

describe("Drop detective / Rules lawyer / Number cruncher", () => {
  it("Drop detective needs every current tile opened, its progress against the board's tile count once earned", () => {
    const { bingo, team, alice } = seed();
    const t1 = addTile(bingo.id, 0, 0);
    const t2 = addTile(bingo.id, 0, 1);
    at(STARTS_AT, "UTC", () => achievementService.recordPageOpened(db, { bingoId: bingo.id, userId: alice.id, teamId: team.id, kind: "tile", tileId: t1.id, occurredAt: STARTS_AT }));
    // Hidden: masked, with no progress, until earned.
    expect(myAchievements(bingo, alice.id).achievements.find((a) => a.key === "drop_detective")!).toMatchObject({ masked: true, progress: null });
    expect(earned(bingo, alice.id, "drop_detective")).toBe(false);

    at(STARTS_AT, "UTC", () => achievementService.recordPageOpened(db, { bingoId: bingo.id, userId: alice.id, teamId: team.id, kind: "tile", tileId: t2.id, occurredAt: STARTS_AT }));
    expect(earned(bingo, alice.id, "drop_detective")).toBe(true);
    expect(myAchievements(bingo, alice.id).achievements.find((a) => a.key === "drop_detective")!.progress).toEqual({ current: 2, target: 2 });
  });

  it("Rules lawyer / Number cruncher (both hidden) are earned opening the Rules / Stats page, only for a Player on a team", () => {
    const { bingo, team, alice, carol } = seed();
    at(STARTS_AT, "UTC", () => achievementService.recordPageOpened(db, { bingoId: bingo.id, userId: alice.id, teamId: team.id, kind: "rules", occurredAt: STARTS_AT }));
    at(STARTS_AT, "UTC", () => achievementService.recordPageOpened(db, { bingoId: bingo.id, userId: alice.id, teamId: team.id, kind: "stats", occurredAt: STARTS_AT }));
    expect(earned(bingo, alice.id, "rules_lawyer")).toBe(true);
    expect(earned(bingo, alice.id, "number_cruncher")).toBe(true);

    // carol is on Team B, not Team A — opening "as" Team A's page isn't hers to earn from.
    at(STARTS_AT, "UTC", () => achievementService.recordPageOpened(db, { bingoId: bingo.id, userId: carol.id, teamId: team.id, kind: "rules", occurredAt: STARTS_AT }));
    expect(earned(bingo, carol.id, "rules_lawyer")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Never revoked
// ---------------------------------------------------------------------------

describe("Never revoked", () => {
  it("rejecting a submission doesn't take Strong start away", () => {
    const { bingo, team, alice } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    const sub = submit(bingo, team.id, alice.id, leafId, itemName);
    db.update(schema.submissions).set({ status: "rejected" }).where(eq(schema.submissions.id, sub.id)).run();
    expect(earned(bingo, alice.id, "strong_start")).toBe(true);
  });

  it("un-reacting doesn't take Hypeman away", () => {
    const { bingo, team, alice, bob } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    const sub = submit(bingo, team.id, alice.id, leafId, itemName);
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, sub.id, bob.id, "🔥", true));
    at(STARTS_AT, "UTC", () => setSubmissionReaction(db, sub.id, bob.id, "🔥", false));
    expect(earned(bingo, bob.id, "hypeman")).toBe(true);
  });

  it("changing who a submission is credited to doesn't retroactively earn or revoke Partner slayer", () => {
    const { bingo, team, alice, bob, captain } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    const sub = submit(bingo, team.id, alice.id, leafId, itemName, { postedByUserId: bob.id }); // bob posts for alice
    expect(earned(bingo, bob.id, "partner_slayer")).toBe(true);

    changeSubmissionAttribution(db, bingo, { submissionId: sub.id, userId: captain.id, changedByUserId: captain.id }); // mod re-credits it to captain
    expect(earned(bingo, bob.id, "partner_slayer")).toBe(true); // bob keeps it — he did earn it, at the time
    expect(earned(bingo, captain.id, "strong_start")).toBe(false); // captain never posted anything themselves
  });
});

// ---------------------------------------------------------------------------
// Switch semantics
// ---------------------------------------------------------------------------

describe("Switch semantics", () => {
  it("an Achievement never switched on in this bingo is never earned", () => {
    const { bingo, team, alice } = seed();
    db.transaction((tx) => achievementService.restrictAchievementSettingsTo(tx, bingo.id, ACHIEVEMENT_KEYS.filter((k) => k !== "strong_start")));
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, alice.id, leafId, itemName);
    expect(earned(bingo, alice.id, "strong_start")).toBe(false);
  });

  it("switching one off hides it from reads, but earning keeps happening; switching back on reveals it", () => {
    const { bingo, team, alice } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, alice.id, leafId, itemName);
    expect(earned(bingo, alice.id, "strong_start")).toBe(true);

    db.transaction((tx) => achievementService.applyAchievementSwitches(tx, bingo.id, { strong_start: false }));
    expect(myAchievements(bingo, alice.id).achievements.find((a) => a.key === "strong_start")).toBeUndefined(); // hidden entirely

    db.transaction((tx) => achievementService.applyAchievementSwitches(tx, bingo.id, { strong_start: true }));
    expect(earned(bingo, alice.id, "strong_start")).toBe(true); // reappears, still earned — never re-evaluated
  });

  it("the whole feature switched off hides everything from counts too", () => {
    const { bingo, team, alice } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    submit(bingo, team.id, alice.id, leafId, itemName);
    db.update(schema.bingos).set({ achievementsEnabled: false }).where(eq(schema.bingos.id, bingo.id)).run();
    expect(achievementService.getAchievementCount(db, getBingo(bingo.id), alice.id)).toBeNull();
    expect(myAchievements(bingo, alice.id)).toEqual({ achievements: [], unshownPopups: [] });
  });

  it("switched on mid-bingo counts only activity from then on, not before", () => {
    const { bingo, team, bob } = seed();
    db.transaction((tx) => achievementService.restrictAchievementSettingsTo(tx, bingo.id, ACHIEVEMENT_KEYS.filter((k) => k !== "eager_beaver")));
    const t = tileWithLeaf(bingo.id, 0, 0);
    const before = new Date(STARTS_AT.getTime() - 60_000);
    at(before, "UTC", () => setTileInterest(db, team.id, bob.id, t.tile.id, t.leafId, true)); // before the key is switched on at all
    expect(earned(bingo, bob.id, "eager_beaver")).toBe(false);

    const switchedOnAt = STARTS_AT;
    db.transaction((tx) => achievementService.applyAchievementSwitches(tx, bingo.id, { eager_beaver: true }, switchedOnAt));
    at(before, "UTC", () => setTileInterest(db, team.id, bob.id, t.tile.id, t.leafId, false)); // toggle off, still using the old (pre-switch) timestamp
    expect(earned(bingo, bob.id, "eager_beaver")).toBe(false); // this event's own occurredAt still predates the cutoff

    at(new Date(switchedOnAt.getTime() + 60_000), "UTC", () => setTileInterest(db, team.id, bob.id, t.tile.id, t.leafId, true)); // after
    expect(earned(bingo, bob.id, "eager_beaver")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Popups
// ---------------------------------------------------------------------------

describe("Popup queue", () => {
  it("lists earned-but-not-shown popups oldest first, and mark-shown drains them", () => {
    const { bingo, team, alice, bob } = seed();
    const a = tileWithLeaf(bingo.id, 0, 0);
    const b = tileWithLeaf(bingo.id, 0, 1);
    const noon = new Date(STARTS_AT.getTime() + 12 * 3_600_000); // outside Night owl/Early bird's ranges
    submit(bingo, team.id, alice.id, a.leafId, a.itemName, { postedByUserId: bob.id, now: noon }); // strong_start + partner_slayer for bob
    submit(bingo, team.id, bob.id, b.leafId, b.itemName, { now: new Date(noon.getTime() + 1000) }); // globetrotter progress only, no new earn

    const popups = myAchievements(bingo, bob.id).unshownPopups;
    expect(popups).toEqual(["strong_start", "partner_slayer"]);

    achievementService.markPopupsShown(db, bingo.id, bob.id, ["strong_start"]);
    expect(myAchievements(bingo, bob.id).unshownPopups).toEqual(["partner_slayer"]);
    achievementService.markPopupsShown(db, bingo.id, bob.id, ["partner_slayer"]);
    expect(myAchievements(bingo, bob.id).unshownPopups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

describe("Robustness", () => {
  it("a thrown error inside achievements does not fail createSubmission, and is reported to Sentry", () => {
    const { bingo, team, alice } = seed();
    const { leafId, itemName } = tileWithLeaf(bingo.id, 0, 0);
    vi.mocked(broadcast).mockImplementation((event) => {
      if (event.type === "achievements_changed") throw new Error("boom");
    });

    let submission: ReturnType<typeof createSubmission> | undefined;
    expect(() => {
      submission = submit(bingo, team.id, alice.id, leafId, itemName);
    }).not.toThrow();

    expect(submission?.id).toBeTruthy();
    expect(db.select().from(schema.submissions).where(eq(schema.submissions.id, submission!.id)).get()).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
    // The whole per-event transaction (activity + every achievement it could have earned) rolled back together.
    expect(earned(bingo, alice.id, "strong_start")).toBe(false);
  });
});
