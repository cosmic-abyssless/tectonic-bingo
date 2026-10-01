import { describe, expect, it } from "vitest";
import { parseUrlSet, serializeUrlSet, withParams } from "./urlParams";

describe("withParams", () => {
  it("sets and removes several params in one go, leaving the rest and the original alone", () => {
    const prev = new URLSearchParams("tile=t1&team=a&tab=x");
    const next = withParams(prev, { tile: null, team: "b", open: "rules" });
    expect(next.toString()).toBe("team=b&tab=x&open=rules");
    expect(prev.toString()).toBe("tile=t1&team=a&tab=x");
  });
});

describe("parseUrlSet / serializeUrlSet", () => {
  it("reads an absent param as the default and an empty one as nothing picked", () => {
    expect([...parseUrlSet(null, ["pending"])]).toEqual(["pending"]);
    expect([...parseUrlSet("", ["pending"])]).toEqual([]);
    expect([...parseUrlSet("pending,approved,", [])]).toEqual(["pending", "approved"]);
  });

  it("leaves the default out of the URL, in any order", () => {
    expect(serializeUrlSet(["pending"], ["pending"])).toBeNull();
    expect(serializeUrlSet(["b", "a"], ["a", "b"])).toBeNull();
    expect(serializeUrlSet([], [])).toBeNull();
  });

  it("writes anything else as a comma list, nothing picked as an empty one", () => {
    expect(serializeUrlSet(["pending", "approved"], ["pending"])).toBe("pending,approved");
    expect(serializeUrlSet([], ["pending"])).toBe("");
  });

  it("round-trips", () => {
    for (const picks of [["approved"], [], ["pending", "rejected"]]) {
      const value = serializeUrlSet(picks, ["pending"]);
      expect([...parseUrlSet(value, ["pending"])].sort()).toEqual([...picks].sort());
    }
  });
});
