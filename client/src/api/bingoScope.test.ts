import { describe, expect, it } from "vitest";
import { MAX_WATCHED_BINGOS } from "@bingo/shared";
import { bingoSlugOfPath, keyMentions, otherBingoSlugs, unwatchedBingoSlugs, watchedBingoIds } from "./bingoScope";

describe("bingoSlugOfPath", () => {
  it("finds the slug on a bingo's pages and nowhere else", () => {
    expect(bingoSlugOfPath("/b/summer-bingo")).toBe("summer-bingo");
    expect(bingoSlugOfPath("/b/summer-bingo/mod")).toBe("summer-bingo");
    expect(bingoSlugOfPath("/")).toBeNull();
    expect(bingoSlugOfPath("/admin")).toBeNull();
  });
});

describe("keyMentions", () => {
  it("matches a slug wherever it sits in the key", () => {
    const slugs = new Set(["other"]);
    expect(keyMentions(["teamProgress", "other", "team-1"], slugs)).toBe(true);
    expect(keyMentions(["wrapped", "state", "other"], slugs)).toBe(true);
    expect(keyMentions(["teamProgress", "mine", "team-1"], slugs)).toBe(false);
    expect(keyMentions(["bug"], new Set())).toBe(false);
  });
});

describe("otherBingoSlugs", () => {
  it("lists the cached bingos that aren't the event's, and skips shells without data", () => {
    const shells = [
      [["bingo", "mine"], { bingo: { id: "b1" } }],
      [["bingo", "other"], { bingo: { id: "b2" } }],
      [["bingo", "loading"], undefined],
    ] as const;
    expect(otherBingoSlugs(shells, "b1")).toEqual(new Set(["other"]));
    expect(otherBingoSlugs(shells, "b3")).toEqual(new Set(["mine", "other"]));
  });
});

describe("unwatchedBingoSlugs", () => {
  it("lists the cached bingos outside the watched ones, and none when nothing is cached", () => {
    const shells = [
      [["bingo", "a"], { bingo: { id: "b1" } }],
      [["bingo", "b"], { bingo: { id: "b2" } }],
      [["bingo", "c"], { bingo: { id: "b3" } }],
      [["bingo", "loading"], undefined],
    ] as const;
    expect(unwatchedBingoSlugs(shells, new Set(["b1", "b3"]))).toEqual(new Set(["b"]));
    expect(unwatchedBingoSlugs(shells, new Set())).toEqual(new Set(["a", "b", "c"]));
    expect(unwatchedBingoSlugs([], new Set())).toEqual(new Set());
  });
});

describe("watchedBingoIds", () => {
  it("lists the cached shells' bingos once each, sorted, skipping shells without data", () => {
    const shells = [
      { data: { bingo: { id: "b2" } }, dataUpdatedAt: 3 },
      { data: { bingo: { id: "b1" } }, dataUpdatedAt: 1 },
      { data: undefined, dataUpdatedAt: 0 },
      { data: { bingo: { id: "b2" } }, dataUpdatedAt: 2 },
    ];
    expect(watchedBingoIds(shells)).toEqual(["b1", "b2"]);
    expect(watchedBingoIds([])).toEqual([]);
  });

  it("keeps the most recently fetched when there are more than the server takes", () => {
    const shells = Array.from({ length: MAX_WATCHED_BINGOS + 5 }, (_, i) => ({ data: { bingo: { id: `b${String(i).padStart(3, "0")}` } }, dataUpdatedAt: i }));
    const ids = watchedBingoIds(shells);
    expect(ids).toHaveLength(MAX_WATCHED_BINGOS);
    expect(ids).toContain(`b${String(MAX_WATCHED_BINGOS + 4).padStart(3, "0")}`);
    expect(ids).not.toContain("b000");
  });
});
