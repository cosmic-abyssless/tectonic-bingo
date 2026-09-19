// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LineModel } from "../../../headless/types";
import {
  BOOST_AMP,
  BOOST_BASE,
  IDLE_AMP,
  IDLE_BASE,
  LINE_PULSE_PERIOD_MS,
  LINE_PULSE_PHASE,
  buildStopsByTileId,
  pulseOpacityAt,
} from "./linePulse";

const line = (over: Partial<LineModel> & Pick<LineModel, "id" | "tileIds" | "complete">): LineModel => ({
  lineType: "row",
  lineIndex: 0,
  points: 15,
  pointsAwarded: over.complete ? 15 : 0,
  ...over,
});

describe("buildStopsByTileId", () => {
  it("ignores incomplete lines", () => {
    expect(
      buildStopsByTileId([
        line({ id: "r0", tileIds: ["a", "b", "c"], complete: false }),
      ]).size,
    ).toBe(0);
  });

  it("indexes tiles in tileIds order", () => {
    const stops = buildStopsByTileId([line({ id: "r0", tileIds: ["a", "b", "c"], complete: true })]);
    expect(stops.get("a")).toEqual([{ lineId: "r0", index: 0, length: 3 }]);
    expect(stops.get("b")).toEqual([{ lineId: "r0", index: 1, length: 3 }]);
    expect(stops.get("c")).toEqual([{ lineId: "r0", index: 2, length: 3 }]);
  });

  it("keeps every completed line a tile sits on", () => {
    const stops = buildStopsByTileId([
      line({ id: "r0", tileIds: ["a", "b"], complete: true }),
      line({ id: "c0", lineType: "column", tileIds: ["a", "c"], complete: true }),
      line({ id: "d0", lineType: "diagonal", tileIds: ["x"], complete: true }),
    ]);
    expect(stops.get("a")).toEqual([
      { lineId: "r0", index: 0, length: 2 },
      { lineId: "c0", index: 0, length: 2 },
    ]);
  });
});

describe("pulseOpacityAt", () => {
  const idle = [{ lineId: "r0", index: 0, length: 3 }];

  it("is idle base when reduced motion", () => {
    expect(pulseOpacityAt(0, idle, new Map(), 0, true)).toBe(IDLE_BASE);
  });

  it("uses boost base when reduced motion and the line is boosted", () => {
    expect(pulseOpacityAt(0, idle, new Map([["r0", 100]]), 50, true)).toBe(BOOST_BASE);
  });

  it("waves from mid idle at t=0, index 0", () => {
    expect(pulseOpacityAt(0, idle, new Map(), 0, false)).toBeCloseTo(IDLE_BASE + IDLE_AMP * 0.5);
  });

  it("peaks idle at a quarter period", () => {
    expect(pulseOpacityAt(LINE_PULSE_PERIOD_MS / 4, idle, new Map(), 0, false)).toBeCloseTo(IDLE_BASE + IDLE_AMP);
  });

  it("staggers adjacent tiles by LINE_PULSE_PHASE", () => {
    const next = [{ lineId: "r0", index: 1, length: 3 }];
    const expected = IDLE_BASE + IDLE_AMP * 0.5 * (1 + Math.sin(-LINE_PULSE_PHASE));
    expect(pulseOpacityAt(0, next, new Map(), 0, false)).toBeCloseTo(expected);
  });

  it("takes the max when a tile sits on two lines", () => {
    const stops = [
      { lineId: "r0", index: 0, length: 3 },
      { lineId: "c0", index: 1, length: 3 },
    ];
    const a = pulseOpacityAt(0, [stops[0]!], new Map(), 0, false);
    const b = pulseOpacityAt(0, [stops[1]!], new Map(), 0, false);
    expect(pulseOpacityAt(0, stops, new Map(), 0, false)).toBeCloseTo(Math.max(a, b));
  });

  it("uses boost amplitude while nowMs is before expiry", () => {
    const boosted = pulseOpacityAt(0, idle, new Map([["r0", 100]]), 50, false);
    expect(boosted).toBeCloseTo(BOOST_BASE + BOOST_AMP * 0.5);
    expect(pulseOpacityAt(0, idle, new Map([["r0", 100]]), 100, false)).toBeCloseTo(IDLE_BASE + IDLE_AMP * 0.5);
  });
});
