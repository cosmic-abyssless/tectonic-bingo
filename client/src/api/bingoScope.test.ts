import { describe, expect, it } from "vitest";
import { bingoSlugOfPath, keyMentions, otherBingoSlugs } from "./bingoScope";

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
