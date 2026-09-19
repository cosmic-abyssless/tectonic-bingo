// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BOARD_CACHE_MAX_AGE_MS,
  BOARD_CACHE_MAX_ENTRIES,
  BOARD_CACHE_SCHEMA,
  boardCacheKey,
  clearBoardCache,
  readBoardCache,
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
});
