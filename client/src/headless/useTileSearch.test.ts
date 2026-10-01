import { describe, expect, it } from "vitest";
import { slashFocusesSearch } from "./useTileSearch";

// "/" focuses the board's Tile search (#385).

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; defaultPrevented: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  ...mods,
});
const body = { tagName: "BODY" };

describe("pressing / on the board", () => {
  it("focuses the search from the page", () => {
    expect(slashFocusesSearch(key("/"), body, false)).toBe(true);
    expect(slashFocusesSearch(key("/"), null, false)).toBe(true);
    expect(slashFocusesSearch(key("/"), { tagName: "BUTTON" }, false)).toBe(true);
  });

  it("ignores other keys", () => {
    expect(slashFocusesSearch(key("?"), body, false)).toBe(false);
    expect(slashFocusesSearch(key("s"), body, false)).toBe(false);
  });

  it("types the / when already in a field", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(slashFocusesSearch(key("/"), { tagName }, false)).toBe(false);
    expect(slashFocusesSearch(key("/"), { tagName: "DIV", isContentEditable: true }, false)).toBe(false);
  });

  it("does nothing while a dialog is open", () => {
    expect(slashFocusesSearch(key("/"), body, true)).toBe(false);
  });

  it("does nothing with Ctrl, Meta or Alt held, or once something else handled the key", () => {
    expect(slashFocusesSearch(key("/", { ctrlKey: true }), body, false)).toBe(false);
    expect(slashFocusesSearch(key("/", { metaKey: true }), body, false)).toBe(false);
    expect(slashFocusesSearch(key("/", { altKey: true }), body, false)).toBe(false);
    expect(slashFocusesSearch(key("/", { defaultPrevented: true }), body, false)).toBe(false);
  });
});
