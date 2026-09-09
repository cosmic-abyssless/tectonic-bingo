import { useRef, useState, type KeyboardEvent } from "react";
import type { Tile } from "@bingo/shared";
import { tileMatchesSearch } from "../core/board/requirementTree";
import type { TileSearchModel } from "./types";

const SUGGESTION_CAP = 8;

// Ports the old local TileSearch component's state machine (query, focus,
// highlight, keyboard nav, the 150ms blur-close timeout) out of
// pages/BingoPage.tsx. `onChoose` is called with the picked tile's id.
export function useTileSearch(tiles: Tile[], onChoose: (tileId: string) => void): TileSearchModel {
  const [query, setQueryState] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const sq = query.trim().toLowerCase();
  const allMatching = sq ? tiles.filter((t) => tileMatchesSearch(t, sq)) : [];
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
    setTimeout(() => setFocused(false), 150);
  }

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
