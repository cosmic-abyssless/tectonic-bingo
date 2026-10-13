import { describe, expect, it } from "vitest";
import { ALL, inclusionFilter, storedPicks } from "./inclusionFilter";

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

  it("treats everything ticked (All) like Any, so an unlisted or new key still matches", () => {
    const f = inclusionFilter(new Set(["a", "b", "c"]), OPTIONS);
    expect(f).toMatchObject({ checked: ["a", "b", "c"], query: undefined, narrowed: false });
    expect(f.matches("new")).toBe(true);
  });

  it("keeps All as All when an option turns up after it was picked", () => {
    const picked = storedPicks(["a", "b", "c"], OPTIONS);
    expect(picked).toEqual([ALL]);
    const f = inclusionFilter(new Set(picked), [...OPTIONS, { key: "d" }]);
    expect(f).toMatchObject({ checked: ["a", "b", "c", "d"], narrowed: false });
    expect(f.matches("d")).toBe(true);
  });

  it("keeps the picks themselves when some option is left out", () => {
    expect(storedPicks(["a", "c"], OPTIONS)).toEqual(["a", "c"]);
    expect(storedPicks([], OPTIONS)).toEqual([]);
  });

  it("ignores ticks for options that are no longer there, and is Any again if none are left", () => {
    expect(inclusionFilter(new Set(["b", "gone"]), OPTIONS).checked).toEqual(["b"]);
    expect(inclusionFilter(new Set(["gone"]), OPTIONS).narrowed).toBe(false);
  });
});
