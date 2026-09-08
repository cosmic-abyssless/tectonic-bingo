// Client for the OSRS Wiki's public MediaWiki search API — no auth or key
// required. Backs the item-search-with-icon UI in the admin TaskEditor.
//
// `incategory:"Items"` scopes full-text search to pages tagged as items
// (confirmed via manual testing: covers untradeables like pets and quest
// items too, e.g. "Vorki" — not just GE-tradeable items), so results don't
// get polluted with monster/quest/location pages that also match the raw
// query text.
//
// Icon URLs are constructed directly from the page title
// (https://oldschool.runescape.wiki/images/<Title_With_Underscores>.png)
// rather than resolved via a second API call per result — this is the
// wiki's real upload convention for an item's small inventory-sprite icon,
// confirmed by fetching one directly. It's a best-effort fast path, not
// guaranteed for every title (redirects/disambiguation can break it); the
// client is expected to fall back to a placeholder on image load failure
// rather than this service verifying each icon before returning.
import type { OsrsItemSearchResult } from "@bingo/shared";

const WIKI_BASE_URL = "https://oldschool.runescape.wiki";
const USER_AGENT = "tectonic-bingo (item search)";

type FetchLike = typeof fetch;

interface WikiSearchResponse {
  query?: { search?: { title: string }[] };
}

function iconUrlFor(title: string): string {
  return `${WIKI_BASE_URL}/images/${encodeURIComponent(title.replace(/ /g, "_"))}.png`;
}

function wikiUrlFor(title: string): string {
  return `${WIKI_BASE_URL}/w/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export class OsrsWikiClient {
  constructor(private fetchImpl: FetchLike = fetch) {}

  /** Never throws — a flaky/unreachable wiki should degrade to "no suggestions", not break the form. */
  async searchItems(query: string, limit = 8): Promise<OsrsItemSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    try {
      const params = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: `incategory:"Items" ${trimmed}`,
        srlimit: String(limit),
        format: "json",
      });
      const res = await this.fetchImpl(`${WIKI_BASE_URL}/api.php?${params}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) {
        console.warn(`[osrs-wiki] ${res.status} from GET /api.php (search)`);
        return [];
      }
      const body = (await res.json()) as WikiSearchResponse;
      return (body.query?.search ?? []).map((r) => ({
        name: r.title,
        iconUrl: iconUrlFor(r.title),
        wikiUrl: wikiUrlFor(r.title),
      }));
    } catch (err) {
      console.warn(`[osrs-wiki] search request failed`, err instanceof Error ? err.message : err);
      return [];
    }
  }
}

let _client: OsrsWikiClient | undefined;

export function getOsrsWikiClient(): OsrsWikiClient {
  if (!_client) _client = new OsrsWikiClient();
  return _client;
}
