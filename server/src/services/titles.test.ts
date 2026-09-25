import { describe, expect, it } from "vitest";
import { chipTitles, DEFAULT_TITLE_SETTINGS, oneIn, pickTitles, shortGp, TITLES, titlesHeldBy, type LuckFacts, type PlayerTitleFacts, type TitleAwardFact, type TitleContext, type TitleId } from "@bingo/shared";

const HOUR = 60 * 60 * 1000;
const LIVE_AT = new Date("2026-01-01T00:00:00Z");
const at = (hours: number) => new Date(LIVE_AT.getTime() + hours * HOUR);
const live = (hours: number): TitleContext => ({ now: at(hours), liveAt: LIVE_AT, endedAt: null });

function player(userId: string, facts: Partial<PlayerTitleFacts> = {}): PlayerTitleFacts {
  return {
    userId,
    teamId: "team",
    pointsShare: 0,
    teamAwardPoints: 100,
    awards: [],
    approvedSubmissions: 0,
    rejectedSubmissions: 0,
    postedForTeammates: 0,
    distinctItems: 0,
    totalQuantity: 0,
    wom: null,
    luck: null,
    achievements: null,
    ...facts,
  };
}

function award(points: number, hours: number, extra: Partial<TitleAwardFact> = {}): TitleAwardFact {
  return { kind: "task", tileNodeId: "t1", tileName: "Zulrah", points, completedAt: at(hours).toISOString(), closed: false, ...extra };
}

const TITLE_BY_ID = (id: TitleId) => TITLES.find((t) => t.id === id)!;
const holdersOf = (pool: PlayerTitleFacts[], id: TitleId, ctx = live(48)) => pickTitles(pool, ctx).find((p) => p.title.id === id)?.holders.map((h) => h.userId);

describe("Overachiever", () => {
  const earned = (n: number, hours: number) => ({ achievements: { earned: n, lastEarnedAt: at(hours).toISOString() } });

  it("goes to the Player with the most Achievements", () => {
    const pool = [player("a", earned(6, 5)), player("b", earned(8, 9)), player("c", earned(7, 1))];
    expect(holdersOf(pool, "overachiever")).toEqual(["b"]);
  });

  it("isn't shared: of the Players tied at the most, whoever reached that count first holds it", () => {
    const pool = [player("a", earned(8, 12)), player("b", earned(8, 3)), player("c", earned(8, 7))];
    expect(holdersOf(pool, "overachiever")).toEqual(["b"]);
  });

  it("needs the minimum (5 by default), and nobody's eligible with Achievements switched off", () => {
    expect(holdersOf([player("a", earned(4, 1))], "overachiever")).toEqual([]);
    expect(holdersOf([player("a")], "overachiever")).toEqual([]); // achievements: null
  });
});

describe("pickTitles", () => {
  it("gives Carry to the biggest share of their own Team's points", () => {
    const pool = [player("a", { pointsShare: 30, teamAwardPoints: 100 }), player("b", { pointsShare: 10, teamAwardPoints: 20, teamId: "small" })];
    expect(holdersOf(pool, "carry")).toEqual(["b"]);
  });

  it("lets tied Players both hold a Title", () => {
    const pool = [player("a", { pointsShare: 20 }), player("b", { pointsShare: 20 }), player("c", { pointsShare: 5 })];
    expect(holdersOf(pool, "carry")).toEqual(["a", "b"]);
  });

  it("shows a visible Title nobody qualifies for with no holders", () => {
    const picked = pickTitles([player("a", { distinctItems: 2 })], live(48));
    expect(picked.find((p) => p.title.id === "collector")?.holders).toEqual([]);
  });

  it("leaves out a hidden Title until someone holds it", () => {
    expect(holdersOf([player("a", { rejectedSubmissions: 1 })], "butterfingers")).toBeUndefined();
    expect(holdersOf([player("a", { rejectedSubmissions: 2 })], "butterfingers")).toEqual(["a"]);
  });

  describe("On Fire", () => {
    const pool = [player("a", { awards: [award(12, 30)] }), player("b", { awards: [award(20, 10)] })];

    it("isn't awarded before the Bingo has been Live for 24 hours", () => {
      expect(holdersOf([player("a", { awards: [award(12, 1)] })], "on_fire", live(23))).toEqual([]);
    });

    it("counts only the last 24 hours", () => {
      expect(holdersOf(pool, "on_fire", live(40))).toEqual(["a"]);
    });

    it("needs 10 points share in the window", () => {
      expect(holdersOf([player("a", { awards: [award(9, 30)] })], "on_fire", live(40))).toEqual([]);
    });

    it("uses the Bingo's final 24 hours once it's Finished", () => {
      // Long after the end, "the last 24 hours" would be empty.
      const finished = { now: at(500), liveAt: LIVE_AT, endedAt: at(35) };
      expect(holdersOf(pool, "on_fire", finished)).toEqual(["a"]);
      expect(pickTitles(pool, finished)[0]!.holders[0]!.text).toBe("+12 points in the final 24 h");
    });
  });

  it("counts Closer from closed Task and Part awards only", () => {
    const pool = [player("a", { awards: [award(5, 1, { closed: true }), award(5, 2, { kind: "tile", closed: true })] }), player("b", { awards: [award(5, 1, { closed: true }), award(5, 2, { closed: true })] })];
    expect(holdersOf(pool, "closer")).toEqual(["b"]);
  });

  it("leaves Players without Wise Old Man data out of its Titles", () => {
    const pool = [player("a"), player("b", { wom: { ehb: 12, ehp: 0, clues: 0, asOf: at(5).toISOString() } })];
    expect(holdersOf(pool, "grinder")).toEqual(["b"]);
    expect(holdersOf(pool, "skiller")).toBeUndefined();
  });

  it("needs 3 approved Submissions for Sniper, and ranks by points per Submission", () => {
    const pool = [player("a", { pointsShare: 40, approvedSubmissions: 2 }), player("b", { pointsShare: 30, approvedSubmissions: 3 }), player("c", { pointsShare: 40, approvedSubmissions: 8 })];
    expect(holdersOf(pool, "sniper")).toEqual(["b"]);
  });

  it("counts Tourist from task and tile credit, not line bonuses", () => {
    const awards = [award(1, 1, { tileNodeId: "t1" }), award(1, 1, { tileNodeId: "t2", kind: "tile" }), award(1, 1, { tileNodeId: null, kind: "line" })];
    expect(holdersOf([player("a", { awards })], "tourist")).toEqual([]);
    expect(holdersOf([player("a", { awards: [...awards, award(1, 1, { tileNodeId: "t3" })] })], "tourist")).toEqual(["a"]);
  });

  it("gives Specialist to the largest share from one Tile, once it's half of at least 3", () => {
    const focused = player("a", { pointsShare: 10, awards: [award(8, 1, { tileNodeId: "t1", tileName: "Zulrah" }), award(2, 1, { tileNodeId: "t2", tileName: "Vorkath" })] });
    const spread = player("b", { pointsShare: 10, awards: [award(5, 1, { tileNodeId: "t1" }), award(5, 1, { tileNodeId: "t2" })] });
    const tiny = player("c", { pointsShare: 2, awards: [award(2, 1)] });
    const specialist = pickTitles([focused, spread, tiny], live(48)).find((p) => p.title.id === "specialist")!;
    expect(specialist.holders.map((h) => h.userId)).toEqual(["a"]);
    expect(specialist.holders[0]!.text).toBe("80% of their points from Zulrah");
  });
});

describe("luck Titles", () => {
  const WOM = { ehb: 0, ehp: 0, clues: 0, asOf: "2026-01-02T10:00:00.000Z" };
  const lucky = (userId: string, luck: Partial<LuckFacts>) => player(userId, { wom: WOM, luck: { spoon: null, dry: null, clutch: null, ...luck } });
  const textOf = (pool: PlayerTitleFacts[], id: TitleId) => pickTitles(pool, live(48)).find((p) => p.title.id === id)?.holders[0]?.text;

  it("gives Spoon to the luckiest, reading 1 in N with their best drop", () => {
    const pool = [lucky("a", { spoon: { value: 2.53, itemName: "Ultor vestige", kills: 3 } }), lucky("b", { spoon: { value: 1.2, itemName: "Virtus mask", kills: 40 } })];
    expect(holdersOf(pool, "spoon")).toEqual(["a"]);
    expect(textOf(pool, "spoon")).toBe("1 in 339 luck (Ultor vestige at 3 kills)");
  });

  it("shows how fresh the Wise Old Man data behind a luck Title is", () => {
    const holder = pickTitles([lucky("a", { spoon: { value: 2, itemName: "Ultor vestige", kills: 3 } })], live(48)).find((p) => p.title.id === "spoon")!.holders[0]!;
    expect(holder.asOf).toBe(WOM.asOf);
  });

  it("lets Players tied on luck share Spoon", () => {
    const spoon = { value: 1.5, itemName: "Ultor vestige", kills: 30 };
    expect(holdersOf([lucky("a", { spoon }), lucky("b", { spoon })], "spoon")).toEqual(["a", "b"]);
  });

  it("leaves Spoon and Clutch empty, and Dry out, for Players below the floors", () => {
    const pool = [lucky("a", {}), player("b")];
    expect(holdersOf(pool, "spoon")).toEqual([]);
    expect(holdersOf(pool, "clutch")).toEqual([]);
    expect(holdersOf(pool, "dry")).toBeUndefined();
  });

  it("gives hidden Dry to the most unlikely streak, naming the boss and the KC", () => {
    const pool = [lucky("a", { dry: { value: 1.48, boss: "Vardorvis", kills: 412 } }), lucky("b", { dry: { value: 1.1, boss: "Zulrah", kills: 600 } })];
    expect(holdersOf(pool, "dry")).toEqual(["a"]);
    expect(textOf(pool, "dry")).toBe("412 KC dry at Vardorvis (1 in 30)");
    expect(TITLE_BY_ID("dry").hidden).toBe(true);
  });

  it("gives Clutch to the best weighted drop, with its own odds and GP value", () => {
    const pool = [
      lucky("a", { clutch: { value: 2.8, luck: 1.4, itemName: "Bandos tassets", gpValue: 12_000_000 } }),
      lucky("b", { clutch: { value: 2, luck: 2, itemName: "Pet general graardor", gpValue: null } }),
    ];
    expect(holdersOf(pool, "clutch")).toEqual(["a"]);
    expect(textOf(pool, "clutch")).toBe("Clutched Bandos tassets (1 in 25), 12m");
    expect(textOf([pool[1]!], "clutch")).toBe("Clutched Pet general graardor (1 in 100)");
  });

  it("formats 1 in N and GP short", () => {
    expect(oneIn(0.2)).toBe("1 in 1.6");
    expect(oneIn(4.1)).toBe("1 in 12,589");
    expect(oneIn(6.36)).toBe("1 in 2.3m");
    expect(oneIn(16.22)).toBe("1 in 1.7 × 10¹⁶");
    expect(shortGp(12_000_000)).toBe("12m");
    expect(shortGp(1_530_000_000)).toBe("1.53b");
    expect(shortGp(450_000)).toBe("450k");
  });
});

describe("Title settings", () => {
  const pickWith = (pool: PlayerTitleFacts[], settings: Partial<typeof DEFAULT_TITLE_SETTINGS>) => pickTitles(pool, live(48), { ...DEFAULT_TITLE_SETTINGS, ...settings });

  it("leaves out a Title a Site admin turned off, held or not", () => {
    const pool = [player("a", { pointsShare: 20 }), player("b", { rejectedSubmissions: 5 })];
    const ids = pickWith(pool, { disabled: ["carry", "butterfingers"] }).map((p) => p.title.id);
    expect(ids).not.toContain("carry");
    expect(ids).not.toContain("butterfingers");
    expect(ids).toContain("closer");
  });

  it("holds Players to a Site admin's minimum, and says so on an unheld Title", () => {
    const pool = [player("a", { distinctItems: 4 })];
    expect(pickWith(pool, {}).find((p) => p.title.id === "collector")!.holders.map((h) => h.userId)).toEqual(["a"]);
    const raised = pickWith(pool, { minimums: { collector: 5 } }).find((p) => p.title.id === "collector")!;
    expect(raised.holders).toEqual([]);
    expect(raised.requirement).toBe("5 different items claimed");
  });

  it("states the luck Titles' floors from the luck weights", () => {
    const luck = { ...DEFAULT_TITLE_SETTINGS.luck, spoonMinLuck: 2 };
    expect(pickWith([], { luck }).find((p) => p.title.id === "spoon")!.requirement).toBe("Drops adding up to 1 in 100 luck");
  });
});

describe("chipTitles and titlesHeldBy", () => {
  it("shows a Player's highest-priority Title on the chip, and lists all of them", () => {
    const pool = [player("a", { pointsShare: 20, distinctItems: 5, rejectedSubmissions: 3 }), player("b", { pointsShare: 10 })];
    const picked = pickTitles(pool, live(48));
    expect(chipTitles(picked).get("a")?.id).toBe("carry");
    expect(titlesHeldBy(picked, "a").map((p) => p.title.id)).toEqual(["carry", "butterfingers", "collector"]);
    expect(chipTitles(picked).has("b")).toBe(false);
  });
});
