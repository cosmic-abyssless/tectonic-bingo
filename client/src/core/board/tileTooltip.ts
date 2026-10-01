import type { TileModel } from "../../headless/types";

/**
 * A board Tile's tooltip: its name (an image tile doesn't show it), who's on it, and, where the cell shows them as
 * numbered dots, how far each started Task has got. One per Tile, on the cell itself, since the marks inside it can't
 * have their own: they're inside its button.
 */
export function tileTooltip(tile: TileModel, { tasks = false }: { tasks?: boolean } = {}): string {
  const lines = [tile.name];
  if (tile.interest.people.length > 0 && !tile.progress.allComplete) lines.push(`On this tile: ${tile.interest.people.map((p) => p.displayName).join(", ")}`);
  if (tasks && tile.progress.totalTasks > 1) {
    for (const task of tile.taskStatuses) if (task.status !== "not_started") lines.push(`${task.index + 1}. ${task.label}: ${task.status.replace(/_/g, " ")}`);
  }
  return lines.join("\n");
}
