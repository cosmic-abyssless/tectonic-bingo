import { describe, expect, it } from "vitest";
import type { CombatAchievementStats } from "@bingo/shared";
import { caSubLevel } from "@bingo/shared";

const master = (points: number): CombatAchievementStats => ({ tier: "master", points });

describe("caSubLevel", () => {
  it("splits Master's 1965-2696 range into equal thirds", () => {
    expect(caSubLevel(master(1965))).toBe("low");
    expect(caSubLevel(master(2208))).toBe("low");
    expect(caSubLevel(master(2209))).toBe("medium");
    expect(caSubLevel(master(2452))).toBe("medium");
    expect(caSubLevel(master(2453))).toBe("high");
    expect(caSubLevel(master(2696))).toBe("high");
  });

  it("splits the lower tiers up to the next tier's threshold", () => {
    expect(caSubLevel({ tier: "easy", points: 41 })).toBe("low");
    expect(caSubLevel({ tier: "easy", points: 168 })).toBe("high");
    expect(caSubLevel({ tier: "elite", points: 1100 })).toBe("low");
    expect(caSubLevel({ tier: "elite", points: 1964 })).toBe("high");
  });

  it("is null for Grandmaster, None and no data", () => {
    expect(caSubLevel({ tier: "grandmaster", points: 2697 })).toBeNull();
    expect(caSubLevel({ tier: "none", points: 10 })).toBeNull();
    expect(caSubLevel(null)).toBeNull();
    expect(caSubLevel(undefined)).toBeNull();
  });
});
