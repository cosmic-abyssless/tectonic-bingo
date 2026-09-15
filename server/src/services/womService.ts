// Client for the Wise Old Man public API — no auth required. Cloudflare
// blocks requests without a real User-Agent header (confirmed: a bare curl
// gets a JS challenge page instead of JSON), so that header is mandatory,
// not just polite.
//
// Fetches one player at a time, by RSN, at signup time (see
// routes/bingos.ts / playerStatsService.ts) — not a live bulk group fetch
// at draft time anymore. That earlier approach needed WOM_GROUP_ID and had
// to work around WOM's 20 req/min unauthenticated limit for large pools;
// persisting each signup's data once, spread naturally over the signup
// period, sidesteps both. No env var needed — this is unconditionally on.
import type { AccountType } from "@bingo/shared";
import { USER_AGENT } from "../config";

const WOM_BASE_URL = "https://api.wiseoldman.net/v2";
const WOM_USER_AGENT = `${USER_AGENT} player stats`;

type FetchLike = typeof fetch;

export class WomClient {
  // Set from a 429's `retry-after` header. While in the future, new requests
  // short-circuit locally instead of hitting WOM.
  private rateLimitedUntil = 0;

  constructor(private fetchImpl: FetchLike = fetch) {}

  /** Raw WOM player object for the given RSN, or null if unranked/unreachable/rate-limited. Caller persists it verbatim. */
  async getPlayerByUsername(rsn: string): Promise<unknown | null> {
    if (Date.now() < this.rateLimitedUntil) return null;

    try {
      const res = await this.fetchImpl(`${WOM_BASE_URL}/players/${encodeURIComponent(rsn)}`, {
        headers: { "User-Agent": WOM_USER_AGENT },
      });
      if (res.ok) return await res.json();
      if (res.status === 429) {
        const retryAfterSec = Number(res.headers.get("retry-after"));
        this.rateLimitedUntil = Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 60_000);
        console.warn(`[wom] rate limited, backing off until ${new Date(this.rateLimitedUntil).toISOString()}`);
      } else if (res.status !== 404) {
        console.warn(`[wom] ${res.status} from GET /players/${rsn}`);
      }
    } catch (err) {
      console.warn(`[wom] request failed: GET /players/${rsn}`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

let _client: WomClient | undefined;

export function getWomClient(): WomClient {
  if (!_client) _client = new WomClient();
  return _client;
}

// --- Deriving the small summary shape the draft pool actually renders, ---
// --- from a persisted (or freshly fetched) raw WOM player blob.        ---

export interface WomPlayerSummary {
  ehb: number;
  accountType: AccountType;
}

// WOM's four raw type values, mapped onto the shared AccountType enum.
const WOM_TYPE_MAP: Record<string, AccountType> = {
  regular: "normal",
  ironman: "ironman",
  hardcore: "hardcore_ironman",
  ultimate: "ultimate_ironman",
};

interface StoredWomPlayer {
  ehb?: unknown;
  type?: unknown;
}

/** Parses a signups.womDataJson value (or a fresh getPlayerByUsername() result) into the draft pool's summary shape. */
export function parseWomSummary(raw: unknown): WomPlayerSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const player = raw as StoredWomPlayer;
  if (typeof player.ehb !== "number") return null;
  const accountType = (typeof player.type === "string" && WOM_TYPE_MAP[player.type]) || "unknown";
  return { ehb: player.ehb, accountType };
}
