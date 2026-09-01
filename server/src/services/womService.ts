// Client for the Wise Old Man public API — no auth required. Cloudflare
// blocks requests without a real User-Agent header (confirmed: a bare curl
// gets a JS challenge page instead of JSON), so that header is mandatory,
// not just polite.
//
// Uses WOM's group endpoint (GET /groups/{id}) rather than per-player
// lookups: one request returns every member's stats at once, so a draft
// pool of any size costs exactly one WOM call instead of one per player.
// WOM's unauthenticated rate limit is 20 req/min (confirmed live) — that's
// fine for one request per draft-room fetch, but was the whole problem with
// the earlier per-player approach for any pool bigger than ~20.
//
// Requires WOM_GROUP_ID (the clan's group at wiseoldman.net/groups/<id>) —
// off entirely, same nullable pattern as tectonicService, when unset.
//
// The tradeoff: the group payload has EHB and account type per member but
// not a pre-computed total level (that only exists on the single-player
// `/players/id/{id}` endpoint's latestSnapshot, which would put us back to
// one request per player) — so this only surfaces EHB and account type.

// Confirmed against the real clan's WOM group (2921, 411 members): the
// values actually present are "regular", "ironman", "hardcore", "ultimate".
// "unknown" is defensive — an unranked/not-yet-tracked account, or any
// future WOM type this doesn't recognize yet.
export type WomAccountType = "regular" | "ironman" | "hardcore" | "ultimate" | "unknown";

export interface WomPlayerStats {
  ehb: number;
  accountType: WomAccountType;
}

const KNOWN_ACCOUNT_TYPES: readonly WomAccountType[] = ["regular", "ironman", "hardcore", "ultimate"];
function parseAccountType(type: unknown): WomAccountType {
  return KNOWN_ACCOUNT_TYPES.includes(type as WomAccountType) ? (type as WomAccountType) : "unknown";
}

const WOM_BASE_URL = "https://api.wiseoldman.net/v2";
const USER_AGENT = "tectonic-bingo (draft-room player stats)";
// WOM data only changes when a player re-syncs their profile — no need to
// refetch often.
const CACHE_TTL_MS = 5 * 60_000;

type FetchLike = typeof fetch;

export function getWomGroupId(): string | null {
  return process.env.WOM_GROUP_ID || null;
}

interface WomGroupMember {
  player: { id: number; ehb: number; type?: string };
}

interface WomGroupResponse {
  memberships?: WomGroupMember[];
}

export class WomClient {
  private cache: { value: Map<string, WomPlayerStats>; expiresAt: number } | null = null;
  // Set from a 429's `retry-after` header. While in the future, new requests
  // short-circuit locally instead of hitting WOM.
  private rateLimitedUntil = 0;

  constructor(private fetchImpl: FetchLike = fetch) {}

  /** EHB + account type for every member of the given WOM group, keyed by WOM player id (as a string, matching signups.womId). */
  async getGroupStats(groupId: string): Promise<Map<string, WomPlayerStats> | null> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    if (Date.now() < this.rateLimitedUntil) return null;

    try {
      const res = await this.fetchImpl(`${WOM_BASE_URL}/groups/${encodeURIComponent(groupId)}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.ok) {
        const body = (await res.json()) as WomGroupResponse;
        const byWomId = new Map<string, WomPlayerStats>();
        for (const m of body.memberships ?? []) {
          if (typeof m.player?.id === "number" && typeof m.player?.ehb === "number") {
            byWomId.set(String(m.player.id), { ehb: m.player.ehb, accountType: parseAccountType(m.player.type) });
          }
        }
        this.cache = { value: byWomId, expiresAt: Date.now() + CACHE_TTL_MS };
        return byWomId;
      }
      if (res.status === 429) {
        const retryAfterSec = Number(res.headers.get("retry-after"));
        this.rateLimitedUntil = Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 60_000);
        console.warn(`[wom] rate limited, backing off until ${new Date(this.rateLimitedUntil).toISOString()}`);
      } else {
        console.warn(`[wom] ${res.status} from GET /groups/${groupId}`);
      }
    } catch (err) {
      console.warn(`[wom] request failed: GET /groups/${groupId}`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

let _client: WomClient | undefined;

export function getWomClient(): WomClient {
  if (!_client) _client = new WomClient();
  return _client;
}
