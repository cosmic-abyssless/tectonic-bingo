import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Tile } from "@bingo/shared";
import type { TileMatcher } from "../core/board/tileSearch";
import { useTileSearch } from "./useTileSearch";
import type { TileSearchModel } from "./types";

// The board's Tile search, kept apart from the rest of the board page: typing and the highlight moving only re-render the search box itself and the Tiles whose state changes ("dimmed": not found; "highlighted": the
// row the search list is on), never the page, the board model or the other Tiles. The page wraps its board in this, and
// passes its children through untouched, so a change in here leaves them alone.

/** Which Tiles the search dims and highlights, for each Tile to read on its own (useTileDimmed, useTileSearchHighlighted). */
class SearchMarks {
  private matchIds: ReadonlySet<string> | null = null;
  private highlightedId: string | null = null;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  setMatches(matchIds: ReadonlySet<string> | null) {
    if (matchIds === this.matchIds) return;
    this.matchIds = matchIds;
    this.listeners.forEach((listener) => listener());
  }

  /** The search list's highlighted row: straight to the Tiles, not through React state, so moving it re-renders no list. */
  setHighlight = (tileId: string | null) => {
    if (tileId === this.highlightedId) return;
    this.highlightedId = tileId;
    this.listeners.forEach((listener) => listener());
  };

  dimmed = (tileId: string) => this.matchIds !== null && !this.matchIds.has(tileId);
  highlighted = (tileId: string) => this.highlightedId === tileId;
}

const SearchContext = createContext<TileSearchModel | null>(null);
const MarksContext = createContext<SearchMarks | null>(null);

/** `matches`: the board's matcher (core/board/tileSearch.ts). `onChoose`: a picked Tile's id; keep it the same function. */
export function TileSearchProvider({ tiles, matches, onChoose, children }: { tiles: Tile[]; matches: TileMatcher; onChoose: (tileId: string) => void; children: ReactNode }) {
  const [marks] = useState(() => new SearchMarks());
  const search = useTileSearch(tiles, matches, onChoose, marks.setHighlight);
  // Before paint, so a Tile is never drawn a frame late against the list.
  useLayoutEffect(() => marks.setMatches(search.matchIds), [marks, search.matchIds]);
  return (
    <MarksContext.Provider value={marks}>
      <SearchContext.Provider value={search}>{children}</SearchContext.Provider>
    </MarksContext.Provider>
  );
}

/** The search box's model: the query, the Tiles it found and the highlighted one. */
export function useTileSearchModel(): TileSearchModel {
  const search = useContext(SearchContext);
  if (!search) throw new Error("useTileSearchModel must be used within TileSearchProvider");
  return search;
}

const noSubscribe = () => () => {};

/** Whether the search dims this Tile (a query it doesn't match). False outside a TileSearchProvider (Rewind). */
export function useTileDimmed(tileId: string): boolean {
  const marks = useContext(MarksContext);
  return useSyncExternalStore(marks?.subscribe ?? noSubscribe, () => !!marks?.dimmed(tileId));
}

/** Whether the search list is on this Tile (arrow keys or hovering a suggestion). False outside a TileSearchProvider. */
export function useTileSearchHighlighted(tileId: string): boolean {
  const marks = useContext(MarksContext);
  return useSyncExternalStore(marks?.subscribe ?? noSubscribe, () => !!marks?.highlighted(tileId));
}

/**
 * A Tile's place on the board, faded and unclickable while the search doesn't find it. It reads that on its own, so the
 * Tile cell inside it (memoised) never re-renders for the search: a keystroke that dims a dozen Tiles re-renders a dozen
 * of these, not their books.
 */
export function TileSearchSlot({ tileId, className, dimmedClassName, children }: { tileId: string; className: string; dimmedClassName: string; children: ReactNode }) {
  const dimmed = useTileDimmed(tileId);
  return (
    <div data-tile-id={tileId} className={`${className} ${dimmed ? dimmedClassName : ""}`}>
      {children}
    </div>
  );
}
