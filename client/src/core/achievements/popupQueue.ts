import type { AchievementKey } from "@bingo/shared";

/**
 * The next unlock popup to play, given the server's unshown-popup order and the ones already started on this page (a
 * refetch before the server has caught up — tabbing back in, a websocket "achievements_changed" — must never start
 * one twice; see AchievementPopupHost). Null once everything the server still owes has been shown.
 */
export function nextPopupKey(unshownPopups: readonly AchievementKey[], started: ReadonlySet<AchievementKey>): AchievementKey | null {
  return unshownPopups.find((key) => !started.has(key)) ?? null;
}
