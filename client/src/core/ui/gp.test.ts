import { describe, expect, it } from "vitest";
import { formatGp } from "./gp";

describe("formatGp", () => {
  it("shortens the way players write it", () => {
    expect(formatGp(900)).toBe("900");
    expect(formatGp(450_000)).toBe("450k");
    expect(formatGp(1_500_000)).toBe("1.5m");
    expect(formatGp(12_345_678)).toBe("12.3m");
    expect(formatGp(1_234_567_890)).toBe("1.23b");
    expect(formatGp(16_000_000)).toBe("16m");
    expect(formatGp(300_000)).toBe("300k");
  });

  it("shows a missing value as a dash", () => {
    expect(formatGp(null)).toBe("—");
  });
});
