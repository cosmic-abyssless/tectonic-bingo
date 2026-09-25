import { describe, expect, it } from "vitest";
import type { ApprovedClaim, EngineNode } from "../engine";
import { openItems } from "../openItems";
import type { WomSnapshot } from "../womService";
import { dropRateTable } from "./dropRates";
import { DRY_MIN_LUCK, gpWeight, luckOf, playerLuck, type LuckClaim, type LuckInput } from "./luck";

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

  it("counts the luckiest drop in full and each further one at half", () => {
    const timeline = [snap(-1, { vardorvis: 0 }), snap(40, { vardorvis: 10 }), snap(80, { vardorvis: 60 })];
    const spoon = luck([claim("Ultor vestige", 30), claim("Virtus mask", 70)], timeline)!.spoon!;
    const ultor = luckOf(10 / 1000);
    const virtus = luckOf(60 / 3000);
    expect(spoon.best.itemName).toBe("Ultor vestige");
    expect(spoon.value).toBeCloseTo(ultor + virtus / 2);
  });

  it("values rarity: one rare drop beats a common one at the same KC", () => {
    const timeline = [snap(-1, { zulrah: 0 }), snap(40, { zulrah: 5 })];
    const fang = luck([claim("Tanzanite fang", 30)], timeline)!.spoon!.value;
    const scales = luck([claim("Zulrah's scales", 30)], timeline)!.spoon!.value;
    expect(fang).toBeGreaterThan(scales);
    expect(scales).toBeGreaterThanOrEqual(0);
  });

  it("adds up an Item's bosses", () => {
    const timeline = [snap(-1, { callisto: 0, venenatis: 0 }), snap(40, { callisto: 50, venenatis: 50 })];
    const spoon = luck([claim("Dragon pickaxe", 30)], timeline)!.spoon!;
    expect(spoon.best.kills).toBe(100);
    expect(spoon.value).toBeCloseTo(luckOf(100 / 300));
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
    expect(-10 * Math.log10(0.97)).toBeLessThan(DRY_MIN_LUCK);
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
    const timeline = [snap(-1, { general_graardor: 0 }), snap(10, { general_graardor: 20 }), snap(20, { general_graardor: 40 }), snap(30, { general_graardor: 60 })];
    const boots = claim("Bandos boots", 30, { taskNodeId: "set" });
    const clutch = clutchFor([claim("Bandos chestplate", 10, { taskNodeId: "set" }), claim("Bandos tassets", 20, { taskNodeId: "set" }), boots], timeline)!;
    // Each piece took 20 kills; the first had 3 open Items to hit, the last only 1.
    expect(clutch.drop.claimId).toBe(boots.claimId);
    expect(clutch.drop.luck).toBeCloseTo(luckOf(20 * (1 / 100)));
    expect(clutch.drop.luck).toBeGreaterThan(luckOf(20 * (3 / 100)));
  });

  it("gives no Clutch luck to a Claim that advanced nothing", () => {
    const timeline = [snap(-1, { general_graardor: 0 }), snap(15, { general_graardor: 1 })];
    expect(clutchFor([claim("Bandos boots", 10)], timeline)).toBeNull();
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
