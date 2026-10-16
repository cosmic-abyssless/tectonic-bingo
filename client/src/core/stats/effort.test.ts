import { describe, expect, it } from "vitest";
import { formatEffortHours, formatEffortShare, tileEffortByPlayer } from "./effort";

describe("formatEffortHours", () => {
  it("shows one decimal place", () => {
    expect(formatEffortHours(14.24)).toBe("14.2 h");
    expect(formatEffortHours(3)).toBe("3.0 h");
    expect(formatEffortHours(0.04)).toBe("0.0 h");
  });
});

describe("formatEffortShare", () => {
  it("shows a percentage to at most one decimal place", () => {
    expect(formatEffortShare(23)).toBe("23%");
    expect(formatEffortShare(23.44)).toBe("23.4%");
  });
});

describe("tileEffortByPlayer", () => {
  const rows = [
    { tileId: "vork", teamId: "a", userId: "alice", hours: 2 },
    { tileId: "vork", teamId: "a", userId: "bob", hours: 6 },
    { tileId: "vork", teamId: "b", userId: "carol", hours: 4 },
    { tileId: "zul", teamId: "a", userId: "alice", hours: 9 },
  ];

  it("lists the Tile's Players of the Teams shown, largest first", () => {
    expect(tileEffortByPlayer(rows, "vork", new Set(["a", "b"])).map((r) => r.userId)).toEqual(["bob", "carol", "alice"]);
    expect(tileEffortByPlayer(rows, "vork", new Set(["a"])).map((r) => r.userId)).toEqual(["bob", "alice"]);
    expect(tileEffortByPlayer(rows, "other", new Set(["a", "b"]))).toEqual([]);
  });
});
