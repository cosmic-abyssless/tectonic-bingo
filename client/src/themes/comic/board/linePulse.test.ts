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
  gradientAngleDeg,
  lineWashGradient,
  pulseOpacityAt,
} from "./linePulse";

const line = (over: Partial<LineModel> & Pick<LineModel, "id" | "tileIds" | "complete">): LineModel => ({
  lineType: "row",
  lineIndex: 0,
  points: 15,
  pointsAwarded: over.complete ? 15 : 0,
  ...over,
});

const pos = new Map([
  ["a", { row: 0, col: 0 }],
  ["b", { row: 0, col: 1 }],
  ["c", { row: 0, col: 2 }],
  ["d", { row: 1, col: 0 }],
  ["x", { row: 1, col: 1 }],
]);

describe("gradientAngleDeg", () => {
  it("points right along a row", () => {
    expect(gradientAngleDeg({ row: 0, col: 1 }, { row: 0, col: 0 }, { row: 0, col: 2 })).toBe(90);
  });

  it("points down along a column", () => {
    expect(gradientAngleDeg({ row: 1, col: 0 }, { row: 0, col: 0 }, { row: 2, col: 0 })).toBe(180);
  });

  it("points down-right on a TL-BR diagonal", () => {
    expect(gradientAngleDeg({ row: 1, col: 1 }, { row: 0, col: 0 }, { row: 2, col: 2 })).toBe(135);
  });

  it("uses the remaining neighbor at an endpoint", () => {
    expect(gradientAngleDeg({ row: 0, col: 0 }, undefined, { row: 0, col: 1 })).toBe(90);
    expect(gradientAngleDeg({ row: 0, col: 2 }, { row: 0, col: 1 }, undefined)).toBe(90);
  });
});

describe("buildStopsByTileId", () => {
  it("ignores incomplete lines", () => {
    expect(buildStopsByTileId([line({ id: "r0", tileIds: ["a", "b", "c"], complete: false })], pos).size).toBe(0);
  });

  it("indexes tiles in tileIds order with the line's angle", () => {
    const stops = buildStopsByTileId([line({ id: "r0", tileIds: ["a", "b", "c"], complete: true })], pos);
    expect(stops.get("a")).toEqual([{ lineId: "r0", index: 0, length: 3, angleDeg: 90 }]);
    expect(stops.get("b")).toEqual([{ lineId: "r0", index: 1, length: 3, angleDeg: 90 }]);
    expect(stops.get("c")).toEqual([{ lineId: "r0", index: 2, length: 3, angleDeg: 90 }]);
  });

  it("keeps every completed line a tile sits on, each with its own angle", () => {
    const stops = buildStopsByTileId(
      [
        line({ id: "r0", tileIds: ["a", "b"], complete: true }),
        line({ id: "c0", lineType: "column", tileIds: ["a", "d"], complete: true }),
        line({ id: "d0", lineType: "diagonal", tileIds: ["x"], complete: true }),
      ],
      pos,
    );
    expect(stops.get("a")).toEqual([
      { lineId: "r0", index: 0, length: 2, angleDeg: 90 },
      { lineId: "c0", index: 0, length: 2, angleDeg: 180 },
    ]);
  });
});

describe("pulseOpacityAt", () => {
  const idle = [{ lineId: "r0", index: 0, length: 3, angleDeg: 90 }];

  it("is a static mid-wave when reduced motion", () => {
    expect(pulseOpacityAt(0, idle, new Map(), 0, true)).toBeCloseTo(IDLE_AMP * 0.5);
  });

  it("uses a stronger static mid-wave when reduced motion and the line is boosted", () => {
    expect(pulseOpacityAt(0, idle, new Map([["r0", 100]]), 50, true)).toBeCloseTo(BOOST_AMP * 0.5);
  });

  it("waves from mid idle at t=0, index 0", () => {
    expect(pulseOpacityAt(0, idle, new Map(), 0, false)).toBeCloseTo(IDLE_BASE + IDLE_AMP * 0.5);
  });

  it("troughs to zero at three-quarter period", () => {
    expect(pulseOpacityAt((LINE_PULSE_PERIOD_MS * 3) / 4, idle, new Map(), 0, false)).toBeCloseTo(0);
  });

  it("peaks idle at a quarter period", () => {
    expect(pulseOpacityAt(LINE_PULSE_PERIOD_MS / 4, idle, new Map(), 0, false)).toBeCloseTo(IDLE_BASE + IDLE_AMP);
  });

  it("staggers adjacent tiles by LINE_PULSE_PHASE", () => {
    const next = [{ lineId: "r0", index: 1, length: 3, angleDeg: 90 }];
    const expected = IDLE_BASE + IDLE_AMP * 0.5 * (1 + Math.sin(-LINE_PULSE_PHASE));
    expect(pulseOpacityAt(0, next, new Map(), 0, false)).toBeCloseTo(expected);
  });

  it("takes the max when a tile sits on two lines", () => {
    const stops = [
      { lineId: "r0", index: 0, length: 3, angleDeg: 90 },
      { lineId: "c0", index: 1, length: 3, angleDeg: 180 },
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

describe("lineWashGradient", () => {
  const stop = { lineId: "r0", index: 1, length: 3, angleDeg: 90 };

  it("orients along the line and samples neighbors in the sine", () => {
    const css = lineWashGradient(0, stop, new Map(), 0, false);
    expect(css.startsWith("linear-gradient(90deg, ")).toBe(true);
    expect(css).toContain("0%");
    expect(css).toContain("50%");
    expect(css).toContain("100%");
  });
});
