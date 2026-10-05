// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LineModel } from "../../../headless/types";
import { LINE_PULSE_PERIOD_MS, LINE_PULSE_PHASE, buildStopsByTileId, gradientAngleDeg, linePulseDelayMs, lineWashLayers } from "./linePulse";

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

describe("linePulseDelayMs", () => {
  // comic-line-pulse: opacity (1 - cos)/2 over one period, from a trough.
  const keyframe = (activeMs: number) => 0.5 * (1 - Math.cos((2 * Math.PI * activeMs) / LINE_PULSE_PERIOD_MS));
  // The layer's animation starts at timeline zero, so at time t it is t - delay in.
  const cssOpacity = (timeMs: number, position: number) => keyframe(timeMs - linePulseDelayMs(position));
  // The wave the board has always drawn, as a fraction of the amplitude.
  const wave = (timeMs: number, position: number) =>
    0.5 * (1 + Math.sin((2 * Math.PI * timeMs) / LINE_PULSE_PERIOD_MS - position * LINE_PULSE_PHASE));

  it("stays within one period before the start", () => {
    for (const position of [-0.5, 0, 0.5, 1, 2.5, 4, 6.5, 10]) {
      const delay = linePulseDelayMs(position);
      expect(delay).toBeLessThanOrEqual(0);
      expect(delay).toBeGreaterThan(-LINE_PULSE_PERIOD_MS);
    }
  });

  it("puts the line's first Tile a quarter period in, rising from mid-wave", () => {
    expect(linePulseDelayMs(0)).toBeCloseTo(-LINE_PULSE_PERIOD_MS / 4);
  });

  it("lags each Tile along the line by LINE_PULSE_PHASE", () => {
    const stepMs = (LINE_PULSE_PHASE / (2 * Math.PI)) * LINE_PULSE_PERIOD_MS;
    const lead = (position: number) => -linePulseDelayMs(position);
    expect((lead(0) - lead(1) + LINE_PULSE_PERIOD_MS) % LINE_PULSE_PERIOD_MS).toBeCloseTo(stepMs);
  });

  it("reproduces the travelling sine at every time and position", () => {
    for (const position of [-0.5, 0, 0.5, 1, 1.5, 3, 4.5]) {
      for (const timeMs of [0, 137, 600, 1200, 1800, 2399, 5000, 98765]) {
        expect(cssOpacity(timeMs, position)).toBeCloseTo(wave(timeMs, position));
      }
    }
  });
});

describe("lineWashLayers", () => {
  const stop = { lineId: "r0", index: 1, length: 3, angleDeg: 90 };

  it("samples the near edge, middle and far edge of the Tile", () => {
    expect(lineWashLayers(stop).map((layer) => layer.position)).toEqual([0.5, 1, 1.5]);
  });

  it("orients every layer along the line, each peaking where it samples", () => {
    const wash = "color-mix(in srgb, var(--tile-complete) var(--line-pulse-amp), transparent)";
    expect(lineWashLayers(stop).map((layer) => layer.backgroundImage)).toEqual([
      `linear-gradient(90deg, ${wash} 0%, transparent 50%)`,
      `linear-gradient(90deg, transparent 0%, ${wash} 50%, transparent 100%)`,
      `linear-gradient(90deg, transparent 50%, ${wash} 100%)`,
    ]);
  });
});
