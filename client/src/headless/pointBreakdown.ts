// Pure: turns the board model into the point breakdown a team can read. No React.
import type { LineModel, PointAdjustmentModel, PointBreakdownModel, TileModel } from "./types";

const LINE_TYPE_ORDER = { row: 0, column: 1, diagonal: 2, custom: 3 } as const;

/** "Row 3", "Column 2", "Diagonal 1". */
export function lineLabel(line: Pick<LineModel, "lineType" | "lineIndex">): string {
  if (line.lineType === "custom") return "Custom line";
  const name = { row: "Row", column: "Column", diagonal: "Diagonal" }[line.lineType];
  return `${name} ${line.lineIndex + 1}`;
}

const sum = (items: { points: number }[]) => items.reduce((total, item) => total + item.points, 0);

export function buildPointBreakdown(board: { tiles: TileModel[]; lines: LineModel[]; adjustments: PointAdjustmentModel[]; totalPoints: number | null }): PointBreakdownModel {
  const tileItems: PointBreakdownModel["tiles"]["items"] = [];
  const withheld: PointBreakdownModel["withheld"] = [];

  for (const tile of board.tiles) {
    const parts: { id: string; label: string; points: number }[] = [];
    for (const task of tile.tasks) {
      const label = task.label ?? "Part";
      if (task.pointsAwarded > 0) parts.push({ id: task.id, label, points: task.pointsAwarded });
      else if (task.complete && task.points > 0) withheld.push({ tileId: tile.id, tileName: tile.name, label, points: task.points });
    }
    const bonus = tile.progress.bonusAwarded;
    if (parts.length > 0 || bonus > 0) tileItems.push({ tileId: tile.id, name: tile.name, points: sum(parts) + bonus, parts, bonus });
  }
  tileItems.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const tileNameById = new Map(board.tiles.map((t) => [t.id, t.name]));
  const lineItems = board.lines
    .filter((line) => line.pointsAwarded > 0)
    .sort((a, b) => LINE_TYPE_ORDER[a.lineType] - LINE_TYPE_ORDER[b.lineType] || a.lineIndex - b.lineIndex)
    .map((line) => ({
      id: line.id,
      label: lineLabel(line),
      points: line.pointsAwarded,
      tileNames: line.tileIds.map((id) => tileNameById.get(id)).filter((name): name is string => !!name),
    }));

  const adjustmentItems = board.adjustments.map((a) => ({ ...a, points: a.amount }));
  const itemized = sum(tileItems) + sum(lineItems) + sum(adjustmentItems);
  // Without a server total (progress not loaded) there is nothing to compare against.
  const total = board.totalPoints ?? itemized;

  return {
    total,
    tiles: { points: sum(tileItems), items: tileItems },
    lines: { points: sum(lineItems), items: lineItems },
    adjustments: { points: sum(adjustmentItems), items: board.adjustments },
    withheld,
    unattributed: total - itemized,
  };
}
