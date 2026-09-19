import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { BoardLine, PointAdjustment, SubmissionDetails, TeamNodeState, Tile, TileCategory, TileInterest } from "@bingo/shared";
import { tileMatchesSearch } from "../core/board/requirementTree";
import { buildBoard } from "./boardModel";
import { useNowTick } from "./useNowTick";
import type { BoardModel, TileModel } from "./types";

const BoardContext = createContext<BoardModel | null>(null);

export function BoardProvider({
  tiles,
  categories,
  lines,
  nodeStates,
  teamSubmissions,
  bingoStartsAt,
  bingoRows,
  bingoCols,
  searchQuery,
  canSubmit,
  canToggleInterest,
  interests,
  viewerUserId,
  totalPoints,
  adjustments,
  children,
}: {
  tiles: Tile[];
  categories: TileCategory[];
  lines: BoardLine[];
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
  bingoStartsAt: string | null;
  bingoRows: number;
  bingoCols: number;
  searchQuery: string;
  canSubmit: boolean;
  canToggleInterest: boolean;
  interests: TileInterest[];
  viewerUserId: string;
  totalPoints: number | null;
  adjustments: PointAdjustment[];
  children: ReactNode;
}) {
  // Same tickUntil computation as the old BoardGrid.tsx effect (start +
  // the longest freeze window), just feeding the shared tick hook instead
  // of owning its own interval.
  const tickUntil = useMemo(() => {
    if (!bingoStartsAt) return null;
    const startMs = new Date(bingoStartsAt).getTime();
    const freezeTiles = tiles.filter((t) => t.hasFreezePeriod);
    const maxFreezeMs = freezeTiles.length ? Math.max(...freezeTiles.map((t) => t.freezeDurationMinutes)) * 60_000 : 0;
    return startMs + maxFreezeMs;
  }, [bingoStartsAt, tiles]);
  const now = useNowTick(tickUntil);

  const q = searchQuery.trim().toLowerCase();
  const matchIds = useMemo(() => (q ? new Set(tiles.filter((t) => tileMatchesSearch(t, q)).map((t) => t.id)) : null), [tiles, q]);

  // Carries the previous tick's TileModels so finalizeTileModels can
  // preserve object identity for tiles whose derived state didn't change —
  // see boardModel.ts's finalizeTileModels doc comment. Mutated inside the
  // memo below (a standard "remember the last computed value" pattern for
  // this kind of chained memoization); StrictMode's double-invoke is
  // harmless here since the same inputs always produce the same write.
  const prevRef = useRef<ReadonlyMap<string, TileModel>>(new Map());

  const board = useMemo(() => {
    const built = buildBoard({
      tiles,
      categories,
      lines,
      nodeStates,
      teamSubmissions,
      bingoStartsAt,
      bingoRows,
      bingoCols,
      now,
      matchIds,
      canSubmit,
      canToggleInterest,
      interests,
      viewerUserId,
      totalPoints,
      adjustments,
      prev: prevRef.current,
    });
    prevRef.current = built.tileById;
    return built;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, categories, lines, nodeStates, teamSubmissions, bingoStartsAt, bingoRows, bingoCols, now, matchIds, canSubmit, canToggleInterest, interests, viewerUserId, totalPoints, adjustments]);

  return <BoardContext.Provider value={board}>{children}</BoardContext.Provider>;
}

export function useBoardModel(): BoardModel {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoardModel must be used within BoardProvider");
  return ctx;
}

export function useTileModel(tileId: string | null): TileModel | null {
  const board = useBoardModel();
  if (!tileId) return null;
  return board.tileById.get(tileId) ?? null;
}
