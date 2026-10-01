import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Tile, TileCategory } from "@bingo/shared";
import { sealedTileMatchesSearch, tileMatchesSearch } from "../core/board/requirementTree";
import type { TileSearchModel } from "./types";

const SUGGESTION_CAP = 8;

export type TileMatcher = (tile: Tile, q: string) => boolean;

/** How the board's search finds a tile: by its name, Parts and Items, or while sealed by its name and Category only. */
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

// Ports the old local TileSearch component's state machine (query, focus,
// highlight, keyboard nav, the 150ms blur-close timeout) out of
// pages/BingoPage.tsx. `onChoose` is called with the picked tile's id.
export function useTileSearch(tiles: Tile[], matches: TileMatcher, onChoose: (tileId: string) => void): TileSearchModel {
  const [query, setQueryState] = useState("");
  const [focused, setFocusedState] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // blur()'s 150ms grace period exists so clicking a dropdown result (which
  // blurs the input first) doesn't close the dropdown before the click
  // registers. But a blur can also be immediately reversed without a
  // dropdown click — e.g. the clear button blurs the input then calls
  // .focus() on it again synchronously. Without this, that stale timeout
  // still fires 150ms later and force-closes an otherwise-legitimate focus.
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearPendingBlur() {
    if (blurTimeoutRef.current !== null) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }

  function setFocused(f: boolean) {
    if (f) clearPendingBlur();
    setFocusedState(f);
  }

  const sq = query.trim().toLowerCase();
  const allMatching = sq ? tiles.filter((t) => matches(t, sq)) : [];
  const matching = allMatching.slice(0, SUGGESTION_CAP);
  const showDropdown = focused && sq.length > 0 && matching.length > 0;

  function setQuery(q: string) {
    setQueryState(q);
    setHighlightedIndex(0);
  }

  function clear() {
    setQueryState("");
    setHighlightedIndex(0);
  }

  function choose(tileId: string) {
    onChoose(tileId);
    setQueryState("");
    setFocused(false);
    setHighlightedIndex(0);
  }

  function blur() {
    clearPendingBlur();
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      setFocusedState(false);
    }, 150);
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

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, matching.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const tile = matching[highlightedIndex];
      if (tile) choose(tile.id);
    } else if (e.key === "Escape") {
      setFocused(false);
      setHighlightedIndex(0);
    }
  }

  return {
    query,
    setQuery,
    clear,
    focused,
    setFocused,
    blur,
    results: matching.map((t) => ({ id: t.id, name: t.name })),
    overflowCount: Math.max(0, allMatching.length - SUGGESTION_CAP),
    showDropdown,
    highlightedIndex,
    onKeyDown,
    choose,
    inputRef,
  };
}
