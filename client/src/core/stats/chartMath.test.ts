import { describe, expect, it } from "vitest";
import { formatTimeTick, nearestDot, niceTicks, timeTicks } from "./chartMath";

describe("niceTicks", () => {
  it("rounds to friendly steps that enclose the data", () => {
    expect(niceTicks(0, 1180)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(0, 240)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(0, 47)).toEqual([0, 20, 40, 60]);
  });

  it("handles a chart with almost nothing on it", () => {
    expect(niceTicks(0, 1)).toEqual([0, 0.5, 1]);
    expect(niceTicks(0, 0)).toEqual([0, 0.5]);
  });

  it("includes a negative floor when a penalty takes a team below zero", () => {
    const ticks = niceTicks(-15, 120);
    expect(ticks[0]).toBeLessThanOrEqual(-15);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(120);
    expect(ticks).toContain(0);
  });
});

describe("timeTicks", () => {
  it("spreads times evenly from the first to the last", () => {
    expect(timeTicks(0, 400, 5)).toEqual([0, 100, 200, 300, 400]);
  });

  it("gives one tick when there is only one moment", () => {
    expect(timeTicks(500, 500)).toEqual([500]);
  });
});

describe("formatTimeTick", () => {
  const t = new Date(2026, 8, 16, 14, 0).getTime();
  it("shows the hour on a short span and only the day on a long one", () => {
    expect(formatTimeTick(t, 24 * 60 * 60 * 1000)).toMatch(/Sep/);
    expect(formatTimeTick(t, 24 * 60 * 60 * 1000)).toMatch(/2|14/); // the hour
    expect(formatTimeTick(t, 9 * 24 * 60 * 60 * 1000)).not.toMatch(/:|PM|AM/);
  });
});

describe("nearestDot", () => {
  const dots = [
    { x: 10, y: 10 },
    { x: 100, y: 50 },
    { x: 104, y: 50 },
  ];

  it("finds the closest dot within reach", () => {
    expect(nearestDot(dots, 12, 12, 10)).toBe(0);
    expect(nearestDot(dots, 103, 52, 10)).toBe(2);
  });

  it("finds nothing when no dot is close enough", () => {
    expect(nearestDot(dots, 200, 200, 10)).toBeNull();
  });

  it("prefers the later dot when two are equally close", () => {
    expect(nearestDot(dots, 102, 50, 10)).toBe(2);
  });
});
