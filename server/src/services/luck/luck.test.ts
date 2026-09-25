import { describe, expect, it } from "vitest";
import type { ApprovedClaim, EngineNode } from "../engine";
import { openItems } from "../openItems";
import type { WomSnapshot } from "../womService";
import { dropRateTable } from "./dropRates";
import { DEFAULT_LUCK_WEIGHTS, gpWeight, luckOf, playerLuck, type LuckClaim, type LuckInput } from "./luck";

const rates = dropRateTable({
  Vardorvis: { "Ultor vestige": 1 / 1000, "Virtus mask": 1 / 3000 },
  "General Graardor": { "Bandos chestplate": 1 / 100, "Bandos tassets": 1 / 100, "Bandos boots": 1 / 100 },
  Callisto: { "Dragon pickaxe": 1 / 300 },
  Venenatis: { "Dragon pickaxe": 1 / 300 },
  Zulrah: { "Zulrah's scales": 1, "Tanzanite fang": 1 / 1000 },
});

const at = (minute: number) => new Date(2026, 0, 1, 0, minute);
const START = at(0);
const snap = (minute: number, kills: Record<string, number | null>): WomSnapshot => ({ at: at(minute), bossKills: kills, ehb: null, ehp: null, clues: null });

let seq = 0;
function claim(itemName: string, minute: number, extra: Partial<LuckClaim> = {}): LuckClaim {
  seq += 1;
  return { claimId: `c${seq}`, userId: "p1", itemName, at: at(minute), taskNodeId: null, gpValue: null, ...extra };
}

function luck(claims: LuckClaim[], timeline: WomSnapshot[], extra: Partial<LuckInput> = {}) {
  const input: LuckInput = {
    rates,
    bingoStart: START,
    bingoEnd: null,
    now: at(10_000),
    claims,
    timelines: new Map([["p1", timeline]]),
    boardItems: [],
    openItemsAt: () => new Set(),
    ...extra,
  };
  return playerLuck(input).get("p1");
}

describe("luckOf", () => {
  it("is −log₁₀ of the chance of at least one drop", () => {
    expect(luckOf(0.01)).toBeCloseTo(-Math.log10(1 - Math.exp(-0.01)), 10);
    expect(10 ** luckOf(0.01)).toBeCloseTo(100.5, 1);
    expect(luckOf(1)).toBeCloseTo(0.2, 2);
  });

  it("stays accurate for tiny chances", () => {
    expect(luckOf(1e-9)).toBeCloseTo(9, 6);
  });
});

describe("Spoon", () => {
  it("judges a drop by its own rate over the kills it took", () => {
    const spoon = luck([claim("Ultor vestige", 30)], [snap(-1, { vardorvis: 100 }), snap(40, { vardorvis: 110 })])!.spoon!;
    expect(spoon.best.kills).toBe(10);
    expect(spoon.best.oneIn).toBeCloseTo(100.5, 1);
    expect(spoon.value).toBeCloseTo(luckOf(0.01));
  });

  it("reads the drop's KC from the first snapshot after it, so grinding on doesn't erase it", () => {
    const timeline = [snap(-1, { vardorvis: 100 }), snap(40, { vardorvis: 110 }), snap(500, { vardorvis: 400 })];
    expect(luck([claim("Ultor vestige", 30)], timeline)!.spoon!.best.kills).toBe(10);
  });

  it("measures a repeat drop from the previous one", () => {
    const timeline = [snap(-1, { vardorvis: 0 }), snap(30, { vardorvis: 100 }), snap(50, { vardorvis: 102 })];
    const second = claim("Ultor vestige", 45);
    const spoon = luck([claim("Ultor vestige", 30), second], timeline)!.spoon!;
    // 102 at the second drop, less 100 at the first: a back-to-back spoon.
    expect(spoon.best.claimId).toBe(second.claimId);
    expect(spoon.best.kills).toBe(2);
  });

  it("counts the luckiest drop in full, the next at half, the one after at a quarter", () => {
    const timeline = [snap(-1, { vardorvis: 0 }), snap(40, { vardorvis: 10 }), snap(80, { vardorvis: 60 }), snap(120, { vardorvis: 360 })];
    const spoon = luck([claim("Ultor vestige", 30), claim("Virtus mask", 70), claim("Ultor vestige", 110)], timeline)!.spoon!;
    const ultor = luckOf(10 / 1000);
    const virtus = luckOf(60 / 3000);
    const secondUltor = luckOf(350 / 1000);
    expect(spoon.best.itemName).toBe("Ultor vestige");
    expect(spoon.value).toBeCloseTo(ultor + virtus / 2 + secondUltor / 4);
  });

  it("never lets a pile of ordinary drops beat one rare drop", () => {
    // Ten drops, each 20 kills after the last at 1/100 (1 in ~5.5), against one Ultor at 10 KC (1 in ~100).
    const snaps = [snap(-1, { general_graardor: 0 }), ...Array.from({ length: 10 }, (_, i) => snap(10 * (i + 1), { general_graardor: 20 * (i + 1) }))];
    const pile = luck(Array.from({ length: 10 }, (_, i) => claim("Bandos boots", 10 * (i + 1))), snaps)!.spoon!.value;
    const rare = luck([claim("Ultor vestige", 30)], [snap(-1, { vardorvis: 0 }), snap(40, { vardorvis: 10 })])!.spoon!.value;
    expect(pile).toBeLessThan(2 * luckOf(20 / 100));
    expect(rare).toBeGreaterThan(pile);
  });

  it("needs at least 1 in 10 in total", () => {
    // A 1/100 drop right on rate is about 1 in 1.6.
    const timeline = [snap(-1, { general_graardor: 0 }), snap(40, { general_graardor: 100 })];
    expect(luck([claim("Bandos boots", 30)], timeline)!.spoon).toBeNull();
    expect(luck([claim("Bandos boots", 30)], timeline, { weights: { ...DEFAULT_LUCK_WEIGHTS, spoonMinLuck: 0 } })!.spoon!.best.oneIn).toBeCloseTo(1.6, 1);
  });

  it("values rarity: one rare drop beats a common one at the same KC", () => {
    const timeline = [snap(-1, { zulrah: 0 }), snap(40, { zulrah: 5 })];
    const noFloor = { weights: { ...DEFAULT_LUCK_WEIGHTS, spoonMinLuck: 0 } };
    const fang = luck([claim("Tanzanite fang", 30)], timeline, noFloor)!.spoon!.value;
    const scales = luck([claim("Zulrah's scales", 30)], timeline, noFloor)!.spoon!.value;
    expect(fang).toBeGreaterThan(scales);
    expect(scales).toBeGreaterThanOrEqual(0);
  });

  it("adds up an Item's bosses", () => {
    const timeline = [snap(-1, { callisto: 0, venenatis: 0 }), snap(40, { callisto: 10, venenatis: 10 })];
    const spoon = luck([claim("Dragon pickaxe", 30)], timeline)!.spoon!;
    expect(spoon.best.kills).toBe(20);
    expect(spoon.value).toBeCloseTo(luckOf(20 / 300));
  });

  it("leaves out Items no tracked boss drops", () => {
    expect(luck([claim("Abyssal whip", 30)], [snap(-1, {}), snap(40, {})])!.spoon).toBeNull();
  });

  it("waits for a snapshot after the drop before judging it", () => {
    expect(luck([claim("Ultor vestige", 30)], [snap(-1, { vardorvis: 100 })])!.spoon).toBeNull();
  });

  it("can't judge a drop without a snapshot before the Bingo", () => {
    expect(luck([claim("Ultor vestige", 30)], [snap(10, { vardorvis: 100 }), snap(40, { vardorvis: 110 })])!.spoon).toBeNull();
  });

  it("judges a drop with no kills gained as one kill", () => {
    const spoon = luck([claim("Ultor vestige", 30)], [snap(-1, { vardorvis: 100 }), snap(40, { vardorvis: 100 })])!.spoon!;
    expect(spoon.best.kills).toBe(1);
    expect(spoon.value).toBeCloseTo(luckOf(1 / 1000));
  });

  it("gives no luck to a Player without snapshots", () => {
    expect(luck([claim("Ultor vestige", 30)], [])).toBeUndefined();
  });
});

describe("Dry", () => {
  const board = ["Bandos chestplate", "Bandos tassets", "Bandos boots", "Ultor vestige"];

  it("measures the streak against every Board Item the boss drops", () => {
    const dry = luck([], [snap(-1, { general_graardor: 0 }), snap(100, { general_graardor: 500 })], { boardItems: board })!.dry!;
    expect(dry.metric).toBe("general_graardor");
    expect(dry.kills).toBe(500);
    expect(dry.value).toBeCloseTo(-500 * Math.log10(0.97));
  });

  it("resets on a Board drop from that boss", () => {
    const timeline = [snap(-1, { general_graardor: 0 }), snap(50, { general_graardor: 400 }), snap(100, { general_graardor: 500 })];
    const dry = luck([claim("Bandos boots", 40)], timeline, { boardItems: board })!.dry!;
    expect(dry.kills).toBe(100);
  });

  it("goes to the worst boss", () => {
    const timeline = [snap(-1, { general_graardor: 0, vardorvis: 0 }), snap(100, { general_graardor: 100, vardorvis: 5000 })];
    expect(luck([], timeline, { boardItems: board })!.dry!.metric).toBe("vardorvis");
  });

  it("needs a streak of at least 1 in 10", () => {
    const timeline = [snap(-1, { general_graardor: 0 }), snap(100, { general_graardor: 10 })];
    expect(-10 * Math.log10(0.97)).toBeLessThan(DEFAULT_LUCK_WEIGHTS.dryMinLuck);
    expect(luck([], timeline, { boardItems: board })!.dry).toBeNull();
  });

  it("freezes at the Bingo's end", () => {
    const timeline = [snap(-1, { general_graardor: 0 }), snap(100, { general_graardor: 200 }), snap(300, { general_graardor: 900 })];
    expect(luck([], timeline, { boardItems: board, bingoEnd: at(200) })!.dry!.kills).toBe(200);
  });

  it("ignores bosses whose Board Items it always drops", () => {
    const timeline = [snap(-1, { zulrah: 0 }), snap(100, { zulrah: 5000 })];
    expect(luck([], timeline, { boardItems: ["Zulrah's scales", "Tanzanite fang"] })!.dry).toBeNull();
  });

  it("ignores bosses that drop nothing on the Board", () => {
    const timeline = [snap(-1, { callisto: 0 }), snap(100, { callisto: 5000 })];
    expect(luck([], timeline, { boardItems: board })!.dry).toBeNull();
  });
});

describe("Clutch", () => {
  // One Task: the whole Bandos set, one piece at a time.
  const nodes: EngineNode[] = [
    { id: "set", kind: "ALL", minCount: null, quantity: null, itemName: null, points: 10, pointsGateNodeId: null },
    ...["Bandos chestplate", "Bandos tassets", "Bandos boots"].map((itemName) => ({ id: itemName, kind: "ITEM" as const, minCount: null, quantity: null, itemName, points: 0, pointsGateNodeId: null })),
  ];
  const childrenOf = new Map([["set", ["Bandos chestplate", "Bandos tassets", "Bandos boots"]]]);

  function clutchFor(claims: LuckClaim[], timeline: WomSnapshot[]) {
    const approved: ApprovedClaim[] = claims.map((c) => ({ nodeId: c.itemName, itemName: c.itemName, quantity: 1, reviewedAt: c.at }));
    return luck(claims, timeline, { openItemsAt: (taskNodeId, when) => openItems(nodes, childrenOf, approved, when).get(taskNodeId) ?? new Set() })!.clutch;
  }

  it("judges the last missing piece as rarer than the first", () => {
    const timeline = [snap(-1, { general_graardor: 0 }), snap(10, { general_graardor: 5 }), snap(20, { general_graardor: 10 }), snap(30, { general_graardor: 15 })];
    const boots = claim("Bandos boots", 30, { taskNodeId: "set" });
    const clutch = clutchFor([claim("Bandos chestplate", 10, { taskNodeId: "set" }), claim("Bandos tassets", 20, { taskNodeId: "set" }), boots], timeline)!;
    // Each piece took 5 kills; the first had 3 open Items to hit, the last only 1.
    expect(clutch.drop.claimId).toBe(boots.claimId);
    expect(clutch.drop.luck).toBeCloseTo(luckOf(5 * (1 / 100)));
    expect(clutch.drop.luck).toBeGreaterThan(luckOf(5 * (3 / 100)));
  });

  it("gives no Clutch luck to a Claim that advanced nothing", () => {
    const timeline = [snap(-1, { general_graardor: 0 }), snap(15, { general_graardor: 1 })];
    expect(clutchFor([claim("Bandos boots", 10)], timeline)).toBeNull();
  });

  it("leaves out a drop that wasn't 1 in 10, however much it's worth", () => {
    // 50 kills at 1/100 on the last piece: about 1 in 2.5.
    const timeline = [snap(-1, { general_graardor: 0 }), snap(15, { general_graardor: 50 })];
    const claims = [claim("Bandos boots", 10, { taskNodeId: "boots", gpValue: 5_000_000_000 })];
    expect(luck(claims, timeline, { openItemsAt: () => new Set(["Bandos boots"]) })!.clutch).toBeNull();
  });

  it("weights the drop by its GP value and keeps the single best", () => {
    const timeline = [snap(-1, { vardorvis: 0, general_graardor: 0 }), snap(15, { vardorvis: 100, general_graardor: 100 })];
    const claims = [
      claim("Ultor vestige", 10, { taskNodeId: "ultor", gpValue: 100_000_000 }),
      claim("Bandos boots", 10, { taskNodeId: "boots", gpValue: 20_000 }),
    ];
    const clutch = luck(claims, timeline, { openItemsAt: (taskNodeId) => new Set([taskNodeId === "ultor" ? "Ultor vestige" : "Bandos boots"]) })!.clutch!;
    expect(clutch.drop.itemName).toBe("Ultor vestige");
    expect(clutch.value).toBeCloseTo(luckOf(100 / 1000) * 3);
    expect(clutch.gpValue).toBe(100_000_000);
  });
});

describe("gpWeight", () => {
  it("steps up once per tenfold from 1m, from ×1 to ×4", () => {
    expect(gpWeight(null)).toBe(1);
    expect(gpWeight(0)).toBe(1);
    expect(gpWeight(500_000)).toBe(1);
    expect(gpWeight(1_000_000)).toBe(1);
    expect(gpWeight(10_000_000)).toBeCloseTo(2);
    expect(gpWeight(100_000_000)).toBeCloseTo(3);
    expect(gpWeight(1_000_000_000)).toBeCloseTo(4);
    expect(gpWeight(5_000_000_000)).toBe(4);
  });
});
