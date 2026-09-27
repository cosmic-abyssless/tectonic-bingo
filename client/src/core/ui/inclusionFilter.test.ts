import { describe, expect, it } from "vitest";
import { inclusionFilter } from "./inclusionFilter";

const OPTIONS = [{ key: "a" }, { key: "b" }, { key: "c" }];

describe("inclusionFilter", () => {
  it("is Any with nothing ticked: not narrowed, no query, and every key matches (a new one too)", () => {
    const f = inclusionFilter(new Set(), OPTIONS);
    expect(f).toMatchObject({ checked: [], query: undefined, narrowed: false });
    expect(["a", "b", "c", "new"].every(f.matches)).toBe(true);
  });

  it("narrows to what's ticked", () => {
    const f = inclusionFilter(new Set(["b"]), OPTIONS);
    expect(f).toMatchObject({ checked: ["b"], query: ["b"], narrowed: true });
    expect(f.matches("b")).toBe(true);
    expect(f.matches("a")).toBe(false);
  });

  it("ignores ticks for options that are no longer there, and is Any again if none are left", () => {
    expect(inclusionFilter(new Set(["b", "gone"]), OPTIONS).checked).toEqual(["b"]);
    expect(inclusionFilter(new Set(["gone"]), OPTIONS).narrowed).toBe(false);
  });
});
