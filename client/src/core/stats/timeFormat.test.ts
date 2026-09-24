import { describe, expect, it } from "vitest";
import { sinceStart } from "./timeFormat";

describe("sinceStart", () => {
  const start = new Date(2026, 8, 20, 18, 0);

  it("counts days from 1 and pads the minutes", () => {
    expect(sinceStart(new Date(2026, 8, 20, 18, 7), start)).toBe("D1 +0h07m");
    expect(sinceStart(new Date(2026, 8, 21, 23, 12), start)).toBe("D2 +5h12m");
  });

  it("says so for anything before the start", () => {
    expect(sinceStart(new Date(2026, 8, 20, 17, 59), start)).toBe("Before start");
  });
});
