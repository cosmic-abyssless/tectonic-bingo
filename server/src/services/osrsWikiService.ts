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
//
// Boss tags (CONTEXT.md "Tag") use two more calls, both made only from the board editor, never at search time:
// - the Bosses and Raids categories' pages (`list=categorymembers`, main namespace), fetched whole (under 200 pages)
//   and kept for a few hours, so the boss picker can filter them as the admin types. A raid (Chambers of Xeric) is
//   searched for as a whole as often as its bosses are, so it can be a Boss tag too; the Raids category's overview
//   page, "Raids", isn't one raid and is left out;
// - one boss page's redirects (`prop=redirects`), which are the wiki's other names for it: aliases ("Sire", "kq") and
//   the misspellings people searched for ("Abbysal sire"). `prop=categories` in the same call says whether the page
//   is in the Bosses or Raids category, and `redirects=1` follows a title that is itself a redirect to the boss's page.
// Unlike the item search, these fail loudly (WikiUnavailableError), so the editor can say the wiki couldn't be reached.
import { TAG_MAX_LENGTH, tagKey, type OsrsBossSearchResult, type OsrsItemSearchResult } from "@bingo/shared";
import { USER_AGENT } from "../config";
import { log } from "../log";

const WIKI_BASE_URL = "https://oldschool.runescape.wiki";
const WIKI_USER_AGENT = `${USER_AGENT} item search`;
const BOSS_CATEGORIES = ["Category:Bosses", "Category:Raids"];
// Pages in those categories that aren't one boss or raid: the Raids category's overview.
const NOT_A_BOSS = new Set(["Raids"]);
// The categories barely change; a few hours keeps the picker from asking the wiki on every keystroke.
const BOSS_LIST_TTL_MS = 6 * 3600_000;
const WIKI_TIMEOUT_MS = 10_000;
// Continuation pages followed for one listing (500 a page): far more than any boss has redirects.
const MAX_PAGES = 10;

type FetchLike = typeof fetch;

/** The OSRS Wiki couldn't be reached, or answered with an error. */
export class WikiUnavailableError extends Error {
  constructor(message = "The OSRS Wiki couldn't be reached") {
    super(message);
  }
}

interface WikiSearchResponse {
  query?: { search?: { title: string }[] };
}

type WikiContinue = Record<string, string>;

interface CategoryMembersResponse {
  continue?: WikiContinue;
  query?: { categorymembers?: { ns: number; title: string }[] };
}

interface RedirectsResponse {
  continue?: WikiContinue;
  query?: { pages?: { title: string; missing?: boolean; invalid?: boolean; redirects?: { title: string }[]; categories?: { title: string }[] }[] };
}

/** A boss page and the titles that redirect to it. */
export interface BossPage {
  title: string;
  redirects: string[];
}

/**
 * The Text tags a Boss tag adds, from the titles redirecting to its page: in the wiki's order, trimmed, without
 * subpages (a "/" in the title, e.g. "Money making guide/vorkath"), without the boss's own name in other capitals, and
 * each name once whatever its capitals. A name longer than a tag may be is left out too.
 */
export function bossAliases(bossTitle: string, redirects: readonly string[]): string[] {
  const seen = new Set([tagKey(bossTitle)]);
  const aliases: string[] = [];
  for (const raw of redirects) {
    const alias = raw.trim();
    const key = tagKey(alias);
    if (!alias || alias.includes("/") || alias.length > TAG_MAX_LENGTH || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
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
        headers: { "User-Agent": WIKI_USER_AGENT },
      });
      if (!res.ok) {
        log.warn("osrs-wiki search failed", { status: res.status });
        return [];
      }
      const body = (await res.json()) as WikiSearchResponse;
      return (body.query?.search ?? []).map((r) => ({
        name: r.title,
        iconUrl: iconUrlFor(r.title),
        wikiUrl: wikiUrlFor(r.title),
      }));
    } catch (err) {
      log.warn("osrs-wiki search failed", { err });
      return [];
    }
  }

  private bossList: { at: number; titles: string[] } | null = null;
  private bossListLoading: Promise<string[]> | null = null;

  /** The Bosses and Raids categories' pages whose title contains the query, the ones starting with it first. */
  async searchBosses(query: string, limit = 10): Promise<OsrsBossSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const titles = await this.bossTitles();
    const matching = titles.filter((title) => title.toLowerCase().includes(q));
    const starting = matching.filter((title) => title.toLowerCase().startsWith(q));
    return [...starting, ...matching.filter((title) => !title.toLowerCase().startsWith(q))]
      .slice(0, limit)
      .map((name) => ({ name, wikiUrl: wikiUrlFor(name) }));
  }

  /**
   * A boss's page (following a title that redirects to it) and every title redirecting to it, or null when there is
   * no such page or it isn't in the Bosses or Raids category.
   */
  async bossPage(title: string): Promise<BossPage | null> {
    let pageTitle: string | null = null;
    let isBoss = false;
    const redirects: string[] = [];
    let cont: WikiContinue | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const body = await this.query<RedirectsResponse>({
        prop: "redirects|categories",
        titles: title,
        redirects: "1",
        rdprop: "title",
        rdnamespace: "0",
        rdlimit: "max",
        clcategories: BOSS_CATEGORIES.join("|"),
        formatversion: "2",
        ...cont,
      });
      const found = body.query?.pages?.[0];
      if (!found || found.missing || found.invalid) return null;
      pageTitle = found.title;
      isBoss ||= !NOT_A_BOSS.has(found.title) && !!found.categories?.some((c) => BOSS_CATEGORIES.includes(c.title));
      redirects.push(...(found.redirects ?? []).map((r) => r.title));
      cont = body.continue;
      if (!cont) break;
    }
    return pageTitle && isBoss ? { title: pageTitle, redirects } : null;
  }

  private async bossTitles(): Promise<string[]> {
    if (this.bossList && Date.now() - this.bossList.at < BOSS_LIST_TTL_MS) return this.bossList.titles;
    // One listing at a time: the picker's keystrokes all wait on the same request.
    this.bossListLoading ??= this.fetchBossTitles().finally(() => (this.bossListLoading = null));
    const titles = await this.bossListLoading;
    this.bossList = { at: Date.now(), titles };
    return titles;
  }

  private async fetchBossTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const category of BOSS_CATEGORIES) {
      let cont: WikiContinue | undefined;
      for (let i = 0; i < MAX_PAGES; i++) {
        const body = await this.query<CategoryMembersResponse>({ list: "categorymembers", cmtitle: category, cmnamespace: "0", cmlimit: "max", ...cont });
        titles.push(...(body.query?.categorymembers ?? []).map((m) => m.title));
        cont = body.continue;
        if (!cont) break;
      }
    }
    // A raid boss can be in both categories; listed once.
    return [...new Set(titles)].filter((title) => !NOT_A_BOSS.has(title));
  }

  /** One `action=query` call. Throws WikiUnavailableError when the wiki can't be reached or answers with an error. */
  private async query<T>(params: Record<string, string>): Promise<T> {
    const search = new URLSearchParams({ action: "query", format: "json", ...params });
    let res: Response;
    try {
      res = await this.fetchImpl(`${WIKI_BASE_URL}/api.php?${search}`, { headers: { "User-Agent": WIKI_USER_AGENT }, signal: AbortSignal.timeout(WIKI_TIMEOUT_MS) });
    } catch (err) {
      log.warn("osrs-wiki query failed", { err });
      throw new WikiUnavailableError();
    }
    if (!res.ok) {
      log.warn("osrs-wiki query failed", { status: res.status });
      throw new WikiUnavailableError();
    }
    const body = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
    if (!body || body.error) {
      log.warn("osrs-wiki query failed", { error: body?.error });
      throw new WikiUnavailableError();
    }
    return body;
  }
}

let _client: OsrsWikiClient | undefined;

export function getOsrsWikiClient(): OsrsWikiClient {
  if (!_client) _client = new OsrsWikiClient();
  return _client;
}
