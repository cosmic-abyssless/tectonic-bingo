// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rememberTheme, rememberedTheme, rememberedThemeForPath } from "./rememberedTheme";

function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("rememberedTheme", () => {
  it("round-trips a bingo's theme by slug", () => {
    const s = memoryStorage();
    rememberTheme("comics", "comic", s);
    rememberTheme("plain", "default", s);
    expect(rememberedTheme("comics", s)).toBe("comic");
    expect(rememberedTheme("plain", s)).toBe("default");
    expect(rememberedTheme("unknown", s)).toBeNull();
  });

  it("finds the theme for a bingo page path, whichever page of it", () => {
    const s = memoryStorage();
    rememberTheme("comics", "comic", s);
    for (const path of ["/b/comics", "/b/comics/", "/b/comics/draft", "/b/comics/stats", "/b/comics/mod"]) {
      expect(rememberedThemeForPath(path, s)).toBe("comic");
    }
  });

  it("returns null for paths that aren't a bingo page", () => {
    const s = memoryStorage();
    rememberTheme("comics", "comic", s);
    for (const path of ["/", "/login", "/admin", "/b", "/bingo/comics", "/x/b/comics"]) {
      expect(rememberedThemeForPath(path, s)).toBeNull();
    }
  });

  it("decodes an encoded slug", () => {
    const s = memoryStorage();
    rememberTheme("my bingo", "comic", s);
    expect(rememberedThemeForPath("/b/my%20bingo", s)).toBe("comic");
  });

  it("never throws when storage is missing or broken", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => rememberTheme("comics", "comic", broken)).not.toThrow();
    expect(rememberedTheme("comics", broken)).toBeNull();
    expect(() => rememberTheme("comics", "comic", null)).not.toThrow();
    expect(rememberedThemeForPath("/b/comics", null)).toBeNull();
  });
});
