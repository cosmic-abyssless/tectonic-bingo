import { describe, expect, it } from "vitest";
import { HEADING_LETTERED, LETTERED, letteringClasses } from "./lettering";
import { tokensToCssVars } from "./tokens";
import { COMIC_FONT } from "./comic/font";

// comic.css matches these classes where it used to match the style attribute, so a style must get the class whenever
// its serialised form would have matched [style*="Bangers"] / [style*="--font-heading"].
describe("letteringClasses", () => {
  it("marks a style that names Bangers or the heading font, and nothing else", () => {
    expect(letteringClasses({ fontFamily: COMIC_FONT })).toBe(LETTERED);
    expect(letteringClasses({ fontFamily: "var(--font-heading, inherit)" })).toBe(HEADING_LETTERED);
    expect(letteringClasses({ color: "red" })).toBe("");
    expect(letteringClasses(undefined)).toBe("");
  });

  it("marks a theme's CSS variables when the theme sets a heading font", () => {
    const tile = { bg: "#fff", border: "#000", empty: "#eee", accent: "#f00", complete: "#0f0", frozen: "#00f" };
    expect(letteringClasses(tokensToCssVars({ tile, chrome: { headingFont: COMIC_FONT } }))).toBe(`${LETTERED} ${HEADING_LETTERED}`);
    expect(letteringClasses(tokensToCssVars({ tile }))).toBe("");
  });
});
