// Client for the RuneProfile API — more granular account types than WOM,
// notably distinguishing group ironman variants (WOM's `type` just reports
// "ironman" for a GIM member; RuneProfile has dedicated
// group_ironman/hardcore_group_ironman/unranked_group_ironman values).
//
// Fetches one account at a time, by RSN, at signup time (see
// routes/bingos.ts / playerStatsService.ts) — not a live bulk clan fetch at
// draft time anymore. That earlier approach needed a configured
// RUNEPROFILE_CLAN_NAME and paginated through the whole clan on every
// draft-room load; persisting each signup's data once sidesteps both. No
// required env var — this is unconditionally on. Works unauthenticated
// (30 req/min per IP); an optional RUNEPROFILE_API_KEY raises that to
// 120/min. See https://api.runeprofile.com/v1/docs.
import type { AccountType } from "@bingo/shared";
import { USER_AGENT } from "../config";

const RUNEPROFILE_BASE_URL = "https://api.runeprofile.com/v1";
const RUNEPROFILE_USER_AGENT = `${USER_AGENT} player stats`;

type FetchLike = typeof fetch;

export class RuneProfileClient {
  private rateLimitedUntil = 0;

  constructor(
    private fetchImpl: FetchLike = fetch,
    private apiKey: string | null = process.env.RUNEPROFILE_API_KEY || null,
  ) {}

  /** Raw RuneProfile full-account object for the given RSN, or null if not tracked/unreachable/rate-limited. Caller persists it verbatim. */
  async getAccountFull(rsn: string): Promise<unknown | null> {
    if (Date.now() < this.rateLimitedUntil) return null;

    try {
      const headers: Record<string, string> = { "User-Agent": RUNEPROFILE_USER_AGENT };
      if (this.apiKey) headers["X-API-Key"] = this.apiKey;
      const res = await this.fetchImpl(`${RUNEPROFILE_BASE_URL}/accounts/${encodeURIComponent(rsn)}/full`, { headers });
      if (res.ok) return await res.json();
      if (res.status === 429) {
        const retryAfterSec = Number(res.headers.get("retry-after"));
        this.rateLimitedUntil = Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 60_000);
        console.warn(`[runeprofile] rate limited, backing off until ${new Date(this.rateLimitedUntil).toISOString()}`);
      } else if (res.status !== 404) {
        console.warn(`[runeprofile] ${res.status} from GET /accounts/${rsn}/full`);
      }
    } catch (err) {
      console.warn(`[runeprofile] request failed: GET /accounts/${rsn}/full`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

let _client: RuneProfileClient | undefined;

export function getRuneProfileClient(): RuneProfileClient {
  if (!_client) _client = new RuneProfileClient();
  return _client;
}

// --- Deriving the small summary the draft pool renders, from a persisted ---
// --- (or freshly fetched) raw RuneProfile account blob.                  ---

// Confirmed against the real clan's RuneProfile roster: "normal", "ironman",
// "hardcore_ironman", "group_ironman", "unranked_group_ironman" are in
// active use; "ultimate_ironman" and "hardcore_group_ironman" match OSRS's
// standard account-type ordering even though no member happened to have
// one in that sample. "unknown" is defensive for anything else.
const KNOWN_ACCOUNT_TYPES: readonly AccountType[] = [
  "normal",
  "ironman",
  "ultimate_ironman",
  "hardcore_ironman",
  "group_ironman",
  "hardcore_group_ironman",
  "unranked_group_ironman",
];

interface StoredRuneProfileAccount {
  accountType?: { key?: unknown };
}

/** Parses a signups.runeProfileDataJson value (or a fresh getAccountFull() result) into the draft pool's account-type field. */
export function parseAccountType(raw: unknown): AccountType | null {
  if (!raw || typeof raw !== "object") return null;
  const key = (raw as StoredRuneProfileAccount).accountType?.key;
  return KNOWN_ACCOUNT_TYPES.includes(key as AccountType) ? (key as AccountType) : "unknown";
}
