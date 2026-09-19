// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AUTH_CACHE_MAX_AGE_MS, clearAuthCache, readAuthCache, writeAuthCache, type StorageLike } from "./authCache";

function memoryStorage(opts: { throwOnSet?: boolean; throwOnGet?: boolean } = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => {
      if (opts.throwOnGet) throw new Error("denied");
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (opts.throwOnSet) throw new Error("quota");
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

const auth = { user: { id: "u1" }, devMode: true, canGrantAdmin: false };

describe("authCache", () => {
  it("round-trips the user", () => {
    const s = memoryStorage();
    writeAuthCache("b1", auth, 1000, s);
    expect(readAuthCache("b1", 2000, s)).toEqual(auth);
  });

  it("ignores a copy from another build, and drops it", () => {
    const s = memoryStorage();
    writeAuthCache("b1", auth, 1000, s);
    expect(readAuthCache("b2", 2000, s)).toBeNull();
    expect(s.data.size).toBe(0);
  });

  it("ignores an expired copy", () => {
    const s = memoryStorage();
    writeAuthCache("b1", auth, 0, s);
    expect(readAuthCache("b1", AUTH_CACHE_MAX_AGE_MS + 1, s)).toBeNull();
  });

  it("treats corrupt data as no cache", () => {
    const s = memoryStorage();
    s.data.set("auth:v1", "{nope");
    expect(readAuthCache("b1", 0, s)).toBeNull();
  });

  it("degrades to no cache when storage throws or is missing", () => {
    expect(readAuthCache("b1", 0, memoryStorage({ throwOnGet: true }))).toBeNull();
    expect(() => writeAuthCache("b1", auth, 0, memoryStorage({ throwOnSet: true }))).not.toThrow();
    expect(readAuthCache("b1", 0, null)).toBeNull();
    expect(() => writeAuthCache("b1", auth, 0, null)).not.toThrow();
  });

  it("clears", () => {
    const s = memoryStorage();
    writeAuthCache("b1", auth, 0, s);
    clearAuthCache(s);
    expect(readAuthCache("b1", 0, s)).toBeNull();
  });
});
