import type { AchievementKey } from "@bingo/shared";

/**
 * The next unlock popup to play, given the server's unshown-popup order and the ones this session has already
 * played (a mid-queue refetch — e.g. a websocket "achievements_changed" — must never replay one; see
 * AchievementPopupHost). Null once everything the server still owes has been shown.
 */
export function nextPopupKey(unshownPopups: readonly AchievementKey[], playedThisSession: ReadonlySet<AchievementKey>): AchievementKey | null {
  return unshownPopups.find((key) => !playedThisSession.has(key)) ?? null;
}
