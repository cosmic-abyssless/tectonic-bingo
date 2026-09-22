// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchesSearch } from "./tableSearch";

describe("matchesSearch", () => {
  it("matches case-insensitively against any of the given values", () => {
    expect(matchesSearch(["Zukd Tz Kok", "hard"], "tz kok")).toBe(true);
    expect(matchesSearch(["Zukd Tz Kok", "hard"], "TZ KOK")).toBe(true);
    expect(matchesSearch(["Zukd Tz Kok", "hard"], "nope")).toBe(false);
  });

  it("treats a blank or whitespace-only query as matching everything", () => {
    expect(matchesSearch(["anything"], "")).toBe(true);
    expect(matchesSearch(["anything"], "   ")).toBe(true);
    expect(matchesSearch([], "")).toBe(true);
  });

  it("skips null/undefined values without matching them or throwing", () => {
    expect(matchesSearch([null, undefined, "found it"], "found")).toBe(true);
    expect(matchesSearch([null, undefined], "anything")).toBe(false);
  });

  it("matches numeric values by their string form", () => {
    expect(matchesSearch([42, "ehb"], "42")).toBe(true);
  });
});
