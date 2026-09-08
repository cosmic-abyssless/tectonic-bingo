import { describe, expect, it } from "vitest";
import { findBestMatch, fuzzyIncludes, levenshteinWithin, normalizeForMatch } from "./textMatchService";

describe("normalizeForMatch", () => {
  it("lowercases and strips everything but letters and digits", () => {
    expect(normalizeForMatch("Rogues' Den")).toBe("roguesden");
    expect(normalizeForMatch("Mastering Mixology")).toBe("masteringmixology");
    expect(normalizeForMatch("0ldSchoolRuneScepe.")).toBe("0ldschoolrunescepe");
  });
});

describe("levenshteinWithin", () => {
  it("accepts identical strings at distance 0", () => {
    expect(levenshteinWithin("abcdefghij", "abcdefghij", 0)).toBe(true);
  });

  it("accepts exactly the boundary distance", () => {
    expect(levenshteinWithin("abcdefghij", "xbcdefghik", 2)).toBe(true);
  });

  it("rejects one edit past the boundary", () => {
    expect(levenshteinWithin("abcdefghij", "xxxdefghij", 2)).toBe(false);
  });

  it("rejects when the length difference alone exceeds max", () => {
    expect(levenshteinWithin("short", "a-much-longer-string", 2)).toBe(false);
  });
});

describe("fuzzyIncludes — real OCR errors observed against ppu-paddle-ocr on OSRS screenshots", () => {
  it("matches a 1-character substitution (Fishing Trauler -> Fishing Trawler)", () => {
    expect(fuzzyIncludes(["Fishing Trauler"], "Fishing Trawler")).toBe(true);
  });

  it("matches after normalization plus edits (0ldSchoolRuneScepe -> Old School RuneScape)", () => {
    expect(fuzzyIncludes(["Welcome to 0ldSchoolRuneScepe."], "Old School RuneScape")).toBe(true);
  });

  it("matches after normalization alone, no edits needed (dropped space)", () => {
    expect(fuzzyIncludes(["MasteringMixology"], "Mastering Mixology")).toBe(true);
  });

  it("matches after normalization alone, no edits needed (dropped space + apostrophe)", () => {
    expect(fuzzyIncludes(["Rogues'Den"], "Rogues' Den")).toBe(true);
  });

  it("matches a 1-character substitution (Halloved -> Hallowed)", () => {
    expect(fuzzyIncludes(["Halloved Sepulchre"], "Hallowed Sepulchre")).toBe(true);
  });

  it("does not match a similarly-prefixed but genuinely different item", () => {
    expect(fuzzyIncludes(["Zamorakian spear"], "Zamorak hilt")).toBe(false);
  });

  it("does not match a needle 3+ edits away from anything in the line", () => {
    // "fishingtrawler" normalized vs "fxshxngtrxwler" — 3 substitutions,
    // over the length>=12 default of maxEdits: 2.
    expect(fuzzyIncludes(["Fxshxng Trxwler"], "Fishing Trawler")).toBe(false);
  });

  it("only matches within a single line, never across two adjacent lines", () => {
    expect(fuzzyIncludes(["Fishing", "Trawler"], "Fishing Trawler")).toBe(false);
  });
});

describe("fuzzyIncludes — short needles skip edit tolerance", () => {
  it("does not fuzzy-match a 1-edit-away short needle", () => {
    expect(fuzzyIncludes(["Vorky"], "Vorki")).toBe(false);
  });

  it("still matches a short needle via exact normalized substring", () => {
    expect(fuzzyIncludes(["I got a Vorki pet!"], "Vorki")).toBe(true);
  });
});

describe("fuzzyIncludes — codeword mode (explicit maxEdits: 1 regardless of length)", () => {
  it("matches a single-edit codeword typo", () => {
    expect(fuzzyIncludes(["crimson-falcan"], "crimson-falcon", { maxEdits: 1 })).toBe(true);
  });

  it("rejects a 2-edit codeword miss even though the length-based default would allow 2", () => {
    expect(fuzzyIncludes(["crimsom-falcen"], "crimson-falcon", { maxEdits: 1 })).toBe(false);
    // Confirms it's the explicit override doing the rejecting, not just a
    // coincidentally-strict default: without it, this 13-char needle would
    // get maxEdits: 2 by default and this same 2-edit line would pass.
    expect(fuzzyIncludes(["crimsom-falcen"], "crimson-falcon")).toBe(true);
  });
});

describe("findBestMatch", () => {
  const items = [
    { nodeId: "node-a", itemName: "Ahrim's hood", tileId: "tile-a", tileName: "Barrows" },
    { nodeId: "node-b", itemName: "Vorki", tileId: "tile-b", tileName: "Vorkath" },
  ];

  it("returns the first matching item in query order", () => {
    const { detectedMatch } = findBestMatch(["I got a Vorki pet!"], items);
    expect(detectedMatch).toEqual({ tileId: "tile-b", tileName: "Vorkath", nodeId: "node-b", itemName: "Vorki" });
  });

  it("returns null when nothing matches", () => {
    expect(findBestMatch(["Nothing relevant here"], items)).toEqual({ detectedMatch: null });
  });
});
