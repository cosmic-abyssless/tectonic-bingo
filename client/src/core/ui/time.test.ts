import { describe, expect, it } from "vitest";
import { formatLocalDateTime, formatMinutesSeconds, formatShortDuration } from "./time";

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe("formatMinutesSeconds", () => {
  it("is minutes and two-digit seconds, rounding a part second up so it never shows 0:00 early", () => {
    expect(formatMinutesSeconds(9 * 60_000 + 5_000)).toBe("9:05");
    expect(formatMinutesSeconds(59_500)).toBe("1:00");
    expect(formatMinutesSeconds(400)).toBe("0:01");
    expect(formatMinutesSeconds(0)).toBe("0:00");
  });
});

describe("formatLocalDateTime", () => {
  it("names the time zone it's shown in", () => {
    const start = Date.UTC(2026, 9, 8, 0, 2); // 8:02 PM on the 7th in New York
    expect(formatLocalDateTime(start, "en-US", "America/New_York")).toBe("Wed, Oct 7, 8:02 PM EDT");
    expect(formatLocalDateTime(start, "en-US", "UTC")).toBe("Thu, Oct 8, 12:02 AM UTC");
  });
});

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
