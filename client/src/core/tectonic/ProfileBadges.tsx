import type { TectonicProfile } from "@bingo/shared";
import { formatTierName, tierIconUrl } from "./profile";

/** Rank icon + clan points; the tooltip carries the full standing. */
export function TierBadge({ profile, showRank = true }: { profile: TectonicProfile; showRank?: boolean }) {
  const icon = profile.tier ? tierIconUrl(profile.tier.icon) : null;
  const tierName = profile.tier ? formatTierName(profile.tier.name) : "Unranked";
  const title = `${tierName} · ${profile.points.toLocaleString()} pts${showRank ? ` · #${profile.rank} in clan` : ""}`;
  return (
    <span className="whitespace-nowrap" title={title}>
      {icon ? (
        <img src={icon} alt={tierName} className="mr-1.5 inline-block size-4 object-contain align-[-2px]" />
      ) : (
        <span className="mr-1.5 text-on-surface-subtle">{tierName}</span>
      )}
      <span className="num">{profile.points.toLocaleString()}</span>
    </span>
  );
}

/** Small thumbnails for Maxed / Grandmaster / Gilded log etc. */
export function AchievementIcons({ profile, large = false }: { profile: TectonicProfile; large?: boolean }) {
  if (profile.achievements.length === 0) return null;
  return (
    <span className={`inline-flex items-center ${large ? "gap-1.5" : "gap-1"}`}>
      {profile.achievements.map((a) => (
        <img key={a.name} src={a.thumbnail} alt={a.name} title={a.name} className={`${large ? "size-7" : "size-4"} object-contain`} />
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
  const ordinal = place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;
  return (
    <span className={`num inline-flex h-5 min-w-7 items-center justify-center rounded-sm border px-1 text-xs font-semibold ${tone} ${className}`} title={ordinal}>
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
