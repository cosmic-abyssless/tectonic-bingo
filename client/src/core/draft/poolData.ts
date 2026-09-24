// The draft pool's sorting and searching, shared by the desktop table (DraftPoolGrid) and the phone list
// (DraftPoolList): what a column sorts on, what a search matches, and how a duo pair ranks against a solo player.
import { formatSignupAnswer, formatTimeZone, timeZoneOffsetMinutes, type DraftPoolEntry, type DraftUnit, type PickRating, type SignupQuestion } from "@bingo/shared";
import { formatCaTier, formatWomStat } from "../signup/caStats";
import { compareSortValues } from "../ui/tableSort";
import { discordName } from "../ui/user";
import { podiumSummary, recordSummary } from "../tectonic/profile";

// "rating" | "rsn" | "discord" | "tier" | "records" | "podiums" | "ehb" | "ehp" | "caCurrent" | "caPeak" | "timezone" |
// a signup question's id.
export type PoolSortKey = string;
export type PoolRatings = Record<string, PickRating>;

// Golds outrank silvers outrank bronzes, so a single #1 beats three #3s.
export const placeScore = (p: { first: number; second: number; third: number }) => p.first * 10_000 + p.second * 100 + p.third;

export function poolSortValue(entry: DraftPoolEntry, key: PoolSortKey, ratings: PoolRatings): string | number {
  if (key === "rating") return ratings[entry.signup.id]?.stars ?? 0;
  if (key === "rsn") return entry.signup.rsn.toLowerCase();
  if (key === "discord") return discordName(entry.user).toLowerCase();
  // West to east by current UTC offset; not set sorts below every real offset (UTC−12 is −720), like the -1s below.
  if (key === "timezone") return entry.signup.timezone ? timeZoneOffsetMinutes(entry.signup.timezone) : -10_000;
  if (key === "tier") return entry.tectonicProfile?.points ?? -1;
  if (key === "records") return entry.tectonicProfile ? placeScore(recordSummary(entry.tectonicProfile)) : -1;
  if (key === "podiums") return entry.tectonicProfile ? placeScore(podiumSummary(entry.tectonicProfile)) : -1;
  if (key === "ehb") return entry.womStats?.ehb ?? -1;
  if (key === "ehp") return entry.womStats?.ehp ?? -1;
  if (key === "caCurrent") return entry.caCurrent?.points ?? -1;
  if (key === "caPeak") return entry.caPeak?.points ?? -1;
  return (entry.answers?.find((a) => a.questionId === key)?.value ?? "").toLowerCase();
}

// Every column's text, whether or not it's currently shown — search covers all of them (issue #112).
export function poolSearchValues(entry: DraftPoolEntry, questions: SignupQuestion[]): string[] {
  return [
    entry.signup.rsn,
    discordName(entry.user),
    ...(entry.signup.timezone ? [entry.signup.timezone, formatTimeZone(entry.signup.timezone)] : []),
    entry.tectonicProfile?.tier?.name ?? "",
    formatWomStat(entry.womStats?.ehb),
    formatWomStat(entry.womStats?.ehp),
    formatCaTier(entry.caCurrent),
    formatCaTier(entry.caPeak),
    ...(entry.answers ?? []).map((a) => formatSignupAnswer(questions.find((q) => q.id === a.questionId)?.type ?? "text", a.value)),
  ];
}

// EHB/EHP/CA are additive (a duo's combined grind), unlike a rating or an RSN — a pair sorts on the *sum* of its
// two halves for these rather than best-of. Everything else (rating, rsn, discord, tier, records, podiums, a
// signup question) keeps best-of: there's no meaningful "sum" of two ratings or two names.
const SUM_KEYS: ReadonlySet<PoolSortKey> = new Set(["ehb", "ehp", "caCurrent", "caPeak"]);

/**
 * What a unit (a solo player or a duo pair) sorts on for `key`: a solo player's own value; a pair's sum for the
 * additive stats, else whichever half ranks first under the sort direction ("first" means smallest ascending, largest
 * descending), so the pair sits where its stronger or earlier member would on their own.
 */
export function unitSortValue(unit: DraftUnit, key: PoolSortKey, ratings: PoolRatings, descending: boolean): string | number {
  // A solo unit's "sum" is just its one value — poolSortValue as-is, -1 sentinel and all, so a solo row's sort is
  // untouched either way. Only a pair takes this branch, and unlike bestOf, an unmeasured half (-1) contributes
  // nothing to the pair's total rather than dragging it below a fully-measured pair's.
  if (SUM_KEYS.has(key) && unit.entries.length > 1) {
    return unit.entries.reduce((total, e) => total + Math.max(poolSortValue(e, key, ratings) as number, 0), 0);
  }
  let best = poolSortValue(unit.entries[0]!, key, ratings);
  for (const e of unit.entries.slice(1)) {
    const v = poolSortValue(e, key, ratings);
    const better = descending ? compareSortValues(v, best) > 0 : compareSortValues(v, best) < 0;
    if (better) best = v;
  }
  return best;
}
