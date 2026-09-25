import { describe, expect, it } from "vitest";
import type { WomSnapshot } from "../womService";
import { killsAtLeast, killsAtMost, killsUpToDrop } from "./kc";

const at = (minute: number) => new Date(2026, 0, 1, 0, minute);
const snap = (minute: number, kills: Record<string, number | null>): WomSnapshot => ({ at: at(minute), bossKills: kills, ehb: null, ehp: null, clues: null });

describe("kill counts from snapshots", () => {
  const timeline = [snap(0, { vardorvis: 100 }), snap(60, { vardorvis: 110 }), snap(120, { vardorvis: 150 })];

  it("reads a drop's KC from the first snapshot at or after it", () => {
    expect(killsAtMost(timeline, "vardorvis", at(30))).toBe(110);
    expect(killsAtMost(timeline, "vardorvis", at(60))).toBe(110);
  });

  it("reads a starting KC from the last snapshot at or before it", () => {
    expect(killsAtLeast(timeline, "vardorvis", at(30))).toBe(100);
    expect(killsAtLeast(timeline, "vardorvis", at(120))).toBe(150);
  });

  it("can't know a drop's KC before a snapshot after it", () => {
    expect(killsAtMost(timeline, "vardorvis", at(121))).toBeNull();
    expect(killsUpToDrop(timeline, "vardorvis", at(0), at(121))).toBeNull();
  });

  it("counts the kills from a start up to a drop", () => {
    expect(killsUpToDrop(timeline, "vardorvis", at(0), at(30))).toBe(10);
    expect(killsUpToDrop(timeline, "vardorvis", at(30), at(90))).toBe(50);
  });

  it("reads an unranked KC as the most it could be at a drop, and as 0 at a start", () => {
    const unranked = [snap(0, { vardorvis: null, tzkal_zuk: null }), snap(60, { vardorvis: null, tzkal_zuk: null })];
    expect(killsAtMost(unranked, "vardorvis", at(30))).toBe(4);
    expect(killsAtMost(unranked, "tzkal_zuk", at(30))).toBe(0);
    expect(killsAtLeast(unranked, "vardorvis", at(30))).toBe(0);
  });

  it("can't know a starting KC before the first snapshot", () => {
    expect(killsAtLeast(timeline, "vardorvis", at(-10))).toBeNull();
    expect(killsUpToDrop(timeline, "vardorvis", at(-10), at(30))).toBeNull();
  });

  it("reads a boss missing from a snapshot as 0 kills", () => {
    expect(killsAtLeast(timeline, "zulrah", at(30))).toBe(0);
  });
});
