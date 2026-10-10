import { describe, expect, it } from "vitest";
import { DEFAULT_TITLE_SETTINGS, oneIn, pickTitles, placeDrafted, shortGp, TITLES, titlesByHolder, titlesHeldBy, titleNotRecorded, type LuckFacts, type PlayerTitleFacts, type TitleAwardFact, type TitleContext, type TitleId } from "@bingo/shared";

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
    draft: null,
    lastAt: { approved: null, rejected: null, posted: null, newItem: null, item: null },
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

describe("placeDrafted", () => {
  const pick = (userId: string, pickNumber: number, pointsShare: number, teamId = "team") => player(userId, { teamId, pointsShare, draft: { pickNumber } });
  const placesOf = (pool: PlayerTitleFacts[]) => Object.fromEntries(placeDrafted(pool).map((f) => [f.userId, f.draftPlace]));

  it("counts Players picked before them, so a Duo's halves share a position and the next pick comes two later", () => {
    const pool = [pick("solo", 1, 1), pick("duo1", 2, 1), pick("duo2", 2, 1), pick("late", 3, 1)];
    expect(Object.values(placesOf(pool)).map((p) => p?.position)).toEqual([1, 2, 2, 4]);
  });

  it("ranks by Points share among drafted Players only, ties sharing a rank; Captains and undrafted Players get nothing", () => {
    const places = placesOf([
      player("captain", { pointsShare: 99 }), // a Captain outscoring everyone doesn't push anyone down
      pick("first", 1, 5),
      pick("second", 2, 0.1 + 0.2),
      pick("third", 3, 0.3),
    ]);
    expect(places).toEqual({ captain: null, first: { position: 1, rank: 1 }, second: { position: 2, rank: 2 }, third: { position: 3, rank: 2 } });
  });

  it("judges only against the pool, so one Team's view never places its Players in the whole Bingo", () => {
    const bingo = [pick("a1", 1, 5, "A"), pick("b1", 2, 50, "B"), pick("b2", 3, 40, "B"), pick("a2", 4, 30, "A")];
    expect(placesOf(bingo).a2).toEqual({ position: 4, rank: 3 });
    expect(placesOf(bingo.filter((f) => f.teamId === "A"))).toEqual({ a1: { position: 1, rank: 2 }, a2: { position: 2, rank: 1 } });
  });
});

describe("Overperformer", () => {
  // `pickNumber` Players are picked ahead of this one, each with a bigger Points share than `pointsShare` until
  // `rank - 1` of them; the rest score nothing. So they're picked (pickNumber + 1)th and finish rankth.
  function drafted(userId: string, position: number, rank: number, pointsShare = 10, hours = 1): PlayerTitleFacts[] {
    const ahead = Array.from({ length: position - 1 }, (_, i) => player(`${userId}-ahead${i}`, { draft: { pickNumber: i + 1 }, pointsShare: i < rank - 1 ? pointsShare + 1 : 0 }));
    return [...ahead, player(userId, { draft: { pickNumber: position }, pointsShare, awards: [award(pointsShare, hours)] })];
  }

  it("goes to the late pick who beat their draft position by the most", () => {
    // 10th picked, finished 1st: 9 places. 18th picked, finished 3rd: 15.
    const pool = [player("early", { draft: { pickNumber: 10 }, pointsShare: 50, awards: [award(50, 1)] }), player("mid", { draft: { pickNumber: 8 }, pointsShare: 40, awards: [award(40, 1)] }), player("late", { draft: { pickNumber: 18 }, pointsShare: 30, awards: [award(30, 1)] })];
    for (let i = 1; i <= 17; i++) if (i !== 8 && i !== 10) pool.push(player(`filler${i}`, { draft: { pickNumber: i } }));
    expect(holdersOf(pool, "overperformer")).toEqual(["late"]);
    const picked = pickTitles(pool, live(48)).find((p) => p.title.id === "overperformer")!;
    expect(picked.holders[0]).toMatchObject({ value: 15, text: "Picked 18th, finished 3rd" });
  });

  it("is judged among the Players shown: one Team's best Steal, placed within that Team", () => {
    const pool = [
      player("a1", { teamId: "A", draft: { pickNumber: 1 }, pointsShare: 1, awards: [award(1, 1)] }),
      player("b1", { teamId: "B", draft: { pickNumber: 2 }, pointsShare: 90, awards: [award(90, 1)] }),
      player("a2", { teamId: "A", draft: { pickNumber: 3 }, pointsShare: 2, awards: [award(2, 1)] }),
      player("a3", { teamId: "A", draft: { pickNumber: 4 }, pointsShare: 3, awards: [award(3, 1)] }),
      player("a4", { teamId: "A", draft: { pickNumber: 5 }, pointsShare: 50, awards: [award(50, 1)] }),
    ];
    const teamA = pool.filter((f) => f.teamId === "A");
    // In Team A alone, a4 is picked 4th and finishes 1st; the whole Bingo would say picked 5th, finished 2nd.
    expect(pickTitles(teamA, live(48)).find((p) => p.title.id === "overperformer")!.holders[0]).toMatchObject({ userId: "a4", text: "Picked 4th, finished 1st" });
  });

  it("in a Duo, only the higher scorer can hold it: both halves share the pick, and the lower one's rank is worse", () => {
    const pool = [...drafted("higher", 12, 2, 30), player("lower", { draft: { pickNumber: 12 }, pointsShare: 20, awards: [award(20, 1)] })];
    expect(holdersOf(pool, "overperformer")).toEqual(["higher"]);
  });

  it("isn't shared when a Duo's halves tie: whoever got there first holds it", () => {
    const pool = [...drafted("a", 12, 1, 30, 9).slice(0, -1), player("a", { draft: { pickNumber: 12 }, pointsShare: 30, awards: [award(30, 9)] }), player("b", { draft: { pickNumber: 12 }, pointsShare: 30, awards: [award(30, 4)] })];
    expect(holdersOf(pool, "overperformer")).toEqual(["b"]);
  });

  it("never goes to Captains or undrafted Players, however well they did", () => {
    expect(holdersOf([player("captain", { pointsShare: 100, awards: [award(100, 1)] })], "overperformer")).toEqual([]);
  });

  it("needs the minimum (3 places by default) and some points share", () => {
    expect(holdersOf(drafted("a", 5, 3), "overperformer")).toEqual([]);
    expect(holdersOf(drafted("a", 6, 3), "overperformer")).toEqual(["a"]);
    expect(holdersOf(drafted("a", 20, 1, 0), "overperformer")).toEqual([]);
  });

  it("uses the tuned minimum, and can be switched off", () => {
    const pool = drafted("a", 10, 3);
    const settings = (s: Partial<typeof DEFAULT_TITLE_SETTINGS>) => ({ ...DEFAULT_TITLE_SETTINGS, ...s });
    const held = (s: Partial<typeof DEFAULT_TITLE_SETTINGS>) => pickTitles(pool, live(48), settings(s)).find((p) => p.title.id === "overperformer")?.holders.map((h) => h.userId);
    expect(held({ minimums: { overperformer: 8 } })).toEqual([]);
    expect(held({ minimums: { overperformer: 7 } })).toEqual(["a"]);
    expect(held({ disabled: ["overperformer"] })).toBeUndefined();
  });
});

describe("pickTitles", () => {
  it("gives Carry to the biggest share of their own Team's points", () => {
    const pool = [player("a", { pointsShare: 30, teamAwardPoints: 100 }), player("b", { pointsShare: 10, teamAwardPoints: 20, teamId: "small" })];
    expect(holdersOf(pool, "carry")).toEqual(["b"]);
  });

  it("gives a tie to the Player holding fewer Titles", () => {
    // Tied on Carry, but "a" already holds Collector outright.
    const pool = [player("a", { pointsShare: 20, distinctItems: 5 }), player("b", { pointsShare: 20 }), player("c", { pointsShare: 5 })];
    expect(holdersOf(pool, "carry")).toEqual(["b"]);
    expect(holdersOf(pool, "collector")).toEqual(["a"]);
  });

  it("gives a tie between Players holding as many Titles to whoever got there first, and counts it for the next tie", () => {
    // Tied on Carry and on Specialist (all their points from one tile). "b" got there first, so takes Carry; then "a"
    // holds fewer, so takes Specialist.
    const pool = [player("a", { pointsShare: 20, awards: [award(20, 10)] }), player("b", { pointsShare: 20, awards: [award(20, 5)] })];
    expect(holdersOf(pool, "carry")).toEqual(["b"]);
    expect(holdersOf(pool, "specialist")).toEqual(["a"]);
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

  it("gives a luck tie, which it can't time, to the Player listed first", () => {
    const spoon = { value: 1.5, itemName: "Ultor vestige", kills: 30 };
    expect(holdersOf([lucky("a", { spoon }), lucky("b", { spoon })], "spoon")).toEqual(["a"]);
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

  it("gives Clutch to the best weighted drop, with its own odds and Drop value", () => {
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

describe("titlesByHolder and titlesHeldBy", () => {
  it("lists every Title a Player holds, in priority order", () => {
    const pool = [player("a", { pointsShare: 20, distinctItems: 5, rejectedSubmissions: 3 }), player("b", { pointsShare: 10 })];
    const picked = pickTitles(pool, live(48));
    expect(titlesByHolder(picked).get("a")?.map((t) => t.id)).toEqual(["carry", "butterfingers", "collector"]);
    expect(titlesHeldBy(picked, "a").map((p) => p.title.id)).toEqual(["carry", "butterfingers", "collector"]);
    expect(titlesByHolder(picked).has("b")).toBe(false);
  });
});

describe("titleNotRecorded", () => {
  const recorded = { tasks: true, submissions: true, signupRoster: true, draft: true, womSnapshots: false };
  const byId = (id: TitleId) => TITLES.find((t) => t.id === id)!;

  it("marks a Historical Bingo's Wise Old Man Titles without snapshots, and Overachiever", () => {
    expect(TITLES.filter((t) => titleNotRecorded(t, recorded)).map((t) => t.id).sort()).toEqual([...TITLES.filter((t) => t.source === "wom").map((t) => t.id), "overachiever"].sort());
    expect(titleNotRecorded(byId("grinder"), { ...recorded, womSnapshots: true })).toBe(false);
    expect(titleNotRecorded(byId("carry"), recorded)).toBe(false);
  });

  it("never marks any other Bingo's", () => {
    expect(TITLES.some((t) => titleNotRecorded(t, null))).toBe(false);
  });
});
