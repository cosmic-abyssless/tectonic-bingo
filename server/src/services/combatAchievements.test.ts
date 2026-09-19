import { describe, expect, it } from "vitest";
import { deriveCombatAchievements, parseStoredCaStats, peakCombatAchievements } from "./combatAchievements";

function blob(tiers: Array<{ name: string; completed: number; total: number }>) {
  return { combatAchievements: tiers };
}

const FULL_BELOW_GM = [
  { name: "Easy", completed: 50, total: 50 },
  { name: "Medium", completed: 80, total: 80 },
  { name: "Hard", completed: 90, total: 90 },
  { name: "Elite", completed: 150, total: 150 },
  { name: "Master", completed: 180, total: 180 },
  { name: "Grandmaster", completed: 0, total: 130 },
];

describe("deriveCombatAchievements", () => {
  it("returns null when the blob has no combatAchievements", () => {
    expect(deriveCombatAchievements(null)).toBeNull();
    expect(deriveCombatAchievements({})).toBeNull();
    expect(deriveCombatAchievements({ combatAchievements: [] })).toBeNull();
    expect(deriveCombatAchievements({ combatAchievements: [{ name: "Nope", completed: 1, total: 1 }] })).toBeNull();
  });

  it("returns None at 0 points", () => {
    expect(deriveCombatAchievements(blob([{ name: "Easy", completed: 0, total: 50 }]))).toEqual({ tier: "none", points: 0 });
  });

  it("maps official reward-point thresholds", () => {
    expect(deriveCombatAchievements(blob([{ name: "Easy", completed: 40, total: 50 }]))).toEqual({ tier: "none", points: 40 });
    expect(deriveCombatAchievements(blob([{ name: "Easy", completed: 41, total: 50 }]))).toEqual({ tier: "easy", points: 41 });
    expect(deriveCombatAchievements(blob([{ name: "Easy", completed: 50, total: 50 }, { name: "Medium", completed: 60, total: 80 }]))).toEqual({
      tier: "medium",
      points: 170,
    });
    expect(
      deriveCombatAchievements(
        blob([
          { name: "Easy", completed: 50, total: 50 },
          { name: "Medium", completed: 80, total: 80 },
          { name: "Hard", completed: 76, total: 90 },
        ]),
      ),
    ).toEqual({ tier: "hard", points: 438 });
    expect(
      deriveCombatAchievements(
        blob([
          { name: "Easy", completed: 50, total: 50 },
          { name: "Medium", completed: 80, total: 80 },
          { name: "Hard", completed: 90, total: 90 },
          { name: "Elite", completed: 155, total: 180 },
        ]),
      ),
    ).toEqual({ tier: "elite", points: 1100 });
    expect(
      deriveCombatAchievements(
        blob([
          { name: "Easy", completed: 50, total: 50 },
          { name: "Medium", completed: 80, total: 80 },
          { name: "Hard", completed: 90, total: 90 },
          { name: "Elite", completed: 150, total: 180 },
          { name: "Master", completed: 177, total: 180 },
        ]),
      ),
    ).toEqual({ tier: "master", points: 1965 });
  });

  it("requires all currently available tasks for the Grandmaster reward", () => {
    const pointsOnly = blob([
      ...FULL_BELOW_GM.slice(0, 5),
      { name: "Grandmaster", completed: 122, total: 130 },
    ]);
    expect(deriveCombatAchievements(pointsOnly)).toEqual({ tier: "master", points: 2712 });

    const allTasks = blob([
      ...FULL_BELOW_GM.slice(0, 5),
      { name: "Grandmaster", completed: 130, total: 130 },
    ]);
    expect(deriveCombatAchievements(allTasks)).toEqual({ tier: "grandmaster", points: 2760 });
  });

  it("normalises spaced/cased RuneProfile tier names", () => {
    expect(deriveCombatAchievements(blob([{ name: "  EASY ", completed: 41, total: 50 }]))).toEqual({ tier: "easy", points: 41 });
  });
});

describe("peakCombatAchievements", () => {
  it("skips missing accounts instead of treating them as None", () => {
    expect(peakCombatAchievements([null, { tier: "easy", points: 41 }, null])).toEqual({ tier: "easy", points: 41 });
    expect(peakCombatAchievements([null, null])).toBeNull();
  });

  it("picks the higher reward tier, then more points at the same tier", () => {
    expect(peakCombatAchievements([{ tier: "easy", points: 100 }, { tier: "hard", points: 436 }])).toEqual({ tier: "hard", points: 436 });
    expect(peakCombatAchievements([{ tier: "elite", points: 1100 }, { tier: "elite", points: 1500 }])).toEqual({ tier: "elite", points: 1500 });
  });
});

describe("parseStoredCaStats", () => {
  it("reads a persisted snapshot and rejects junk", () => {
    expect(parseStoredCaStats(JSON.stringify({ tier: "master", points: 1965 }))).toEqual({ tier: "master", points: 1965 });
    expect(parseStoredCaStats(null)).toBeNull();
    expect(parseStoredCaStats("{")).toBeNull();
    expect(parseStoredCaStats(JSON.stringify({ tier: "mythic", points: 1 }))).toBeNull();
  });
});
