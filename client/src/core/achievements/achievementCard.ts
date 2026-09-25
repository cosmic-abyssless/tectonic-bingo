import type { AchievementProgress, MyAchievement } from "@bingo/shared";

/**
 * How one Achievement renders in the modal's list (AchievementsModal): a locked Hidden one is always "masked" (the
 * server never sends its name/description/icon before it's earned), everything else is "earned" or "locked" — see
 * CONTEXT.md "Achievement".
 */
export type AchievementCardKind = "earned" | "locked" | "masked";

export function achievementCardKind(a: Pick<MyAchievement, "masked" | "earned">): AchievementCardKind {
  if (a.masked) return "masked";
  return a.earned ? "earned" : "locked";
}

/** "4/10", or null for an Achievement with no progress target (a one-shot like Strong start). */
export function progressLabel(progress: AchievementProgress | null): string | null {
  return progress ? `${progress.current}/${progress.target}` : null;
}

/** 0-1 for a progress bar; null with no target, or a target of 0 (never divides by it). */
export function progressFraction(progress: AchievementProgress | null): number | null {
  if (!progress || progress.target <= 0) return null;
  return Math.min(1, Math.max(0, progress.current / progress.target));
}

/** The modal's header count, "5 / 16" — Hidden Achievements included either way. */
export function achievementCountLabel(achievements: readonly Pick<MyAchievement, "earned">[]): string {
  const earned = achievements.filter((a) => a.earned).length;
  return `${earned} / ${achievements.length}`;
}

const LIST_RANK: Record<AchievementCardKind, number> = { earned: 0, locked: 1, masked: 2 };

/** The modal's order: earned first, then the visible ones still to get, then the Hidden "???" ones — each group in catalogue order. */
export function orderForList<T extends Pick<MyAchievement, "masked" | "earned">>(achievements: readonly T[]): T[] {
  return achievements
    .map((a, i) => ({ a, i }))
    .sort((x, y) => LIST_RANK[achievementCardKind(x.a)] - LIST_RANK[achievementCardKind(y.a)] || x.i - y.i)
    .map(({ a }) => a);
}

/** "Earned 3 Mar" (in the viewer's locale), or null when not earned. */
export function earnedLabel(earnedAt: string | null): string | null {
  return earnedAt ? `Earned ${new Date(earnedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : null;
}
