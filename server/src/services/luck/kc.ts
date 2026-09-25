// A Player's kill count at a moment, from their WOM snapshot timeline (#195).
// Snapshots only exist when the Player updates on WOM, so a count is bounded
// from one side, always the side that makes a drop look *less* lucky: the KC at
// a drop is read from the first snapshot at or after it (never understated),
// and the KC a stretch starts from is read from the last snapshot at or before
// it (never overstated).
import type { WomSnapshot } from "../womService";

// The hiscores list a boss from 5 kills (the Mimic and TzKal-Zuk from 1); below that WOM reports it as unranked.
const HISCORE_MIN_KILLS = 5;
const HISCORE_MIN_KILLS_EXCEPTIONS: Record<string, number> = { mimic: 1, tzkal_zuk: 1 };

/** The most kills an unranked count can hide. */
function unrankedMax(metric: string): number {
  return (HISCORE_MIN_KILLS_EXCEPTIONS[metric] ?? HISCORE_MIN_KILLS) - 1;
}

/**
 * Kills of `metric` by `at` at the most: the first snapshot at or after `at`, unranked as the most it could be.
 * Null when there's no snapshot after `at` yet, so the count can't be known.
 */
export function killsAtMost(timeline: WomSnapshot[], metric: string, at: Date): number | null {
  const snap = timeline.find((s) => s.at >= at);
  if (!snap) return null;
  return snap.bossKills[metric] ?? unrankedMax(metric);
}

/**
 * Kills of `metric` by `at` at the least: the last snapshot at or before `at`, unranked as 0. Null with no snapshot
 * that early: 0 would count the Player's whole career as kills since `at`.
 */
export function killsAtLeast(timeline: WomSnapshot[], metric: string, at: Date): number | null {
  let snap: WomSnapshot | undefined;
  for (const s of timeline) if (s.at <= at) snap = s;
  if (!snap) return null;
  return snap.bossKills[metric] ?? 0;
}

/** Kills of `metric` from `from` up to a drop at `to`, never understated. Null without a snapshot on either side. */
export function killsUpToDrop(timeline: WomSnapshot[], metric: string, from: Date, to: Date): number | null {
  const atDrop = killsAtMost(timeline, metric, to);
  const atStart = killsAtLeast(timeline, metric, from);
  if (atDrop === null || atStart === null) return null;
  return Math.max(0, atDrop - atStart);
}
