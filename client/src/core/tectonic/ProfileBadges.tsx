import type { TectonicProfile } from "@bingo/shared";
import { formatTierName, tierIconUrl } from "./profile";
import { TextTooltip, TooltipSpan } from "../ui/Tooltip";

/** A TierBadge's full standing, its tooltip: "Dragon · 1,234 pts · #5 in clan". */
export function tierTitle(profile: TectonicProfile, showRank = true): string {
  const tierName = profile.tier ? formatTierName(profile.tier.name) : "Unranked";
  return `${tierName} · ${profile.points.toLocaleString()} pts${showRank ? ` · #${profile.rank} in clan` : ""}`;
}

/** Rank icon + clan points; the tooltip carries the full standing. */
export function TierBadge({ profile, showRank = true }: { profile: TectonicProfile; showRank?: boolean }) {
  const icon = profile.tier ? tierIconUrl(profile.tier.icon) : null;
  const tierName = profile.tier ? formatTierName(profile.tier.name) : "Unranked";
  const title = tierTitle(profile, showRank);
  return (
    <TooltipSpan text={title} label={title} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      {icon ? <img src={icon} alt="" className="size-4 shrink-0 self-center object-contain" /> : <span className="text-on-surface-subtle">{tierName}</span>}
      <span className="num">{profile.points.toLocaleString()}</span>
    </TooltipSpan>
  );
}

/** Small thumbnails for the clan's own honours — Maxed / Grandmaster / Gilded log etc. Not Achievements (CONTEXT.md "Achievement" reserves that name for the site's own feature). */
export function ClanHonourIcons({ profile, large = false }: { profile: TectonicProfile; large?: boolean }) {
  if (profile.achievements.length === 0) return null;
  return (
    <span className={`inline-flex items-center ${large ? "gap-1.5" : "gap-1"}`}>
      {profile.achievements.map((a) => (
        <TextTooltip key={a.name} text={a.name}>
          <img src={a.thumbnail} alt={a.name} className={`${large ? "size-7" : "size-4"} object-contain`} />
        </TextTooltip>
      ))}
    </span>
  );
}

const MEDAL_CLASS: Record<number, string> = {
  1: "border-gold/60 bg-gold/15 text-gold",
  2: "border-silver/60 bg-silver/15 text-silver",
  3: "border-bronze/60 bg-bronze/15 text-bronze",
};

/** "#1" / "#2" / "#3" pill in medal colours; plainer past the podium. */
export function Medal({ place, className = "" }: { place: number; className?: string }) {
  const tone = MEDAL_CLASS[place] ?? "border-outline text-on-surface-muted";
  return (
    <span className={`num inline-flex h-5 min-w-7 items-center justify-center rounded-sm border px-1 text-xs font-semibold ${tone} ${className}`}>
      #{place}
    </span>
  );
}

/** Total followed by the gold/silver/bronze split; just the total when there's nothing to split. */
export function PlaceBreakdown({ total, first, second, third }: { total: number; first: number; second: number; third: number }) {
  if (total === 0) return <>0</>;
  return (
    <>
      {total}
      <span className="ml-1 text-xs font-normal">
        <span className="text-gold">{first}</span>
        <span className="text-on-surface-subtle">/</span>
        <span className="text-silver">{second}</span>
        <span className="text-on-surface-subtle">/</span>
        <span className="text-bronze">{third}</span>
      </span>
    </>
  );
}
