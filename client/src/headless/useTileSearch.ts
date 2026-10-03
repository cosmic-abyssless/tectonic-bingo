import { useEffect, useMemo, useRef, useState } from "react";
import type { Tile } from "@bingo/shared";
import type { TileMatcher } from "../core/board/tileSearch";
import type { TileSearchModel } from "./types";

const SUGGESTION_CAP = 8;

type ShortcutKey = Pick<globalThis.KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "defaultPrevented">;
type FocusedElement = { tagName: string; isContentEditable?: boolean } | null;

/**
 * Whether a keydown on the board should jump to the Tile search (#385): a bare `/` (Shift is allowed, since some
 * layouts need it for `/`), and not while typing in a field or while a dialog is open.
 */
export function slashFocusesSearch(e: ShortcutKey, focused: FocusedElement, dialogOpen: boolean): boolean {
  if (e.key !== "/" || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (dialogOpen) return false;
  if (focused && (focused.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName))) return false;
  return true;
}

const OPEN_DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';

// The board's Tile search: the query, the Tiles it matches (the first few) and which one the list is on. Each theme
// draws it on react-aria's ComboBox, which owns the keyboard. `onChoose` is called with the picked tile's id. It
// matches in the browser (`matches`: core/board/tileSearch.ts), so each letter's answer is there in the same frame.
// `onHighlight`: the row the list is on (arrow keys, hovering), for the Tiles to light up; it isn't kept as state here.
export function useTileSearch(tiles: Tile[], matches: TileMatcher, onChoose: (tileId: string) => void, onHighlight: (tileId: string | null) => void): TileSearchModel {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // In board order, row by row.
  const ordered = useMemo(() => [...tiles].sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol), [tiles]);
  const allMatching = useMemo(() => (query.trim() ? ordered.filter((t) => matches(t, query)) : []), [ordered, matches, query]);
  const matching = allMatching.slice(0, SUGGESTION_CAP);
  const matchIds = useMemo(() => (query.trim() ? new Set(allMatching.map((t) => t.id)) : null), [query, allMatching]);

  function choose(tileId: string) {
    onChoose(tileId);
    setQuery("");
    onHighlight(null);
  }

  // "/" anywhere on the board focuses the search, unless the viewer is typing somewhere or a dialog is open.
  useEffect(() => {
    function onDocumentKeyDown(e: globalThis.KeyboardEvent) {
      const input = inputRef.current;
      if (!input || !slashFocusesSearch(e, document.activeElement as HTMLElement | null, !!document.querySelector(OPEN_DIALOG))) return;
      e.preventDefault();
      input.focus();
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, []);

  return {
    query,
    setQuery,
    clear: () => setQuery(""),
    focused,
    setFocused,
    results: matching.map((t) => ({ id: t.id, name: t.name })),
    overflowCount: Math.max(0, allMatching.length - SUGGESTION_CAP),
    setHighlightedId: onHighlight,
    choose,
    inputRef,
    matchIds,
  };
}
