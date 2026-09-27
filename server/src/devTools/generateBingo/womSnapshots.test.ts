import { describe, expect, it } from "vitest";
import { dropRateTable } from "../../services/luck/dropRates";
import { playerLuck } from "../../services/luck/luck";
import { Rng } from "./rng";
import { DAY, HOUR } from "./timeline";
import { fakeTimeline, type FakeTimelineInput } from "./womSnapshots";

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
