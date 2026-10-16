import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { createTask, createTile } from "../../services/boardService";
import { computeEffort } from "../../services/effortService";
import { dropRateTable } from "../../services/luck/dropRates";
import { playerLuck } from "../../services/luck/luck";
import { Rng } from "./rng";
import { DAY, HOUR } from "./timeline";
import { fakeTimeline, fillFakeWomSnapshots, type FakeTimelineInput } from "./womSnapshots";

const rates = dropRateTable({
  Vardorvis: { "Ultor vestige": 1 / 1000, "Virtus mask": 1 / 3000 },
  "General Graardor": { "Bandos chestplate": 1 / 100 },
});
const START = new Date("2026-01-01T00:00:00Z");
const END = new Date(START.getTime() + 7 * DAY);
const input = (drops: FakeTimelineInput["drops"]): FakeTimelineInput => ({ start: START, end: END, drops, boardItems: ["Ultor vestige", "Virtus mask", "Bandos chestplate"], rates });
const drops = [
  { itemName: "Bandos chestplate", at: new Date(START.getTime() + 20 * HOUR) },
  { itemName: "Ultor vestige", at: new Date(START.getTime() + 3 * DAY) },
];

describe("fakeTimeline", () => {
  it("gives some Players kills at Wrapped's raids and bosses, and leaves the rest of their timeline as it was", () => {
    const wrappedBosses = ["chambers_of_xeric", "nex"];
    let raiders = 0;
    for (let seed = 0; seed < 50; seed++) {
      const plain = fakeTimeline(new Rng(seed), input(drops));
      const timeline = fakeTimeline(new Rng(seed), { ...input(drops), wrappedBosses });
      const gained = wrappedBosses.some((m) => (timeline.at(-1)!.bossKills[m] ?? 0) > (timeline[0]!.bossKills[m] ?? 0));
      if (gained) raiders++;
      // The total EHB includes the raids' hours, so it's compared without them.
      const others = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([m]) => !wrappedBosses.includes(m)));
      const without = (t: typeof timeline) =>
        t.map((s) => ({ ...s, bossKills: others(s.bossKills), bossEhb: others(s.bossEhb), ehb: s.ehb! - wrappedBosses.reduce((sum, m) => sum + (s.bossEhb[m] ?? 0), 0) }));
      expect(without(timeline).map((s) => s.ehb)).toEqual(without(plain).map((s) => expect.closeTo(s.ehb, 9)));
      const exact = (t: typeof timeline) => without(t).map((s) => ({ ...s, ehb: 0 }));
      expect(exact(timeline)).toEqual(exact(plain));
    }
    expect(raiders).toBeGreaterThan(10);
    expect(raiders).toBeLessThan(40);
  });

  it("gives each ranked boss its kills over its kills an hour as EHB, and counts it in the total", () => {
    for (let seed = 0; seed < 50; seed++) {
      const timeline = fakeTimeline(new Rng(seed), input(drops));
      let prevOther = -Infinity;
      for (const s of timeline) {
        for (const [metric, kills] of Object.entries(s.bossKills)) {
          if (kills === null) expect(s.bossEhb[metric]).toBeUndefined();
          else expect(s.bossEhb[metric]).toBeCloseTo(kills / ({ vardorvis: 41, general_graardor: 50 } as Record<string, number>)[metric]!, 9);
        }
        // The rest of the total is time at bosses the generator doesn't model, which never goes backwards.
        const other = s.ehb! - Object.values(s.bossEhb).reduce((sum, h) => sum + h, 0);
        expect(other).toBeGreaterThanOrEqual(prevOther - 1e-9);
        prevOther = other;
      }
    }
  });

  it("keeps a Player's hours at the bosses to what the Bingo had time for, even at a raid", () => {
    const raidRates = dropRateTable({ "Theatre of Blood": { "Avernic defender hilt": 1 / 50, "Scythe of vitur (uncharged)": 1 / 2000 } });
    const raid = { start: START, end: END, boardItems: ["Avernic defender hilt", "Scythe of vitur (uncharged)"], rates: raidRates };
    for (let seed = 0; seed < 100; seed++) {
      const timeline = fakeTimeline(new Rng(seed), { ...raid, drops: [{ itemName: "Avernic defender hilt", at: new Date(START.getTime() + DAY) }] });
      const before = timeline.filter((s) => s.at <= START).at(-1)!;
      const gained = Object.values(timeline.at(-1)!.bossEhb).reduce((sum, h) => sum + h, 0) - Object.values(before.bossEhb).reduce((sum, h) => sum + h, 0);
      expect(gained).toBeLessThan((END.getTime() - START.getTime()) / HOUR / 2);
    }
  });

  it("is the same for the same seed", () => {
    expect(fakeTimeline(new Rng(7), input(drops))).toEqual(fakeTimeline(new Rng(7), input(drops)));
  });

  it("starts with a baseline before the start, and never goes backwards", () => {
    for (let seed = 0; seed < 50; seed++) {
      const timeline = fakeTimeline(new Rng(seed), input(drops));
      expect(timeline[0]!.at < START).toBe(true);
      expect(timeline.at(-1)!.at <= END).toBe(true);
      for (let i = 1; i < timeline.length; i++) {
        const [prev, cur] = [timeline[i - 1]!, timeline[i]!];
        expect(cur.at > prev.at).toBe(true);
        for (const [metric, kills] of Object.entries(cur.bossKills)) expect(kills ?? 0).toBeGreaterThanOrEqual(prev.bossKills[metric] ?? 0);
        expect(cur.clues!).toBeGreaterThanOrEqual(prev.clues!);
      }
    }
  });

  it("kills at the boss before each drop, and has a snapshot after it", () => {
    for (let seed = 0; seed < 50; seed++) {
      const timeline = fakeTimeline(new Rng(seed), input(drops));
      const before = timeline.filter((s) => s.at <= START).at(-1)!;
      const after = timeline.find((s) => s.at >= drops[1]!.at)!;
      expect(after).toBeDefined();
      expect((after.bossKills.vardorvis ?? 0) - (before.bossKills.vardorvis ?? 0)).toBeGreaterThan(0);
    }
  });

  it("gives drops a spread of luck, mostly near the odds and some lucky", () => {
    const lucks: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const timeline = fakeTimeline(new Rng(seed), input(drops));
      const claims = drops.map((d, i) => ({ claimId: `c${i}`, userId: "p", itemName: d.itemName, at: d.at, taskNodeId: null, gpValue: null }));
      const spoon = playerLuck({ rates, bingoStart: START, bingoEnd: END, now: END, claims, timelines: new Map([["p", timeline]]), boardItems: [], openItemsAt: () => new Set(), weights: { spoonDecay: 0.5, spoonMinLuck: 0, dryMinLuck: 1, clutchMinLuck: 1 } }).get("p")?.spoon;
      lucks.push(spoon?.value ?? 0);
    }
    lucks.sort((a, b) => a - b);
    // The median near the odds (the time there was caps the kills, so rare drops lean lucky), the luckiest past 1 in 100.
    expect(lucks[100]!).toBeLessThan(2);
    expect(lucks[195]!).toBeGreaterThan(2);
  });

  it("keeps dry streaks to what the Board's drop rates make likely", () => {
    const dries: number[] = [];
    for (let seed = 0; seed < 300; seed++) {
      const timeline = fakeTimeline(new Rng(seed), input([]));
      const dry = playerLuck({ rates, bingoStart: START, bingoEnd: END, now: END, claims: [], timelines: new Map([["p", timeline]]), boardItems: ["Ultor vestige", "Virtus mask", "Bandos chestplate"], openItemsAt: () => new Set(), weights: { spoonDecay: 0.5, spoonMinLuck: 1, dryMinLuck: 0, clutchMinLuck: 1 } }).get("p")?.dry;
      if (dry) dries.push(dry.value);
    }
    dries.sort((a, b) => a - b);
    expect(dries.length).toBeGreaterThan(30);
    // A streak is one draw of the kills until the next drop, so past 1 in 10,000 is all but impossible.
    expect(dries.at(-1)!).toBeLessThan(4);
  });
});

// A generated Bingo's stored snapshots carry each boss's EHB, so a Finished one shows Effort (CONTEXT.md "Effort").
describe("fillFakeWomSnapshots", () => {
  it("stores each boss's EHB, which gives the Players an Effort", () => {
    const { sqlite, db } = createTestDb();
    try {
      const user = (name: string) => db.insert(schema.users).values({ discordId: `testdata-${name}`, discordUsername: name }).returning().get().id;
      const admin = user("admin");
      const startsAt = new Date(Date.now() - 10 * DAY);
      const endsAt = new Date(Date.now() - DAY);
      const bingo = db
        .insert(schema.bingos)
        .values({ slug: "testdata-effort", name: "E", boardRows: 1, boardCols: 1, createdByUserId: admin, stage: "complete", startsAt, endsAt })
        .returning()
        .get();
      const tile = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 0 });
      createTask(db, tile.id, { kind: "ITEM", label: "Head", points: 10, itemName: "Vorkath's head" }, 0);
      const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: admin, name: "T", codeword: "t" }).returning().get().id;
      const players = Array.from({ length: 12 }, (_, i) => user(`p${i}`));
      db.insert(schema.teamMembers).values(players.map((userId) => ({ teamId: team, userId }))).run();

      fillFakeWomSnapshots(db, bingo.slug, 11);
      const rows = db.select().from(schema.womSnapshots).all();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.bossEhbJson !== null)).toBe(true);
      const effort = computeEffort(db, db.select().from(schema.bingos).all()[0]!)!;
      expect(effort.players.size).toBe(players.length);
      expect([...effort.players.values()].filter((e) => e.hours > 0).length).toBeGreaterThan(0);
    } finally {
      sqlite.close();
    }
  });
});
