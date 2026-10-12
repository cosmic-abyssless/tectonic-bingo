import type { BroadcastEvent } from "@bingo/shared";

// A Bingo's stats (statsService.getStats) are the same for every viewer before they're filtered, and take a few hundred
// ms of the server's one thread to work out: Stats pages opened together used to stall everything else (event loop lag,
// 2026-10-11). So one is kept for a while and shared, and forgotten as soon as something it's made from changes.

/** How long a Bingo's stats are kept at the most. What changes without a broadcast (a Wise Old Man read) shows by then. */
export const STATS_CACHE_MS = 30_000;

/** The changes that alter a Bingo's stats: forgetting its stats on these is what keeps a kept copy right. */
const CHANGES_STATS: ReadonlySet<BroadcastEvent["type"]> = new Set<BroadcastEvent["type"]>([
  "submission_reviewed",
  "gp_values_updated",
  "player_renamed",
  "team_updated",
  "stage_changed",
  "bingo_changed",
  "board_draft_changed",
  "draft_pick",
  "draft_pick_undone",
]);

const kept = new Map<string, { value: unknown; until: number }>();

/** A Bingo's stats: the kept copy while it's fresh, otherwise `compute`'s, kept for STATS_CACHE_MS. */
export function keptStats<T>(bingoId: string, compute: () => T, now = Date.now()): T {
  const entry = kept.get(bingoId);
  if (entry && entry.until > now) return entry.value as T;
  const value = compute();
  kept.set(bingoId, { value, until: now + STATS_CACHE_MS });
  return value;
}

/** Forgets the stats of the event's Bingo when the event changes them (ws.ts broadcast). */
export function forgetStatsOn(event: BroadcastEvent): void {
  if (!CHANGES_STATS.has(event.type)) return;
  if ("bingoId" in event && event.bingoId) kept.delete(event.bingoId);
  // A change for no Bingo in particular could be any of them.
  else kept.clear();
}

/** Tests: start from nothing kept. */
export function forgetAllStats(): void {
  kept.clear();
}
