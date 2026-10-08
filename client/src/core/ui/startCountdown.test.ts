import { describe, expect, it } from "vitest";
import { countdownUnits } from "./startCountdown";

const M = 60_000, H = 60 * M, D = 24 * H;

describe("countdownUnits", () => {
  it("counts from the largest unit that isn't zero, minutes always last", () => {
    expect(countdownUnits(D + 17 * H + 58 * M + 30_000)).toEqual([
      { value: 1, label: "DAY" },
      { value: 17, label: "HRS" },
      { value: 58, label: "MIN" },
    ]);
    expect(countdownUnits(3 * H)).toEqual([
      { value: 3, label: "HRS" },
      { value: 0, label: "MIN" },
    ]);
    expect(countdownUnits(42 * M + 59_000)).toEqual([{ value: 42, label: "MIN" }]);
  });

  it("keeps the hours between days and minutes even when they're zero", () => {
    expect(countdownUnits(2 * D + 5 * M)).toEqual([
      { value: 2, label: "DAYS" },
      { value: 0, label: "HRS" },
      { value: 5, label: "MIN" },
    ]);
  });

  it("says one hour in the singular", () => {
    expect(countdownUnits(H + 20 * M)).toEqual([
      { value: 1, label: "HR" },
      { value: 20, label: "MIN" },
    ]);
  });
});
