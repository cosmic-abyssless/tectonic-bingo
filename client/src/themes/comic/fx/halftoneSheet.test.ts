import { describe, expect, it } from "vitest";
import { halftoneCoverage } from "./halftoneSheet";

// One dot alone in the middle of a sheet (the grid's other dots all get tone 0), at radius `r` device pixels.
const inkOfDot = (r: number, scale = 1) => {
  const step = 24;
  const coverage = halftoneCoverage({ width: step, height: step, step, scale, tone: (x, y) => (x === step / 2 && y === step / 2 ? r / scale / (step * 0.62) : 0) });
  return coverage.reduce((sum, a) => sum + a / 255, 0);
};

describe("halftone dot ink", () => {
  it("never shrinks as a dot grows", () => {
    for (const scale of [1, 1.25, 2]) {
      let last = 0;
      for (let r = 0.1; r <= 8; r += 0.05) {
        const ink = inkOfDot(r, scale);
        expect(ink).toBeGreaterThanOrEqual(last);
        last = ink;
      }
    }
  });

  it("puts down the dot's area in ink, however small (#332)", () => {
    for (let r = 0.3; r <= 8; r += 0.1) expect(inkOfDot(r) / (Math.PI * r * r)).toBeCloseTo(1, 1);
  });
});
