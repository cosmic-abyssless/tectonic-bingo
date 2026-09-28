import { describe, expect, it } from "vitest";
import { hasReachedOutro, rememberOutroReached } from "./wrappedOutroStore";

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("wrappedOutroStore", () => {
  it("remembers reaching the Outro per Bingo", () => {
    const storage = memoryStorage();
    expect(hasReachedOutro("winter", storage)).toBe(false);
    rememberOutroReached("winter", storage);
    expect(hasReachedOutro("winter", storage)).toBe(true);
    expect(hasReachedOutro("summer", storage)).toBe(false);
  });

  it("tolerates storage that's missing or throws", () => {
    expect(hasReachedOutro("winter", null)).toBe(false);
    expect(() => rememberOutroReached("winter", null)).not.toThrow();
    expect(hasReachedOutro("winter", broken)).toBe(false);
    expect(() => rememberOutroReached("winter", broken)).not.toThrow();
  });
});
