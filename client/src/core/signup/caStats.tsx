import type { CombatAchievementStats } from "@bingo/shared";
import { COMBAT_ACHIEVEMENT_TIER_LABEL } from "@bingo/shared";
import { SpinnerIcon } from "../ui/icons";

export function formatCaTier(stats: CombatAchievementStats | null | undefined): string {
  return stats ? COMBAT_ACHIEVEMENT_TIER_LABEL[stats.tier] : "Unknown";
}

export function caTitle(stats: CombatAchievementStats | null | undefined): string {
  if (!stats) return "No RuneProfile data — sync this RSN on RuneProfile";
  return `${stats.points.toLocaleString()} points`;
}

export function CaCell({ stats, loading }: { stats: CombatAchievementStats | null | undefined; loading?: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-on-surface-subtle" title="Looking up RuneProfile…">
        <SpinnerIcon size={12} />
        Looking up…
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap" title={caTitle(stats)}>
      {formatCaTier(stats)}
    </span>
  );
}
