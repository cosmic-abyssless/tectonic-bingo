// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_CACHE_MAX_AGE_MS,
  BOARD_CACHE_MAX_ENTRIES,
  BOARD_CACHE_REFRESH_MS,
  BOARD_CACHE_SCHEMA,
  boardCacheKey,
  clearBoardCache,
  flushBoardCacheWrites,
  readBoardCache,
  removeBoardCacheForSlug,
  scheduleBoardCacheWrite,
  writeBoardCache,
  type StorageLike,
} from "./boardCache";

function memoryStorage(opts: { throwOnSet?: boolean; throwOnGet?: boolean; quota?: number } = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => {
      if (opts.throwOnGet) throw new Error("denied");
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (opts.throwOnSet) throw new Error("quota");
      const used = [...data.entries()].filter(([key]) => key !== k).reduce((a, [, val]) => a + val.length, 0);
      if (opts.quota !== undefined && used + v.length > opts.quota) throw new Error("quota");
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

const BOARD = { tiles: [{ id: "t1" }], lines: [] };
const NOW = 1_000_000_000_000;

describe("boardCache", () => {
  it("removes one bingo's board and parts for one user, and nothing else", () => {
    const storage = memoryStorage();
    for (const [user, key] of [["u1", "gone"], ["u1", "gone:shell"], ["u1", "gone:progress:t1"], ["u1", "gone-too"], ["u1", "kept"], ["u2", "gone"]]) {
      writeBoardCache(user!, key!, "b", BOARD, NOW, storage);
    }
    removeBoardCacheForSlug("u1", "gone", storage);
    expect([...storage.data.keys()].sort()).toEqual([boardCacheKey("u1", "gone-too"), boardCacheKey("u1", "kept"), boardCacheKey("u2", "gone")].sort());
  });

  it("round-trips a board", () => {
    const s = memoryStorage();
    writeBoardCache("u1", "bingo", "b1", BOARD, NOW, s);
    expect(readBoardCache("u1", "bingo", "b1", NOW + 1000, s)).toEqual(BOARD);
  });

  it("keys by user and slug: one user never reads another's copy", () => {
    const s = memoryStorage();
    writeBoardCache("mod", "bingo", "b1", BOARD, NOW, s);
    expect(readBoardCache("player", "bingo", "b1", NOW, s)).toBeUndefined();
    expect(readBoardCache("mod", "other", "b1", NOW, s)).toBeUndefined();
    expect(boardCacheKey("mod", "bingo")).toBe(`board:v${BOARD_CACHE_SCHEMA}:mod:bingo`);
  });

  it("ignores and removes a copy from a different build", () => {
    const s = memoryStorage();
    writeBoardCache("u1", "bingo", "old-build", BOARD, NOW, s);
    expect(readBoardCache("u1", "bingo", "new-build", NOW, s)).toBeUndefined();
    expect(s.data.size).toBe(0);
  });

  it("ignores and removes an expired copy", () => {
    const s = memoryStorage();
    writeBoardCache("u1", "bingo", "b1", BOARD, NOW, s);
    expect(readBoardCache("u1", "bingo", "b1", NOW + BOARD_CACHE_MAX_AGE_MS, s)).toEqual(BOARD);
    expect(readBoardCache("u1", "bingo", "b1", NOW + BOARD_CACHE_MAX_AGE_MS + 1, s)).toBeUndefined();
    expect(s.data.size).toBe(0);
  });

  it("treats corrupt or wrongly-shaped values as empty", () => {
    const s = memoryStorage();
    const key = boardCacheKey("u1", "bingo");
    s.data.set(key, "{not json");
    expect(readBoardCache("u1", "bingo", "b1", NOW, s)).toBeUndefined();
    s.data.set(key, JSON.stringify({ savedAt: "yesterday", build: "b1", data: BOARD }));
    expect(readBoardCache("u1", "bingo", "b1", NOW, s)).toBeUndefined();
  });

  it("keeps only the newest entries", () => {
    const s = memoryStorage();
    for (let i = 0; i < BOARD_CACHE_MAX_ENTRIES + 2; i++) writeBoardCache("u1", `bingo-${i}`, "b1", BOARD, NOW + i, s);
    expect(s.data.size).toBe(BOARD_CACHE_MAX_ENTRIES);
    expect(readBoardCache("u1", "bingo-0", "b1", NOW + 10, s)).toBeUndefined();
    expect(readBoardCache("u1", `bingo-${BOARD_CACHE_MAX_ENTRIES + 1}`, "b1", NOW + 10, s)).toEqual(BOARD);
  });

  it("makes room by dropping other boards when the quota is hit", () => {
    const one = JSON.stringify({ savedAt: NOW, build: "b1", data: BOARD }).length;
    const s = memoryStorage({ quota: one + 5 });
    writeBoardCache("u1", "first", "b1", BOARD, NOW, s);
    writeBoardCache("u1", "second", "b1", BOARD, NOW + 1, s);
    expect(readBoardCache("u1", "second", "b1", NOW + 2, s)).toEqual(BOARD);
    expect(readBoardCache("u1", "first", "b1", NOW + 2, s)).toBeUndefined();
  });

  it("clearBoardCache removes only board entries", () => {
    const s = memoryStorage();
    writeBoardCache("u1", "bingo", "b1", BOARD, NOW, s);
    writeBoardCache("u2", "bingo", "b1", BOARD, NOW, s);
    s.data.set("pref:colorScheme", "dark");
    s.data.set("board:v0:old:bingo", "x");
    clearBoardCache(s);
    expect([...s.data.keys()]).toEqual(["pref:colorScheme"]);
  });

  it("never throws when storage is broken or missing", () => {
    const broken = memoryStorage({ throwOnSet: true, throwOnGet: true });
    expect(() => writeBoardCache("u1", "bingo", "b1", BOARD, NOW, broken)).not.toThrow();
    expect(readBoardCache("u1", "bingo", "b1", NOW, broken)).toBeUndefined();
    expect(() => clearBoardCache(broken)).not.toThrow();
    expect(readBoardCache("u1", "bingo", "b1", NOW, null)).toBeUndefined();
    expect(() => writeBoardCache("u1", "bingo", "b1", BOARD, NOW, null)).not.toThrow();
  });

  it("skips rewriting unchanged data until the refresh window passes", () => {
    const s = memoryStorage();
    const setItem = vi.spyOn(s, "setItem");
    writeBoardCache("u1", "bingo", "b1", BOARD, NOW, s);
    writeBoardCache("u1", "bingo", "b1", { ...BOARD }, NOW + 1000, s);
    expect(setItem).toHaveBeenCalledTimes(1);
    // Changed data, another build, or an old enough copy is written again.
    writeBoardCache("u1", "bingo", "b1", { ...BOARD, lines: [1] }, NOW + 2000, s);
    writeBoardCache("u1", "bingo", "b2", { ...BOARD, lines: [1] }, NOW + 3000, s);
    writeBoardCache("u1", "bingo", "b2", { ...BOARD, lines: [1] }, NOW + 3000 + BOARD_CACHE_REFRESH_MS, s);
    expect(setItem).toHaveBeenCalledTimes(4);
    expect(JSON.parse(s.data.get(boardCacheKey("u1", "bingo"))!)).toEqual({ savedAt: NOW + 3000 + BOARD_CACHE_REFRESH_MS, build: "b2", data: { ...BOARD, lines: [1] } });
  });

  it("recognises unchanged data in a copy written as one JSON.stringify of the whole entry", () => {
    const s = memoryStorage();
    s.data.set(boardCacheKey("u1", "bingo"), JSON.stringify({ savedAt: NOW, build: "b1", data: BOARD }));
    const setItem = vi.spyOn(s, "setItem");
    writeBoardCache("u1", "bingo", "b1", BOARD, NOW + 1, s);
    expect(setItem).not.toHaveBeenCalled();
  });

  describe("scheduled writes", () => {
    afterEach(() => {
      clearBoardCache(null);
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("writes only the latest data per key, and nothing before the flush", () => {
      const s = memoryStorage();
      scheduleBoardCacheWrite("u1", "bingo", "b1", { tiles: [], lines: [] }, NOW);
      scheduleBoardCacheWrite("u1", "bingo", "b1", BOARD, NOW + 1);
      scheduleBoardCacheWrite("u1", "bingo:shell", "b1", { name: "x" }, NOW + 2);
      expect(s.data.size).toBe(0);
      flushBoardCacheWrites(s);
      expect(readBoardCache("u1", "bingo", "b1", NOW + 3, s)).toEqual(BOARD);
      expect(readBoardCache("u1", "bingo:shell", "b1", NOW + 3, s)).toEqual({ name: "x" });
      // Nothing is left over for a later flush.
      s.data.clear();
      flushBoardCacheWrites(s);
      expect(s.data.size).toBe(0);
    });

    it("flushes on its own once the browser is idle", () => {
      vi.useFakeTimers();
      const s = memoryStorage();
      vi.stubGlobal("localStorage", s);
      scheduleBoardCacheWrite("u1", "bingo", "b1", BOARD, NOW);
      expect(s.data.size).toBe(0);
      vi.runAllTimers();
      expect(readBoardCache("u1", "bingo", "b1", NOW, s)).toEqual(BOARD);
    });

    it("drops waiting writes for a removed bingo, and all of them on logout", () => {
      const s = memoryStorage();
      scheduleBoardCacheWrite("u1", "gone", "b1", BOARD, NOW);
      scheduleBoardCacheWrite("u1", "gone:shell", "b1", BOARD, NOW);
      scheduleBoardCacheWrite("u1", "kept", "b1", BOARD, NOW);
      removeBoardCacheForSlug("u1", "gone", s);
      flushBoardCacheWrites(s);
      expect([...s.data.keys()]).toEqual([boardCacheKey("u1", "kept")]);

      scheduleBoardCacheWrite("u1", "kept", "b1", { ...BOARD, lines: [1] }, NOW + 1);
      clearBoardCache(s);
      flushBoardCacheWrites(s);
      expect(s.data.size).toBe(0);
    });
  });
});
