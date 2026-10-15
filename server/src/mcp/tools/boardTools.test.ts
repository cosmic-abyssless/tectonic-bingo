// bingo_board and team_progress on a seeded, Finished Bingo, checked against the services the board itself uses
// (boardService.getBoardTiles, teamService.getTeamProgress) so the tools can't drift from what Players see.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { bingos, claims, historicalStandings, submissions, tags, teams, users } from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { createCategory, createTask, createTile, generateLines, getBoardTiles, updateTileBonusPoints } from "../../services/boardService";
import { approveSubmission } from "../../services/scoringService";
import { createPointAdjustment, getTeamProgress } from "../../services/teamService";
import { McpToolError, type McpToolContext } from "../tool";
import { bingoBoard } from "./bingoBoard";
import { teamProgress } from "./teamProgress";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let ctx: McpToolContext;

const T0 = new Date("2026-06-01T12:00:00Z");
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

interface Seed {
  bingoId: string;
  teamA: string;
  teamB: string;
}

/**
 * A 1×2 board. "Wintertodt" (2-hour Freeze Period, 20-point Tile bonus): Page 1 (40) is "collect 200 burnt pages",
 * where a Pyromancer garb counts as 25, with a Proof screenshot and pre-load allowed; Page 2 (60) is "at least 2 of"
 * three uniques, its points withheld until Page 1 is complete. "Slayer" needs a Proof screenshot Tile-wide: a
 * Bludgeon axon (10, with a Piece value) and a Gold ring valued as a third of a Magus vestige (5). Lines are worth 15.
 *
 * Team A completes Slayer (so Column 2), gets 130 of the 200 pages and one of Page 2's uniques, with another pending,
 * plus a +5 Point adjustment. Team B completes Page 2 alone, so its points are withheld.
 */
function seed(): Seed {
  const user = (name: string, extra: Partial<typeof users.$inferInsert> = {}) =>
    db
      .insert(users)
      .values({ discordId: name, discordUsername: name, ...extra })
      .returning()
      .get().id;
  const mod = user("mod", { isAdmin: true });
  const alice = user("alice");
  const carol = user("carol");
  const bingo = db
    .insert(bingos)
    .values({
      slug: "winter",
      name: "Winter Bingo",
      boardRows: 1,
      boardCols: 2,
      createdByUserId: mod,
      stage: "live",
      startsAt: T0,
      rulesMarkdown: "# Rules\nScreenshots need the codeword.",
      exclusivityRulesJson: JSON.stringify([{ id: "r1", label: "Pets", itemNames: ["Phoenix"], scope: "tile" }]),
    })
    .returning()
    .get();
  const teamA = db.insert(teams).values({ bingoId: bingo.id, captainUserId: alice, name: "Team A", codeword: "a" }).returning().get().id;
  const teamB = db.insert(teams).values({ bingoId: bingo.id, captainUserId: carol, name: "Team B", codeword: "b" }).returning().get().id;
  // The Bludgeon axon's Piece value (Abyssal bludgeon ÷ 3) is one of the starter ones a migration adds.

  const category = createCategory(db, { bingoId: bingo.id, label: "Skilling" });
  const wt = createTile(db, {
    bingoId: bingo.id,
    name: "Wintertodt",
    boardRow: 0,
    boardCol: 0,
    categoryId: category.id,
    hasFreezePeriod: true,
    freezeDurationMinutes: 120,
    notes: "Mods: check the cart",
  });
  const slayer = createTile(db, { bingoId: bingo.id, name: "Slayer", boardRow: 0, boardCol: 1, requiresProof: true, proofNote: "Show your slayer task" });
  updateTileBonusPoints(db, wt.id, 20);
  const page1 = createTask(db, wt.id, {
    kind: "ALL",
    label: "Page 1",
    points: 40,
    notes: "Empty your cart first",
    allowsPreLoad: true,
    requiresProof: true,
    proofNote: "Empty cart",
    children: [
      {
        kind: "SUM",
        label: "Burnt pages",
        quantity: 200,
        children: [
          { kind: "ITEM", itemName: "Burnt page" },
          { kind: "ITEM", itemName: "Pyromancer garb", countsAs: 25 },
        ],
      },
    ],
  });
  const page2 = createTask(db, wt.id, {
    kind: "COUNT",
    label: "Page 2",
    description: "Any two uniques",
    points: 60,
    minCount: 2,
    pointsGateNodeId: page1.id,
    children: [
      { kind: "ITEM", itemName: "Phoenix" },
      { kind: "ITEM", itemName: "Tome of fire" },
      { kind: "ITEM", itemName: "Dragon axe" },
    ],
  });
  const axon = createTask(db, slayer.id, { kind: "ITEM", label: "Bludgeon", itemName: "Bludgeon axon", points: 10 });
  const ring = createTask(db, slayer.id, {
    kind: "ITEM",
    label: "Ring",
    itemName: "Gold ring",
    points: 5,
    valuedAs: { itemName: "Magus vestige", divisor: 3, source: "Duke" },
  });
  db.insert(tags).values({ bingoId: bingo.id, tileId: slayer.id, kind: "text", text: "secret-search-word" }).run();
  generateLines(db, bingo, 15);

  const leaf = (part: { children: { id: string; itemName: string | null; children: { id: string; itemName: string | null }[] }[] }, name: string) =>
    part.children.flatMap((c) => [c, ...c.children]).find((n) => n.itemName === name)!.id;
  const submit = (teamId: string, userId: string, nodeId: string, itemName: string, quantity: number, hours: number) => {
    vi.setSystemTime(at(hours));
    const id = db
      .insert(submissions)
      .values({ teamId, submittedByUserId: userId, submittedAt: at(hours) })
      .returning()
      .get().id;
    db.insert(claims).values({ submissionId: id, nodeId, itemName, quantity }).run();
    return id;
  };
  const approve = (id: string, hours: number) => {
    vi.setSystemTime(at(hours));
    approveSubmission(db, { submissionId: id, reviewedByUserId: mod });
  };

  approve(submit(teamA, alice, leaf(page1, "Pyromancer garb"), "Pyromancer garb", 4, 3), 4);
  approve(submit(teamA, alice, leaf(page1, "Burnt page"), "Burnt page", 30, 5), 6);
  approve(submit(teamA, alice, leaf(page2, "Phoenix"), "Phoenix", 1, 7), 8);
  submit(teamA, alice, leaf(page2, "Tome of fire"), "Tome of fire", 1, 9); // left pending
  approve(submit(teamA, alice, axon.id, "Bludgeon axon", 1, 10), 11);
  approve(submit(teamA, alice, ring.id, "Gold ring", 1, 12), 14);
  approve(submit(teamB, carol, leaf(page2, "Phoenix"), "Phoenix", 1, 15), 16);
  approve(submit(teamB, carol, leaf(page2, "Dragon axe"), "Dragon axe", 1, 17), 18);
  vi.setSystemTime(at(20));
  createPointAdjustment(db, { teamId: teamA, bingoId: bingo.id, amount: 5, reason: "Best screenshot", createdByUserId: mod });

  db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, bingo.id)).run();
  vi.setSystemTime(at(72));
  return { bingoId: bingo.id, teamA, teamB };
}

/** A Planning Bingo, which MCP access ("finished" scope) can't read. */
function seedPlanning() {
  const mod = db.select().from(users).get()!.id;
  const bingo = db
    .insert(bingos)
    .values({ slug: "next", name: "Next Bingo", boardRows: 1, boardCols: 1, createdByUserId: mod, stage: "planning" })
    .returning()
    .get();
  db.insert(teams).values({ bingoId: bingo.id, captainUserId: mod, name: "Team N", codeword: "n" }).run();
  createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 0 });
}

/** A Historical Bingo from another site that recorded only its Tiles' points and rules, and the final standings. */
function seedHistorical() {
  const mod = db.select().from(users).get()!.id;
  const bingo = db
    .insert(bingos)
    .values({ slug: "old", name: "Old Bingo", boardRows: 1, boardCols: 1, createdByUserId: mod, stage: "complete", historical: true })
    .returning()
    .get();
  const team = db.insert(teams).values({ bingoId: bingo.id, captainUserId: mod, name: "Old Team", codeword: "o" }).returning().get().id;
  const tile = createTile(db, { bingoId: bingo.id, name: "Corp", boardRow: 0, boardCol: 0 });
  db.update(schema.tiles).set({ rulesText: "Any Corp sigil" }).where(eq(schema.tiles.id, tile.id)).run();
  updateTileBonusPoints(db, tile.id, 50);
  db.insert(historicalStandings).values({ bingoId: bingo.id, teamId: team, place: 1, points: 500 }).run();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  ({ sqlite, db } = createTestDb());
  ctx = { db, user: db.insert(users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get(), scope: "all" };
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

describe("bingo_board", () => {
  it("gives each Tile's settings and its Parts' requirements, as the board has them", () => {
    const s = seed();
    const out = bingoBoard.run({ slug: "winter" }, ctx) as any;
    expect(out.bingo).toEqual({ slug: "winter", name: "Winter Bingo", stage: "complete", historical: false, rows: 1, columns: 2 });
    expect(out.tiles.map((t: any) => [t.tile, t.row, t.column])).toEqual([
      ["Wintertodt", 1, 1],
      ["Slayer", 1, 2],
    ]);

    const [wt, slayer] = out.tiles;
    expect(wt).toEqual({
      tile: "Wintertodt",
      row: 1,
      column: 1,
      category: "Skilling",
      freezeHours: 2,
      bonusPoints: 20,
      completesWhen: "all of",
      parts: [
        {
          rule: "all of",
          label: "Page 1",
          notes: "Empty your cart first",
          points: 40,
          allowsPreLoad: true,
          proofScreenshot: { note: "Empty cart" },
          tasks: [
            {
              rule: "collect 200 in total (duplicates count)",
              label: "Burnt pages",
              points: 0,
              quantity: 200,
              tasks: [
                { rule: "item", points: 0, item: "Burnt page" },
                { rule: "item", points: 0, item: "Pyromancer garb", countsAs: 25 },
              ],
            },
          ],
        },
        {
          rule: "at least 2 of",
          label: "Page 2",
          description: "Any two uniques",
          points: 60,
          minCount: 2,
          pointsOnlyAfter: "Wintertodt — Page 1",
          tasks: ["Phoenix", "Tome of fire", "Dragon axe"].map((item) => ({ rule: "item", points: 0, item })),
        },
      ],
    });
    expect(slayer).toMatchObject({ category: null, proofScreenshot: { note: "Show your slayer task" } });
    expect(slayer.freezeHours).toBeUndefined();
    expect(slayer.parts).toEqual([
      { rule: "item", label: "Bludgeon", points: 10, item: "Bludgeon axon", pieceValue: "Abyssal bludgeon ÷ 3" },
      { rule: "item", label: "Ring", points: 5, item: "Gold ring", valuedAs: { itemName: "Magus vestige", divisor: 3, source: "Duke" } },
    ]);

    // Every Part's points agree with the published board the site serves.
    const board = getBoardTiles(db, s.bingoId);
    for (const t of out.tiles) {
      const tile = board.find((b) => b.name === t.tile)!;
      expect(t.parts.map((p: any) => p.points)).toEqual(tile.node.children.map((c) => c.points));
    }

    expect(out.lines).toEqual([
      { line: "Row 1", bonus: 15, tiles: ["Wintertodt", "Slayer"] },
      { line: "Column 1", bonus: 15, tiles: ["Wintertodt"] },
      { line: "Column 2", bonus: 15, tiles: ["Slayer"] },
    ]);
    expect(out.exclusiveItems).toEqual([{ label: "Pets", scope: "one Tile", items: ["Phoenix"] }]);
    expect(out.rules).toBeUndefined();

    // Tags and Tile notes are never shown to Players, so they stay out.
    const json = JSON.stringify(out);
    expect(json).not.toContain("secret-search-word");
    expect(json).not.toContain("check the cart");
  });

  it("returns the rules text only on request", () => {
    seed();
    expect((bingoBoard.run({ slug: "winter", includeRules: true }, ctx) as any).rules).toBe("# Rules\nScreenshots need the codeword.");
  });

  it("filters Tiles by name and says when it left some out", () => {
    seed();
    const filtered = bingoBoard.run({ slug: "winter", tile: "SLAY" }, ctx) as any;
    expect(filtered.tiles.map((t: any) => t.tile)).toEqual(["Slayer"]);
    expect(filtered.lines).toHaveLength(3);
    const limited = bingoBoard.run({ slug: "winter", limit: 1 }, ctx) as any;
    expect(limited.tiles).toHaveLength(1);
    expect(limited.truncated).toMatch(/^Showing 1 of 2\./);
  });

  it("says a Historical Bingo's Parts weren't recorded, and gives each Tile's points and rules", () => {
    seed();
    seedHistorical();
    const out = bingoBoard.run({ slug: "old" }, { ...ctx, scope: "finished" }) as any;
    expect(out.parts).toMatch(/^Not recorded for historical Bingos/);
    expect(out.tiles).toEqual([{ tile: "Corp", row: 1, column: 1, category: null, rules: "Any Corp sigil", points: 50 }]);
  });
});

describe("team_progress", () => {
  it("matches the scoreboard and shows partial progress toward unfinished Parts", () => {
    const s = seed();
    const out = teamProgress.run({ slug: "winter", team: "team a" }, ctx) as any;
    const progress = getTeamProgress(db, s.teamA);
    expect(progress.totalPoints).toBe(10 + 5 + 15 + 5);
    expect(out).toMatchObject({ team: "Team A", totalPoints: progress.totalPoints, pointsFromBoard: progress.totalPoints - 5 });
    expect(out.lines).toEqual([{ line: "Column 2", completedAtHours: 14, points: 15 }]);
    expect(out.adjustments).toEqual([{ amount: 5, reason: "Best screenshot", atHours: 20 }]);
    expect(out.submissions).toEqual({ total: 6, approved: 5, rejected: 0, pending: 1 });

    const [wt, slayer] = out.tiles;
    expect(slayer).toMatchObject({ tile: "Slayer", complete: true, completedAtHours: 14, pointsAwarded: 15 });
    expect(slayer.parts.map((p: any) => [p.label, p.complete, p.completedAtHours, p.pointsAwarded, p.approvedQuantity])).toEqual([
      ["Bludgeon", true, 11, 10, 1],
      ["Ring", true, 14, 5, 1],
    ]);

    expect(wt).toMatchObject({ tile: "Wintertodt", complete: false, pointsAwarded: 0, bonusPoints: 20, bonusPointsAwarded: 0 });
    const [page1, page2] = wt.parts;
    expect(page1).toMatchObject({
      label: "Page 1",
      complete: false,
      pointsAwarded: 0,
      progress: { have: 0, need: 1 },
      approvedItems: [
        { item: "Burnt page", quantity: 30 },
        { item: "Pyromancer garb", quantity: 4 },
      ],
    });
    // 4 garbs counting as 25 each, plus 30 pages.
    expect(page1.tasks[0]).toMatchObject({ rule: "collect 200 in total (duplicates count)", progress: { have: 130, need: 200 } });
    expect(page1.tasks[0].tasks[1]).toMatchObject({ item: "Pyromancer garb", complete: true, approvedQuantity: 4 });
    expect(page2).toMatchObject({
      complete: false,
      progress: { have: 1, need: 2 },
      approvedItems: [{ item: "Phoenix", quantity: 1 }],
      pendingItems: [{ item: "Tome of fire", quantity: 1 }],
    });
    expect(page2.tasks[1]).toMatchObject({ item: "Tome of fire", complete: false, pendingItems: [{ item: "Tome of fire", quantity: 1 }] });

    // Every point the tiles show, plus Lines and adjustments, is the scoreboard's total.
    const tilePoints = out.tiles.reduce((sum: number, t: any) => sum + t.pointsAwarded, 0);
    expect(tilePoints + 15 + 5).toBe(progress.totalPoints);
  });

  it("names the Part a complete Part's withheld points wait for", () => {
    const s = seed();
    const out = teamProgress.run({ slug: "winter", team: "Team B" }, ctx) as any;
    expect(out.totalPoints).toBe(getTeamProgress(db, s.teamB).totalPoints);
    expect(out.totalPoints).toBe(0);
    expect(out.tiles[0].parts[1]).toMatchObject({
      label: "Page 2",
      complete: true,
      completedAtHours: 18,
      points: 60,
      pointsAwarded: 0,
      pointsWithheldUntil: "Wintertodt — Page 1",
    });
    expect(out.tiles[0].parts[1].progress).toBeUndefined();
  });

  it("lists the Teams when none has the name", () => {
    seed();
    expect(() => teamProgress.run({ slug: "winter", team: "Team C" }, ctx)).toThrow(McpToolError);
    expect(() => teamProgress.run({ slug: "winter", team: "Team C" }, ctx)).toThrow('No Team in this Bingo is named "Team C". Its Teams: Team A, Team B.');
  });

  it("filters Tiles by name and says when it left some out", () => {
    seed();
    expect((teamProgress.run({ slug: "winter", team: "Team A", tile: "winter" }, ctx) as any).tiles.map((t: any) => t.tile)).toEqual(["Wintertodt"]);
    const limited = teamProgress.run({ slug: "winter", team: "Team A", limit: 1 }, ctx) as any;
    expect(limited.tiles).toHaveLength(1);
    expect(limited.truncated).toMatch(/^Showing 1 of 2\./);
  });

  it("says a Historical Bingo never recorded Tile completion, and gives its recorded place", () => {
    seed();
    seedHistorical();
    const out = teamProgress.run({ slug: "old", team: "old team" }, { ...ctx, scope: "finished" }) as any;
    expect(out).toMatchObject({ team: "Old Team", recordedPlace: 1, totalPoints: 500, adjustments: [] });
    expect(out.tiles).toMatch(/^Not recorded for historical Bingos.*Tile completion/);
    expect(out.lines).toMatch(/^Not recorded for historical Bingos/);
    expect(out.submissions).toMatch(/^Not recorded for historical Bingos.*Submissions/);
  });
});

describe("both board tools", () => {
  const call = (tool: typeof bingoBoard | typeof teamProgress, slug: string, scope: McpToolContext["scope"]) =>
    tool === bingoBoard ? bingoBoard.run({ slug }, { ...ctx, scope }) : teamProgress.run({ slug, team: "Team N" }, { ...ctx, scope });

  it.each([bingoBoard, teamProgress])("refuses a Bingo that isn't Finished to MCP access, but not to a site admin ($name)", (tool) => {
    seed();
    seedPlanning();
    expect(() => call(tool, "next", "finished")).toThrow(McpToolError);
    expect(() => call(tool, "next", "finished")).toThrow('No Bingo you can read has the slug "next"');
    expect(() => call(tool, "next", "all")).not.toThrow();
    expect(() => call(tool, "nope", "all")).toThrow(McpToolError);
    expect(tool.bingoIdFor!({ slug: "winter" } as never, ctx)).toBe(db.select().from(bingos).where(eq(bingos.slug, "winter")).get()!.id);
  });
});
