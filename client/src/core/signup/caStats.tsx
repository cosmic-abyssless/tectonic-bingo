import type { CombatAchievementStats, CombatAchievementSubLevel, WomPlayerStats } from "@bingo/shared";
import { CA_SUB_LEVELS, COMBAT_ACHIEVEMENT_TIER_LABEL, caSubLevel } from "@bingo/shared";
import { SpinnerIcon } from "../ui/icons";

const SUB_LEVEL_LABEL: Record<CombatAchievementSubLevel, string> = { low: "Low", medium: "Medium", high: "High" };
// One segment per third, lit from the bottom up to the player's level; bronze -> silver -> gold like the podium Medal pills.
const SEGMENT_LIT = ["bg-bronze", "bg-silver", "bg-gold"];

/** Small vertical three-segment bar: how far through its tier a player is. Hover says e.g. "High Master tier". */
function CaLevelBar({ stats, tooltip }: { stats: CombatAchievementStats; tooltip: boolean }) {
  const level = caSubLevel(stats);
  if (!level) return null;
  const lit = CA_SUB_LEVELS.indexOf(level) + 1;
  const label = `${SUB_LEVEL_LABEL[level]} ${COMBAT_ACHIEVEMENT_TIER_LABEL[stats.tier]} tier`;
  return (
    <span className="inline-flex shrink-0 flex-col-reverse gap-px" role="img" aria-label={label} title={tooltip ? label : undefined}>
      {SEGMENT_LIT.map((color, i) => (
        <span key={color} className={`h-[3px] w-1.5 ${i < lit ? color : "bg-outline-strong"}`} />
      ))}
    </span>
  );
}

export function formatCaTier(stats: CombatAchievementStats | null | undefined): string {
  return stats ? COMBAT_ACHIEVEMENT_TIER_LABEL[stats.tier] : "Unknown";
}

export function caTitle(stats: CombatAchievementStats | null | undefined): string {
  if (!stats) return "No RuneProfile data — sync this RSN on RuneProfile";
  return `${stats.points.toLocaleString()} points`;
}

function LoadingValue({ loading, title, children }: { loading?: boolean; title?: string; children: string }) {
  return (
    // max-w-full + truncate: in a narrow table cell the value ends in "…" rather than being cut off at the cell's edge.
    <span className="relative inline-block max-w-full min-w-0 truncate whitespace-nowrap align-middle" title={loading ? "Looking up…" : title}>
      <span className={loading ? "invisible" : undefined}>{children}</span>
      {loading && (
        <span className="absolute inset-y-0 left-0 flex items-center">
          <SpinnerIcon size={12} />
        </span>
      )}
    </span>
  );
}

// nativeTitle: false when the caller already shows this same text some other way (AG Grid's own tooltip, in
// SignupRosterGrid) — otherwise the two would render stacked/overlapping on hover.
export function CaCell({ stats, loading, nativeTitle = true }: { stats: CombatAchievementStats | null | undefined; loading?: boolean; nativeTitle?: boolean }) {
  const value = (
    <LoadingValue loading={loading} title={nativeTitle ? caTitle(stats) : undefined}>
      {formatCaTier(stats)}
    </LoadingValue>
  );
  if (loading || !stats || !caSubLevel(stats)) return value;
  return (
    // max-w-full/min-w-0: squeezed (a narrow table column), the tier name truncates and the level bar stays whole.
    <span className="inline-flex max-w-full min-w-0 items-center gap-2 whitespace-nowrap">
      {value}
      <CaLevelBar stats={stats} tooltip={nativeTitle} />
    </span>
  );
}

export function formatWomStat(value: number | undefined): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

export function WomCell({ stats, field, loading }: { stats: WomPlayerStats | null | undefined; field: "ehb" | "ehp"; loading?: boolean }) {
  return <LoadingValue loading={loading}>{formatWomStat(stats?.[field])}</LoadingValue>;
}
