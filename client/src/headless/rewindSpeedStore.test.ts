import { describe, expect, it } from "vitest";
import {
  readRewindSpeed,
  REWIND_SPEED_STORAGE_KEY,
  writeRewindSpeed,
} from "./rewindSpeedStore";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("rewindSpeedStore", () => {
  it("starts at 1x for a viewer who never chose a speed", () => {
    expect(readRewindSpeed(memoryStorage())).toBe(1);
    expect(readRewindSpeed(null)).toBe(1);
  });

  it("remembers the chosen speed", () => {
    const storage = memoryStorage();
    writeRewindSpeed(4, storage);
    expect(readRewindSpeed(storage)).toBe(4);
  });

  it("falls back to 1x for a stored value that isn't a speed any more", () => {
    const storage = memoryStorage();
    storage.setItem(REWIND_SPEED_STORAGE_KEY, "3");
    expect(readRewindSpeed(storage)).toBe(1);
  });

  it("shrugs off storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(() => writeRewindSpeed(2, broken)).not.toThrow();
    expect(readRewindSpeed(broken)).toBe(1);
  });
});
