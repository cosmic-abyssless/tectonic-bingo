import { describe, expect, it } from "vitest";
import { chipTitles, pickTitles, titlesHeldBy, type PlayerTitleFacts, type TitleAwardFact, type TitleContext, type TitleId } from "@bingo/shared";

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
    ...facts,
  };
}

function award(points: number, hours: number, extra: Partial<TitleAwardFact> = {}): TitleAwardFact {
  return { kind: "task", tileNodeId: "t1", tileName: "Zulrah", points, completedAt: at(hours).toISOString(), closed: false, ...extra };
}

const holdersOf = (pool: PlayerTitleFacts[], id: TitleId, ctx = live(48)) => pickTitles(pool, ctx).find((p) => p.title.id === id)?.holders.map((h) => h.userId);

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

describe("chipTitles and titlesHeldBy", () => {
  it("shows a Player's highest-priority Title on the chip, and lists all of them", () => {
    const pool = [player("a", { pointsShare: 20, distinctItems: 5, rejectedSubmissions: 3 }), player("b", { pointsShare: 10 })];
    const picked = pickTitles(pool, live(48));
    expect(chipTitles(picked).get("a")?.id).toBe("carry");
    expect(titlesHeldBy(picked, "a").map((p) => p.title.id)).toEqual(["carry", "butterfingers", "collector"]);
    expect(chipTitles(picked).has("b")).toBe(false);
  });
});
