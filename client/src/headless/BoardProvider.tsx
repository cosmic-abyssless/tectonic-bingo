import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { BoardLine, PointAdjustment, SubmissionDetails, TeamNodeState, Tile, TileCategory, TileInterest } from "@bingo/shared";
import { assembleBoard, buildBoardStatic } from "./boardModel";
import { useNowTick } from "./useNowTick";
import type { ExclusiveLocks } from "../core/board/exclusivity";
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
  canSubmit,
  canToggleInterest,
  interests,
  viewerUserId,
  viewerOnTeam = false,
  totalPoints,
  adjustments,
  locks,
  sealed,
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
  canSubmit: boolean;
  canToggleInterest: boolean;
  interests: TileInterest[];
  viewerUserId: string;
  /** The viewer is on the team whose board this is (their Proof screenshot status is shown). */
  viewerOnTeam?: boolean;
  totalPoints: number | null;
  adjustments: PointAdjustment[];
  locks: ExclusiveLocks;
  /** The Tiles are sealed for this viewer: `tiles` and `lines` come from sealedBoardAsTiles. */
  sealed: boolean;
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

  // Carries the previous tick's TileModels so finalizeTileModels can
  // preserve object identity for tiles whose derived state didn't change —
  // see boardModel.ts's finalizeTileModels doc comment. Mutated inside the
  // memo below (a standard "remember the last computed value" pattern for
  // this kind of chained memoization); StrictMode's double-invoke is
  // harmless here since the same inputs always produce the same write.
  const prevRef = useRef<ReadonlyMap<string, TileModel>>(new Map());

  // The expensive pass (every Tile's requirements and progress) only when the board's data changes; the cheap pass
  // below on every tick of a countdown, reusing each Tile it didn't change so its cell doesn't re-draw. The search isn't
  // in the board model at all (TileSearchProvider), so typing doesn't touch it.
  const built = useMemo(
    () => buildBoardStatic({ tiles, categories, lines, nodeStates, teamSubmissions, bingoStartsAt, bingoRows, interests, viewerUserId, viewerOnTeam, locks, sealed }),
    [tiles, categories, lines, nodeStates, teamSubmissions, bingoStartsAt, bingoRows, interests, viewerUserId, viewerOnTeam, locks, sealed],
  );
  const board = useMemo(() => {
    const assembled = assembleBoard(built, { bingoStartsAt, bingoRows, bingoCols, now, canSubmit, canToggleInterest, totalPoints, adjustments, sealed, prev: prevRef.current });
    prevRef.current = assembled.tileById;
    return assembled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, bingoStartsAt, bingoRows, bingoCols, now, canSubmit, canToggleInterest, totalPoints, adjustments, sealed]);

  return <BoardContext.Provider value={board}>{children}</BoardContext.Provider>;
}

/** Provides an already-built Board, for a view that reshapes the one BoardProvider built (Rewind's All Teams view). */
export function BoardModelProvider({ value, children }: { value: BoardModel; children: ReactNode }) {
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
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
