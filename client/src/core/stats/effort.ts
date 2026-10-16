// Effort (CONTEXT.md): the hours a Player spent at the bosses of their Team's open Parts, as Wise Old Man measures EHB.
// Shown to one decimal place, and Effort share as a percentage.
import type { StatsResponse } from "@bingo/shared";

/** Effort hours to one decimal place: "14.2 h". */
export function formatEffortHours(hours: number): string {
  return `${hours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

/** An Effort share (0-100) to at most one decimal place: "23%", "23.4%". */
export function formatEffortShare(share: number): string {
  return `${share.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

/** Each Player's Effort on one Tile, for the Teams shown, largest first. */
export function tileEffortByPlayer(
  tileEffort: StatsResponse["tileEffort"],
  tileId: string,
  teamIds: Set<string>,
): { userId: string; teamId: string; hours: number }[] {
  return tileEffort
    .filter((e) => e.tileId === tileId && teamIds.has(e.teamId) && e.hours > 0)
    .map(({ userId, teamId, hours }) => ({ userId, teamId, hours }))
    .sort((a, b) => b.hours - a.hours);
}
