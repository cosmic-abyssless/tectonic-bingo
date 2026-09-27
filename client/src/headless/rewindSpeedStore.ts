// The viewer's Rewind playback speed, remembered in localStorage (not per Bingo), so it carries over to the next
// Rewind they open. Best-effort: unavailable storage just means every visit starts at 1x.

import { isPlaybackSpeed, type PlaybackSpeed } from "./rewindModel";

export const REWIND_SPEED_STORAGE_KEY = "rewind:speed:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The remembered speed, or 1x when there's none (or it's not one of PLAYBACK_SPEEDS any more). */
export function readRewindSpeed(
  storage: StorageLike | null = defaultStorage(),
): PlaybackSpeed {
  try {
    const stored = Number(storage?.getItem(REWIND_SPEED_STORAGE_KEY));
    return isPlaybackSpeed(stored) ? stored : 1;
  } catch {
    return 1;
  }
}

export function writeRewindSpeed(
  speed: PlaybackSpeed,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(REWIND_SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Full or blocked storage: the speed just isn't remembered.
  }
}
