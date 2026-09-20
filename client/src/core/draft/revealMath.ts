// The pure parts of the draft pick reveal (see useDraftReveals and DraftPickReveal): which announced picks are ready
// to play, how a shape flies to its roster slot, and how big a burst's lettering can be.
import { displayName } from "../ui/user";
import type { DraftPick } from "@bingo/shared";

/** A pick the server announced over the websocket that is waiting for its turn on screen. */
export interface PendingPick {
  pickNumber: number;
  teamId: string;
  /** Milliseconds since the epoch when it arrived. */
  queuedAt: number;
}

/** More announcements than this waiting means the draft is moving faster than the show: the rest just appear. */
export const MAX_QUEUED_REVEALS = 3;
/** An announced pick that still isn't in the draft state after this long (a failed refetch) is dropped. */
export const GIVE_UP_AFTER_MS = 5000;

const isLoaded = (p: PendingPick, picks: readonly DraftPick[]) => picks.some((pick) => pick.pickNumber === p.pickNumber && pick.teamId === p.teamId);

/** The first waiting pick whose players are already in the draft state, i.e. ready to be shown. */
export function readyPick(pending: readonly PendingPick[], picks: readonly DraftPick[]): PendingPick | null {
  return pending.find((p) => isLoaded(p, picks)) ?? null;
}

/** Waiting picks whose players never loaded into the draft state. A pick that is only waiting its turn on screen is not expired. */
export function expiredPicks(pending: readonly PendingPick[], picks: readonly DraftPick[], now: number): PendingPick[] {
  return pending.filter((p) => now - p.queuedAt >= GIVE_UP_AFTER_MS && !isLoaded(p, picks));
}

/** The names a pick shows: each drafted player's RSN (a duo pair is two players under one pick number). */
export function namesForPick(picks: readonly DraftPick[], pickNumber: number): string[] {
  return picks.filter((p) => p.pickNumber === pickNumber).map((p) => p.rsn || displayName(p.user));
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * How a shape currently drawn at `from` moves to land on `to`: the translation between their centres, and the scale
 * that makes it as wide as the slot (never bigger than it is, never a speck).
 */
export function flightTo(from: Box, to: Box): { x: number; y: number; scale: number } {
  const x = to.left + to.width / 2 - (from.left + from.width / 2);
  const y = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = Math.min(1, Math.max(0.15, to.width / Math.max(1, from.width)));
  return { x, y, scale };
}

/** Whether a box is at least partly inside the viewport, so flying to it is worth showing. */
export function isOnScreen(box: Box, viewport: { width: number; height: number }): boolean {
  return box.width > 0 && box.height > 0 && box.left < viewport.width && box.left + box.width > 0 && box.top < viewport.height && box.top + box.height > 0;
}

/**
 * The font size at which the longest of `texts` just fits `availableWidth` (both in the same unit, e.g. rem or cqw),
 * given roughly how wide one character is as a fraction of the font size. Never bigger than `max`; `min` is the floor
 * below which a name is left to wrap onto more lines instead of shrinking further.
 */
export function fitFontSize(texts: readonly string[], { availableWidth, charWidth, max, min }: { availableWidth: number; charWidth: number; max: number; min: number }): number {
  const longest = Math.max(1, ...texts.map((t) => t.length));
  return Math.min(max, Math.max(min, availableWidth / (charWidth * longest)));
}
