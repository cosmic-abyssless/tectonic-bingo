import type { CombatAchievementStats, CombatAchievementSubLevel, WomPlayerStats } from "@bingo/shared";
import { CA_SUB_LEVELS, COMBAT_ACHIEVEMENT_TIER_LABEL, caSubLevel } from "@bingo/shared";
import { SpinnerIcon } from "../ui/icons";
import { TooltipSpan } from "../ui/Tooltip";

const SUB_LEVEL_LABEL: Record<CombatAchievementSubLevel, string> = { low: "Low", medium: "Medium", high: "High" };
// One segment per third, lit from the bottom up to the player's level; bronze -> silver -> gold like the podium Medal pills.
const SEGMENT_LIT = ["bg-bronze", "bg-silver", "bg-gold"];

/** Small vertical three-segment bar: how far through its tier a player is. Hover says e.g. "High Master tier". */
function CaLevelBar({ stats }: { stats: CombatAchievementStats }) {
  const level = caSubLevel(stats);
  if (!level) return null;
  const lit = CA_SUB_LEVELS.indexOf(level) + 1;
  const label = `${SUB_LEVEL_LABEL[level]} ${COMBAT_ACHIEVEMENT_TIER_LABEL[stats.tier]} tier`;
  return (
    <TooltipSpan text={label} label={label} className="inline-flex shrink-0 flex-col-reverse gap-px">
      {SEGMENT_LIT.map((color, i) => (
        <span key={color} className={`h-[3px] w-1.5 ${i < lit ? color : "bg-outline-strong"}`} />
      ))}
    </TooltipSpan>
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
  // max-w-full + truncate: in a narrow table cell the value ends in "…" rather than being cut off at the cell's edge.
  const className = "relative inline-block max-w-full min-w-0 truncate whitespace-nowrap align-middle";
  const content = (
    <>
      <span className={loading ? "invisible" : undefined}>{children}</span>
      {loading && (
        <span className="absolute inset-y-0 left-0 flex items-center">
          <SpinnerIcon size={12} />
        </span>
      )}
    </>
  );
  const tip = loading ? "Looking up…" : title;
  return tip ? (
    <TooltipSpan text={tip} label={loading ? "Looking up" : children} className={className}>
      {content}
    </TooltipSpan>
  ) : (
    <span className={className}>{content}</span>
  );
}

// In a grid (NoTooltips) the column's own tooltip says the same, so these show none there.
export function CaCell({ stats, loading }: { stats: CombatAchievementStats | null | undefined; loading?: boolean }) {
  const value = (
    <LoadingValue loading={loading} title={caTitle(stats)}>
      {formatCaTier(stats)}
    </LoadingValue>
  );
  if (loading || !stats || !caSubLevel(stats)) return value;
  return (
    // max-w-full/min-w-0: squeezed (a narrow table column), the tier name truncates and the level bar stays whole.
    <span className="inline-flex max-w-full min-w-0 items-center gap-2 whitespace-nowrap">
      {value}
      <CaLevelBar stats={stats} />
    </span>
  );
}

export function formatWomStat(value: number | undefined): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

export function WomCell({ stats, field, loading }: { stats: WomPlayerStats | null | undefined; field: "ehb" | "ehp"; loading?: boolean }) {
  return <LoadingValue loading={loading}>{formatWomStat(stats?.[field])}</LoadingValue>;
}
