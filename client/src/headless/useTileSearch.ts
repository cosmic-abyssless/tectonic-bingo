import { useEffect, useRef, useState } from "react";
import type { Tile, TileCategory } from "@bingo/shared";
import { sealedTileMatchesSearch, tileMatchesSearch } from "../core/board/requirementTree";
import { useTileTagHits } from "../api/queries";
import type { TileSearchModel } from "./types";

const SUGGESTION_CAP = 8;

/** `tagHits`: the Tiles the server found by their Tags for the query (useTileTagHits). */
export type TileMatcher = (tile: Tile, q: string, tagHits?: ReadonlySet<string>) => boolean;

/**
 * How the board's search finds a tile: by its name, Parts, Items and Tags, or while sealed by its name and Category
 * only.
 */
export function tileSearchMatcher(sealed: boolean, categories: TileCategory[]): TileMatcher {
  if (!sealed) return tileMatchesSearch;
  const labelById = new Map(categories.map((c) => [c.id, c.label]));
  return (tile, q) => sealedTileMatchesSearch(tile, tile.categoryId ? (labelById.get(tile.categoryId) ?? null) : null, q);
}

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
// draws it on react-aria's ComboBox, which owns the keyboard. `onChoose` is called with the picked tile's id.
// `tagSlug`: the bingo whose Tags (CONTEXT.md "Tag") the server searches for the query; null where they aren't searched
// (while the Tiles are sealed).
export function useTileSearch(tiles: Tile[], matches: TileMatcher, onChoose: (tileId: string) => void, tagSlug: string | null = null): TileSearchModel {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sq = query.trim().toLowerCase();
  const tagHits = useTileTagHits(tagSlug, sq);
  const allMatching = sq ? tiles.filter((t) => matches(t, sq, tagHits)) : [];
  const matching = allMatching.slice(0, SUGGESTION_CAP);

  function choose(tileId: string) {
    onChoose(tileId);
    setQuery("");
    setHighlightedId(null);
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
    highlightedId,
    setHighlightedId,
    choose,
    inputRef,
    tagHits,
  };
}
