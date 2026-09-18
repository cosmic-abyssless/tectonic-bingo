// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DOMINANT_COLOR_MAX_ENTRIES, DOMINANT_COLOR_STORAGE_KEY, persistColors, readPersistedColors } from "./dominantColorStore";

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(DOMINANT_COLOR_STORAGE_KEY, initial);
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("dominantColorStore", () => {
  it("round-trips found colours in order", () => {
    const s = memoryStorage();
    persistColors(
      new Map([
        ["/uploads/a-thumb.webp", "rgb(1, 2, 3)"],
        ["/uploads/b-thumb.webp", "rgb(200, 100, 50)"],
      ]),
      s,
    );
    expect(readPersistedColors(s)).toEqual([
      ["/uploads/a-thumb.webp", "rgb(1, 2, 3)"],
      ["/uploads/b-thumb.webp", "rgb(200, 100, 50)"],
    ]);
  });

  it("does not persist failed lookups", () => {
    const s = memoryStorage();
    persistColors(
      new Map<string, string | null>([
        ["/uploads/ok.webp", "rgb(9, 9, 9)"],
        ["/uploads/failed.webp", null],
      ]),
      s,
    );
    expect(readPersistedColors(s)).toEqual([["/uploads/ok.webp", "rgb(9, 9, 9)"]]);
  });

  it("keeps only the newest entries", () => {
    const s = memoryStorage();
    const all = new Map<string, string | null>();
    for (let i = 0; i < DOMINANT_COLOR_MAX_ENTRIES + 25; i++) all.set(`/uploads/${i}.webp`, "rgb(5, 5, 5)");
    persistColors(all, s);
    const stored = readPersistedColors(s);
    expect(stored).toHaveLength(DOMINANT_COLOR_MAX_ENTRIES);
    expect(stored[0]![0]).toBe("/uploads/25.webp");
    expect(stored.at(-1)![0]).toBe(`/uploads/${DOMINANT_COLOR_MAX_ENTRIES + 24}.webp`);
  });

  it("drops corrupt or malformed data instead of throwing", () => {
    expect(readPersistedColors(memoryStorage("{nope"))).toEqual([]);
    expect(readPersistedColors(memoryStorage('{"a":"b"}'))).toEqual([]);
    expect(readPersistedColors(memoryStorage(JSON.stringify([["/a", "rgb(1, 2, 3)"], ["/b", "red"], ["/c", 5], "junk", ["/d"]])))).toEqual([["/a", "rgb(1, 2, 3)"]]);
    expect(readPersistedColors(memoryStorage())).toEqual([]);
  });

  it("never throws when storage is missing or broken", () => {
    expect(readPersistedColors(null)).toEqual([]);
    expect(() => persistColors(new Map([["/a", "rgb(1, 2, 3)"]]), null)).not.toThrow();
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readPersistedColors(broken)).toEqual([]);
    expect(() => persistColors(new Map([["/a", "rgb(1, 2, 3)"]]), broken)).not.toThrow();
  });
});
