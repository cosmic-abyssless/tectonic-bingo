import type { TectonicProfile } from "@bingo/shared";
import { formatTierName, tierIconUrl } from "./profile";

/** Rank icon + clan points; the tooltip carries the full standing. */
export function TierBadge({ profile, showRank = true }: { profile: TectonicProfile; showRank?: boolean }) {
  const icon = profile.tier ? tierIconUrl(profile.tier.icon) : null;
  const tierName = profile.tier ? formatTierName(profile.tier.name) : "Unranked";
  const title = `${tierName} · ${profile.points.toLocaleString()} pts${showRank ? ` · #${profile.rank} in clan` : ""}`;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={title}>
      {icon ? <img src={icon} alt={tierName} className="size-4 object-contain" /> : <span className="text-fg-subtle">{tierName}</span>}
      <span className="num">{profile.points.toLocaleString()}</span>
    </span>
  );
}

/** Small thumbnails for Maxed / Grandmaster / Gilded log etc. */
export function AchievementIcons({ profile, large = false }: { profile: TectonicProfile; large?: boolean }) {
  if (profile.achievements.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {profile.achievements.map((a) => (
        <img key={a.name} src={a.thumbnail} alt={a.name} title={a.name} className={`${large ? "size-5" : "size-4"} object-contain`} />
      ))}
    </span>
  );
}
