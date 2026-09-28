// Superlatives (CONTEXT.md "Superlative"): the Admin sets up a few categories before the Bingo goes live (unless the
// board brought its own), and each Team's Players vote on each other through Live, as real Teams do: not everyone
// votes, not in every category, some change their minds, and a Team tends to agree on a favourite or two, so most
// categories have a clear winner and the odd one a tie. The run's own player (--me) is left to vote for themselves.
import type { Api } from "./client";
import type { Player } from "./people";
import type { Rng } from "./rng";
import { HOUR } from "./timeline";

/** The categories the Admin adds when the board has none (at most 3: each Team's share card fits 3). */
export const DEFAULT_CATEGORIES = ["Team MVP", "Team Spirit", "The Grinder"];

/** Of a Team's Players, how many vote at all, and how many of them skip any one category. */
const TURNOUT = 0.8;
const SKIP_CATEGORY = 0.15;
/** Of the votes cast, how many are changed for someone else later on. */
const CHANGE_MIND = 0.1;

export interface SuperlativeCategory {
  id: string;
  name: string;
}

export interface PlannedVote {
  at: Date;
  voter: Player;
  categoryId: string;
  nomineeUserId: string;
}

/** The board's categories, or DEFAULT_CATEGORIES added by the Admin at `at` when it has none. */
export async function ensureCategories(api: Api, admin: string, slug: string, at: Date): Promise<SuperlativeCategory[]> {
  const existing = (await api.as(admin).get<{ categories: SuperlativeCategory[] }>(`/api/bingos/${slug}/admin/superlatives`)).categories;
  if (existing.length > 0) return existing;
  const created: SuperlativeCategory[] = [];
  for (const name of DEFAULT_CATEGORIES) {
    created.push((await api.as(admin).post<{ category: SuperlativeCategory }>(`/api/bingos/${slug}/admin/superlatives`, { name }, { at })).category);
  }
  return created;
}

/**
 * Every vote each Team casts between `from` and `until`, in no particular order (the simulation queues them by time).
 * A changed vote is a second one for the same voter and category, later. Only Players with an account vote or are voted
 * for, never for themselves.
 */
export function planVotes(teams: { members: Player[] }[], categories: SuperlativeCategory[], from: Date, until: Date, rng: Rng): PlannedVote[] {
  const votes: PlannedVote[] = [];
  const span = until.getTime() - from.getTime();
  if (span <= 0) return votes;
  const when = (after = 0) => new Date(from.getTime() + after + rng.float() * (span - after));

  for (const team of teams) {
    const members = team.members.filter((p) => p.userId);
    if (members.length < 2) continue;
    // How the Team sees each teammate in each category: a strong, active Player is likelier to be picked, and a
    // little shared taste on top (squared, so one or two stand out) makes most categories land on a clear winner.
    const standing = new Map(categories.map((c) => [c.id, new Map(members.map((p) => [p, (0.3 + p.skill * Math.min(1, p.activity / 4)) * rng.between(0.3, 1.7) ** 2]))]));
    for (const voter of members) {
      if (voter.isMe || !rng.chance(TURNOUT)) continue;
      for (const category of categories) {
        if (rng.chance(SKIP_CATEGORY)) continue;
        const pick = () => rng.weighted(members.filter((p) => p !== voter).map((p) => [p, standing.get(category.id)!.get(p)!] as const));
        const at = when();
        votes.push({ at, voter, categoryId: category.id, nomineeUserId: pick().userId! });
        const after = at.getTime() - from.getTime() + HOUR;
        if (rng.chance(CHANGE_MIND) && after < span) votes.push({ at: when(after), voter, categoryId: category.id, nomineeUserId: pick().userId! });
      }
    }
  }
  return votes;
}
