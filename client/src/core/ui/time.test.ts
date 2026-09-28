import { describe, expect, it } from "vitest";
import { formatShortDuration } from "./time";

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe("formatShortDuration", () => {
  it("shows the two largest units", () => {
    expect(formatShortDuration(6 * D + 23 * H + 55 * M)).toBe("6d 23h");
    expect(formatShortDuration(3 * H + 12 * M + 5 * S)).toBe("3h 12m");
  });
  it("drops a zero second unit", () => {
    expect(formatShortDuration(2 * D + 30 * M)).toBe("2d");
  });
  it("counts down to seconds", () => {
    expect(formatShortDuration(45 * S)).toBe("45s");
    expect(formatShortDuration(0)).toBe("0s");
  });
});
