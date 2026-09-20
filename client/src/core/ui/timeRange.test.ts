import { describe, expect, it } from "vitest";
import { fromLocalInput, isInverted, isRangeSet, presetRange, rangeSummary, toLocalInput } from "./timeRange";

// Built from local-time parts so the tests hold in any timezone.
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe("toLocalInput / fromLocalInput", () => {
  it("round-trips a local time through the datetime-local format", () => {
    const iso = local(2026, 9, 20, 14, 5).toISOString();
    expect(toLocalInput(iso)).toBe("2026-09-20T14:05");
    expect(fromLocalInput("2026-09-20T14:05", "start")).toBe(iso);
  });

  it("runs the end of a range to the end of the chosen minute", () => {
    const start = new Date(fromLocalInput("2026-09-20T14:05", "start")!).getTime();
    const end = new Date(fromLocalInput("2026-09-20T14:05", "end")!).getTime();
    expect(end - start).toBe(59_999);
  });

  it("treats an empty, cleared or unparseable value as unset", () => {
    expect(fromLocalInput("", "start")).toBeUndefined();
    expect(fromLocalInput("not a date", "end")).toBeUndefined();
    expect(toLocalInput(undefined)).toBe("");
    expect(toLocalInput("garbage")).toBe("");
  });
});

describe("presetRange", () => {
  const now = local(2026, 9, 20, 12, 0);

  it("starts the window a fixed time back and leaves the end open", () => {
    expect(presetRange("hour", now)).toEqual({ since: local(2026, 9, 20, 11, 0).toISOString() });
    expect(presetRange("day", now)).toEqual({ since: new Date(now.getTime() - 86_400_000).toISOString() });
    expect(presetRange("week", now).until).toBeUndefined();
    expect(new Date(presetRange("month", now).since!).getTime()).toBe(now.getTime() - 30 * 86_400_000);
  });
});

describe("isRangeSet / isInverted", () => {
  it("knows when either side is set", () => {
    expect(isRangeSet({})).toBe(false);
    expect(isRangeSet({ since: "2026-09-20T00:00:00Z" })).toBe(true);
    expect(isRangeSet({ until: "2026-09-20T00:00:00Z" })).toBe(true);
  });

  it("flags a start that comes after the end", () => {
    expect(isInverted({ since: "2026-09-21T00:00:00Z", until: "2026-09-20T00:00:00Z" })).toBe(true);
    expect(isInverted({ since: "2026-09-20T00:00:00Z", until: "2026-09-21T00:00:00Z" })).toBe(false);
    expect(isInverted({ since: "2026-09-21T00:00:00Z" })).toBe(false);
  });
});

describe("rangeSummary", () => {
  const now = local(2026, 9, 20, 12, 0);

  it("describes each shape of window", () => {
    expect(rangeSummary({}, now)).toBe("Any time");
    expect(rangeSummary({ since: local(2026, 9, 20, 9, 0).toISOString() }, now)).toMatch(/^Since /);
    expect(rangeSummary({ until: local(2026, 9, 20, 9, 0).toISOString() }, now)).toMatch(/^Until /);
    expect(rangeSummary({ since: local(2026, 9, 19, 9, 0).toISOString(), until: local(2026, 9, 20, 9, 0).toISOString() }, now)).toContain(" – ");
  });

  it("names the year only when it isn't the current one", () => {
    expect(rangeSummary({ since: local(2026, 3, 1, 9, 0).toISOString() }, now)).not.toContain("2026");
    expect(rangeSummary({ since: local(2025, 3, 1, 9, 0).toISOString() }, now)).toContain("2025");
  });
});
