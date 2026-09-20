import type { CombatAchievementStats, WomPlayerStats } from "@bingo/shared";
import { COMBAT_ACHIEVEMENT_TIER_LABEL } from "@bingo/shared";
import { SpinnerIcon } from "../ui/icons";

export function formatCaTier(stats: CombatAchievementStats | null | undefined): string {
  return stats ? COMBAT_ACHIEVEMENT_TIER_LABEL[stats.tier] : "Unknown";
}

export function caTitle(stats: CombatAchievementStats | null | undefined): string {
  if (!stats) return "No RuneProfile data — sync this RSN on RuneProfile";
  return `${stats.points.toLocaleString()} points`;
}

function LoadingValue({ loading, title, children }: { loading?: boolean; title?: string; children: string }) {
  return (
    <span className="relative inline-block whitespace-nowrap" title={loading ? "Looking up…" : title}>
      <span className={loading ? "invisible" : undefined}>{children}</span>
      {loading && (
        <span className="absolute inset-y-0 left-0 flex items-center">
          <SpinnerIcon size={12} />
        </span>
      )}
    </span>
  );
}

export function CaCell({ stats, loading }: { stats: CombatAchievementStats | null | undefined; loading?: boolean }) {
  return <LoadingValue loading={loading} title={caTitle(stats)}>{formatCaTier(stats)}</LoadingValue>;
}

export function formatWomStat(value: number | undefined): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

export function WomCell({ stats, field, loading }: { stats: WomPlayerStats | null | undefined; field: "ehb" | "ehp"; loading?: boolean }) {
  return <LoadingValue loading={loading}>{formatWomStat(stats?.[field])}</LoadingValue>;
}
