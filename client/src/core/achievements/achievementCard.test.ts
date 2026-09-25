import { describe, expect, it } from "vitest";
import type { MyAchievement } from "@bingo/shared";
import { achievementCardKind, achievementCountLabel, earnedLabel, orderForList, progressFraction, progressLabel } from "./achievementCard";

function achievement(overrides: Partial<MyAchievement> = {}): MyAchievement {
  return { key: "strong_start", hidden: false, masked: false, name: "Strong start", description: "Submit your first drop.", flavor: "First drop's in. Only a few thousand more to go.", itemName: "Bronze sword", earned: false, earnedAt: null, progress: null, ...overrides };
}

describe("achievementCardKind", () => {
  it("is masked for a locked Hidden achievement, regardless of earned", () => {
    expect(achievementCardKind({ masked: true, earned: false })).toBe("masked");
  });

  it("is earned once earned, even if it happens to be Hidden", () => {
    expect(achievementCardKind({ masked: false, earned: true })).toBe("earned");
  });

  it("is locked when visible but not earned", () => {
    expect(achievementCardKind({ masked: false, earned: false })).toBe("locked");
  });
});

describe("progressLabel / progressFraction", () => {
  it("formats a counted achievement's progress", () => {
    expect(progressLabel({ current: 4, target: 10 })).toBe("4/10");
    expect(progressFraction({ current: 4, target: 10 })).toBeCloseTo(0.4);
  });

  it("is null with no progress target", () => {
    expect(progressLabel(null)).toBeNull();
    expect(progressFraction(null)).toBeNull();
  });

  it("clamps the fraction to 1 even if current somehow exceeds target", () => {
    expect(progressFraction({ current: 12, target: 10 })).toBe(1);
  });

  it("never divides by a zero target", () => {
    expect(progressFraction({ current: 0, target: 0 })).toBeNull();
  });
});

describe("achievementCountLabel", () => {
  it("counts earned out of the total switched-on achievements", () => {
    const achievements = [achievement({ earned: true }), achievement({ earned: false }), achievement({ earned: true })];
    expect(achievementCountLabel(achievements)).toBe("2 / 3");
  });

  it("reads 0 / 0 with nothing switched on", () => {
    expect(achievementCountLabel([])).toBe("0 / 0");
  });
});

describe("orderForList", () => {
  it("puts earned first, then visible locked, then Hidden masked — each in catalogue order", () => {
    const list = [
      achievement({ key: "strong_start" }),
      achievement({ key: "rules_lawyer", hidden: true, masked: true }),
      achievement({ key: "hypeman", earned: true }),
      achievement({ key: "cheerleader" }),
      achievement({ key: "night_owl", hidden: true, earned: true }),
      achievement({ key: "number_cruncher", hidden: true, masked: true }),
    ];
    expect(orderForList(list).map((a) => a.key)).toEqual(["hypeman", "night_owl", "strong_start", "cheerleader", "rules_lawyer", "number_cruncher"]);
  });

  it("doesn't reorder the list it was given", () => {
    const list = [achievement({ key: "strong_start" }), achievement({ key: "hypeman", earned: true })];
    orderForList(list);
    expect(list.map((a) => a.key)).toEqual(["strong_start", "hypeman"]);
  });
});

describe("earnedLabel", () => {
  it("is null until earned", () => {
    expect(earnedLabel(null)).toBeNull();
  });

  it("starts with Earned once earned", () => {
    expect(earnedLabel("2026-03-03T12:00:00.000Z")).toMatch(/^Earned /);
  });
});
