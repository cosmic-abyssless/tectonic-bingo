// Client for the Wise Old Man public API — no auth required, so unlike
// tectonicService this has no "off unless configured" state. Cloudflare
// blocks requests without a real User-Agent header (confirmed: a bare curl
// gets a JS challenge page instead of JSON), so that header is mandatory,
// not just polite. Same never-throw contract as tectonicService: every
// method returns null on failure so a WOM outage just means missing stats,
// not a broken draft room.
//
// Keyed by wom_id, which we already have on `signups.womId` for anyone
// whose signup RSN matched a tectonic-api-linked account (Phase T2) — no
// extra tectonic-api round trip needed here.

export interface WomPlayerStats {
  ehb: number;
  totalLevel: number;
}

const WOM_BASE_URL = "https://api.wiseoldman.net/v2";
const USER_AGENT = "tectonic-bingo (draft-room player stats)";
// WOM data only changes when a player re-syncs their profile — no need to
// refetch often, and this keeps us well under WOM's unauthenticated rate
// limit (20 req/min) across repeated draft-room polls.
const CACHE_TTL_MS = 5 * 60_000;

type FetchLike = typeof fetch;

interface CacheEntry {
  value: WomPlayerStats | null;
  expiresAt: number;
}

interface WomPlayerResponse {
  ehb?: number;
  latestSnapshot?: { data?: { skills?: { overall?: { level?: number } } } };
}

export class WomClient {
  private cache = new Map<string, CacheEntry>();
  // Set from a 429's `retry-after` header. While in the future, new requests
  // short-circuit locally instead of hitting WOM (confirmed live: WOM's
  // unauthenticated limit is exactly 20 req/min, and a draft pool bigger
  // than that blows through it in one burst — no point sending doomed
  // requests once we already know we're blocked).
  private rateLimitedUntil = 0;

  constructor(private fetchImpl: FetchLike = fetch) {}

  async getPlayerStats(womId: string): Promise<WomPlayerStats | null> {
    const cached = this.cache.get(womId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (Date.now() < this.rateLimitedUntil) return null;

    let result: WomPlayerStats | null = null;
    try {
      const res = await this.fetchImpl(`${WOM_BASE_URL}/players/id/${encodeURIComponent(womId)}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.ok) {
        const body = (await res.json()) as WomPlayerResponse;
        const totalLevel = body.latestSnapshot?.data?.skills?.overall?.level;
        if (typeof body.ehb === "number" && typeof totalLevel === "number") {
          result = { ehb: body.ehb, totalLevel };
        }
      } else if (res.status === 429) {
        const retryAfterSec = Number(res.headers.get("retry-after"));
        this.rateLimitedUntil = Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 60_000);
        console.warn(`[wom] rate limited, backing off until ${new Date(this.rateLimitedUntil).toISOString()}`);
        // Don't poison the cache for the full TTL over a rate limit, not an
        // actual miss — the next call (another draft-room fetch, a WS-driven
        // refetch after a pick) should retry this id once the window clears.
        return null;
      } else {
        console.warn(`[wom] ${res.status} from GET /players/id/${womId}`);
      }
    } catch (err) {
      console.warn(`[wom] request failed: GET /players/id/${womId}`, err instanceof Error ? err.message : err);
    }

    // Cache misses too (short of an unexpected shape or a rate limit, handled
    // above) so a bad/unknown womId doesn't get re-requested on every
    // draft-room poll within the TTL.
    this.cache.set(womId, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  /**
   * Batched convenience — fetches (subject to per-id caching) in parallel.
   * A pool bigger than WOM's ~20 req/min budget will only get stats for as
   * many ids as the budget allows on a cold cache; the rest resolve on a
   * later call once the window resets (see rateLimitedUntil) rather than
   * blocking this one on a 60s wait.
   */
  async getManyPlayerStats(womIds: string[]): Promise<Map<string, WomPlayerStats | null>> {
    const unique = [...new Set(womIds)];
    const entries = await Promise.all(unique.map(async (id): Promise<[string, WomPlayerStats | null]> => [id, await this.getPlayerStats(id)]));
    return new Map(entries);
  }
}

let _client: WomClient | undefined;

export function getWomClient(): WomClient {
  if (!_client) _client = new WomClient();
  return _client;
}
