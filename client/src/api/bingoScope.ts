import { MAX_WATCHED_BINGOS } from "@bingo/shared";

// Which bingo a query belongs to. Query keys carry the bingo's slug (at different positions: ["teamProgress", slug,
// teamId], ["wrapped", "state", slug]), while live events carry its id, so the two meet through the cached shells.

/** The slug of the bingo a page path is under (/b/:slug and everything below it), or null. */
export function bingoSlugOfPath(pathname: string): string | null {
  const match = /^\/b\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

/** Whether a query key names any of these slugs. */
export function keyMentions(queryKey: readonly unknown[], slugs: ReadonlySet<string>): boolean {
  return slugs.size > 0 && queryKey.some((part) => typeof part === "string" && slugs.has(part));
}

/**
 * The slugs of the cached bingo shells that are NOT `bingoId`: an event for that bingo leaves their queries alone.
 * A slug with no cached shell is never in here, so its queries are still refreshed (the safe side).
 */
export function otherBingoSlugs(shells: readonly (readonly [readonly unknown[], unknown])[], bingoId: string): Set<string> {
  const slugs = new Set<string>();
  for (const [queryKey, data] of shells) {
    const id = (data as { bingo?: { id?: unknown } } | undefined)?.bingo?.id;
    if (typeof queryKey[1] === "string" && typeof id === "string" && id !== bingoId) slugs.add(queryKey[1]);
  }
  return slugs;
}

/**
 * The Bingos this client has data for, from its cached shells: the ones it asks the server for live events about
 * (ClientSocketMessage). Most recently fetched first, so in the unlikely case of more than the server takes, the ones
 * left out are those it looked at longest ago. Sorted after that, so the same set always reads the same.
 */
export function watchedBingoIds(shells: readonly { data: unknown; dataUpdatedAt: number }[]): string[] {
  const ids = new Set<string>();
  for (const { data } of [...shells].sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt)) {
    const id = (data as { bingo?: { id?: unknown } } | undefined)?.bingo?.id;
    if (typeof id === "string") ids.add(id);
  }
  return [...ids].slice(0, MAX_WATCHED_BINGOS).sort();
}
