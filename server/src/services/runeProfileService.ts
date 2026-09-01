// Client for the RuneProfile clan API — more granular account types than
// WOM, notably distinguishing group ironman variants (WOM's `type` just
// reports "ironman" for a GIM member; RuneProfile has dedicated
// group_ironman/hardcore_group_ironman/unranked_group_ironman values).
// Works unauthenticated (30 req/min per IP); an optional RUNEPROFILE_API_KEY
// raises that to 120/min. See https://api.runeprofile.com/v1/docs.
//
// Keyed by RSN, not a numeric id like WOM's wom_id — RuneProfile's clan
// endpoint only exposes username + account type + clan rank, no id to
// store on signups the way Phase T2 stored womId. Matched case-insensitively
// against signup.rsn.
//
// Requires RUNEPROFILE_CLAN_NAME — off entirely, same nullable pattern as
// tectonicService/womService, when unset.

// Confirmed against the real clan's RuneProfile roster (223 members): the
// values actually present are "normal", "ironman", "hardcore_ironman",
// "group_ironman", "unranked_group_ironman". "ultimate_ironman" and
// "hardcore_group_ironman" weren't present in that sample but match OSRS's
// standard account-type ordering (ids 2 and 5, the two gaps in the ids we
// did see: 0 normal, 1 ironman, 3 hardcore, 4 group, 6 unranked group).
// "unknown" is defensive for anything else RuneProfile might send.
export type RuneProfileAccountType =
  | "normal"
  | "ironman"
  | "ultimate_ironman"
  | "hardcore_ironman"
  | "group_ironman"
  | "hardcore_group_ironman"
  | "unranked_group_ironman"
  | "unknown";

const RUNEPROFILE_BASE_URL = "https://api.runeprofile.com/v1";
const USER_AGENT = "tectonic-bingo (draft-room account type)";
const CACHE_TTL_MS = 5 * 60_000;
// Defensive cap on pagination — comfortably above any realistic clan size
// (100/page, so 2000 members) so a pagination bug elsewhere can't loop
// forever against a live API.
const MAX_PAGES = 20;

type FetchLike = typeof fetch;

export function getRuneProfileClanName(): string | null {
  return process.env.RUNEPROFILE_CLAN_NAME || null;
}

const KNOWN_ACCOUNT_TYPES: readonly RuneProfileAccountType[] = [
  "normal",
  "ironman",
  "ultimate_ironman",
  "hardcore_ironman",
  "group_ironman",
  "hardcore_group_ironman",
  "unranked_group_ironman",
];
function parseAccountType(key: unknown): RuneProfileAccountType {
  return KNOWN_ACCOUNT_TYPES.includes(key as RuneProfileAccountType) ? (key as RuneProfileAccountType) : "unknown";
}

interface ClanMemberResponse {
  username: string;
  accountType?: { key?: string };
}

interface ClanResponse {
  members: ClanMemberResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class RuneProfileClient {
  private cache: { value: Map<string, RuneProfileAccountType>; expiresAt: number } | null = null;
  private rateLimitedUntil = 0;

  constructor(
    private fetchImpl: FetchLike = fetch,
    private apiKey: string | null = process.env.RUNEPROFILE_API_KEY || null,
  ) {}

  /** Account type for every member of the given clan, keyed by lowercased RSN. */
  async getClanAccountTypes(clanName: string): Promise<Map<string, RuneProfileAccountType> | null> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    if (Date.now() < this.rateLimitedUntil) return null;

    const byRsn = new Map<string, RuneProfileAccountType>();
    let cursor: string | undefined;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(`${RUNEPROFILE_BASE_URL}/clans/${encodeURIComponent(clanName)}`);
        url.searchParams.set("limit", "100");
        if (cursor) url.searchParams.set("cursor", cursor);

        const headers: Record<string, string> = { "User-Agent": USER_AGENT };
        if (this.apiKey) headers["X-API-Key"] = this.apiKey;
        const res = await this.fetchImpl(url, { headers });

        if (!res.ok) {
          if (res.status === 429) {
            const retryAfterSec = Number(res.headers.get("retry-after"));
            this.rateLimitedUntil = Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 60_000);
            console.warn(`[runeprofile] rate limited, backing off until ${new Date(this.rateLimitedUntil).toISOString()}`);
          } else {
            console.warn(`[runeprofile] ${res.status} from GET /clans/${clanName}`);
          }
          return null;
        }

        const body = (await res.json()) as ClanResponse;
        for (const m of body.members ?? []) {
          if (typeof m.username === "string") {
            byRsn.set(m.username.toLowerCase(), parseAccountType(m.accountType?.key));
          }
        }

        if (!body.hasMore || !body.nextCursor) break;
        cursor = body.nextCursor;
      }
    } catch (err) {
      console.warn(`[runeprofile] request failed: GET /clans/${clanName}`, err instanceof Error ? err.message : err);
      return null;
    }

    this.cache = { value: byRsn, expiresAt: Date.now() + CACHE_TTL_MS };
    return byRsn;
  }
}

let _client: RuneProfileClient | undefined;

export function getRuneProfileClient(): RuneProfileClient {
  if (!_client) _client = new RuneProfileClient();
  return _client;
}
