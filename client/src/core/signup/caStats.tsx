import type { CombatAchievementStats } from "@bingo/shared";
import { COMBAT_ACHIEVEMENT_TIER_LABEL } from "@bingo/shared";

export function formatCaTier(stats: CombatAchievementStats | null | undefined): string {
  return stats ? COMBAT_ACHIEVEMENT_TIER_LABEL[stats.tier] : "Unknown";
}

export function caTitle(stats: CombatAchievementStats | null | undefined): string {
  if (!stats) return "No RuneProfile data — sync this RSN on RuneProfile";
  return `${stats.points.toLocaleString()} points`;
}

export function CaCell({ stats }: { stats: CombatAchievementStats | null | undefined }) {
  return (
    <span className="whitespace-nowrap" title={caTitle(stats)}>
      {formatCaTier(stats)}
    </span>
  );
}
