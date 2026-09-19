import { useMemo } from "react";
import { useBoardModel } from "./BoardProvider";
import { buildPointBreakdown } from "./pointBreakdown";
import type { PointBreakdownModel } from "./types";

/** The viewed team's point breakdown. Only call it from something that mounts while the breakdown is open. */
export function usePointBreakdown(): PointBreakdownModel {
  const board = useBoardModel();
  return useMemo(
    () => buildPointBreakdown({ tiles: board.tiles, lines: board.lines, adjustments: board.adjustments, totalPoints: board.totalPoints }),
    [board.tiles, board.lines, board.adjustments, board.totalPoints],
  );
}
