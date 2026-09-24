import { formatSignupAnswer, formatTimeZone, type DraftUnit, type SignupQuestion } from "@bingo/shared";
import { formatCaTier, formatWomStat } from "../signup/caStats";
import { formatTierName, podiumTitle, recordTitle } from "../tectonic/profile";
import { toCsv } from "../ui/csv";
import { discordName } from "../ui/user";
import type { PoolRatings } from "./poolData";

/**
 * The whole draft pool as CSV, for "Copy as CSV": one row per player (a pair is two rows, each naming the other), every
 * column the table can show whether or not it's hidden, and the viewer's team's ratings and notes. Everyone in the
 * pool, whatever the search or timezone filter is showing. The profile, answer and rating columns come only when the
 * viewer gets them, as in the table.
 */
export function buildPoolCsv(pool: DraftUnit[], questions: SignupQuestion[], ratings: PoolRatings | null): string {
  const entries = pool.flatMap((u) => u.entries);
  const showAnswers = entries.some((e) => e.answers !== null);
  const showProfiles = entries.some((e) => e.tectonicProfile !== null);
  const hasPairs = pool.some((u) => u.entries.length > 1);
  const hasCuts = pool.some((u) => u.cut);
  const headers = [
    "RSN",
    "Discord",
    ...(hasPairs ? ["Paired with"] : []),
    ...(ratings ? ["Rating", "Note"] : []),
    ...(hasCuts ? ["At risk of cut"] : []),
    "Timezone",
    ...(showProfiles ? ["Tier", "Clan points", "Clan rank", "Records", "Podiums", "Achievements"] : []),
    "EHB",
    "EHP",
    "Current CA",
    "Peak CA",
    ...(showAnswers ? questions.map((q) => q.prompt) : []),
  ];
  const rows = pool.flatMap((unit) => {
    // A pair is rated as one, under its first half (as in the table): both rows carry it.
    const rating = ratings?.[unit.entries[0]!.signup.id];
    return unit.entries.map((e) => {
      const partner = unit.entries.find((o) => o !== e);
      const profile = e.tectonicProfile;
      return [
        e.signup.rsn,
        discordName(e.user),
        ...(hasPairs ? [partner?.signup.rsn ?? ""] : []),
        ...(ratings ? [rating && rating.stars > 0 ? String(rating.stars) : "", rating?.note ?? ""] : []),
        ...(hasCuts ? [unit.cut ? "Yes" : ""] : []),
        e.signup.timezone ? formatTimeZone(e.signup.timezone) : "",
        ...(showProfiles
          ? [
              profile?.tier ? formatTierName(profile.tier.name) : "",
              profile ? String(profile.points) : "",
              profile ? String(profile.rank) : "",
              profile ? recordTitle(profile) : "",
              profile ? podiumTitle(profile) : "",
              profile ? profile.achievements.map((a) => a.name).join("; ") : "",
            ]
          : []),
        formatWomStat(e.womStats?.ehb),
        formatWomStat(e.womStats?.ehp),
        formatCaTier(e.caCurrent),
        formatCaTier(e.caPeak),
        ...(showAnswers ? questions.map((q) => formatSignupAnswer(q.type, e.answers?.find((a) => a.questionId === q.id)?.value)) : []),
      ];
    });
  });
  return toCsv([headers, ...rows]);
}
