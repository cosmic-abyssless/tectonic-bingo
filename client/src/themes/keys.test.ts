import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@bingo/shared";
import { THEME_KEYS } from "./keys";
import { isKnownTheme } from "./registry";

// The generator checks its `theme` option against THEME_KEYS (the server never loads the client's registry), so the
// list must name every theme the registry can load.
describe("THEME_KEYS", () => {
  it("lists the default theme and every theme the registry loads", () => {
    expect(THEME_KEYS).toContain(DEFAULT_THEME);
    for (const key of THEME_KEYS) if (key !== DEFAULT_THEME) expect(isKnownTheme(key), key).toBe(true);
    expect(isKnownTheme("nope")).toBe(false);
  });
});
