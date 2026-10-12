import { beforeEach, describe, expect, it } from "vitest";
import type { BroadcastEvent } from "@bingo/shared";
import { forgetAllStats, forgetStatsOn, keptStats, STATS_CACHE_MS } from "./statsCache";

describe("keptStats", () => {
  beforeEach(forgetAllStats);
  let computed = 0;
  const compute = () => ++computed;

  it("works a Bingo's stats out once while they're fresh, and again once they're not", () => {
    computed = 0;
    expect(keptStats("b1", compute, 0)).toBe(1);
    expect(keptStats("b1", compute, STATS_CACHE_MS - 1)).toBe(1);
    expect(keptStats("b2", compute, 0)).toBe(2);
    expect(keptStats("b1", compute, STATS_CACHE_MS)).toBe(3);
  });

  it("forgets a Bingo's stats on a change that alters them, and only that Bingo's", () => {
    computed = 0;
    keptStats("b1", compute, 0);
    keptStats("b2", compute, 0);
    forgetStatsOn({ type: "submission_reviewed", bingoId: "b1", payload: { teamId: "t", nodeIds: [] } } as unknown as BroadcastEvent);
    expect(keptStats("b1", compute, 1)).toBe(3);
    expect(keptStats("b2", compute, 1)).toBe(2);
  });

  it("keeps them through a change that doesn't alter them", () => {
    computed = 0;
    keptStats("b1", compute, 0);
    forgetStatsOn({ type: "submission_reactions_changed", bingoId: "b1", payload: { teamId: "t", changes: [] } } as unknown as BroadcastEvent);
    expect(keptStats("b1", compute, 1)).toBe(1);
  });
});
