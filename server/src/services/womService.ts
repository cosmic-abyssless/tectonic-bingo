// Client for the Wise Old Man public API. Cloudflare blocks requests
// without a real User-Agent header (confirmed: a bare curl gets a JS
// challenge page instead of JSON), so that header is mandatory, not just
// polite.
//
// Fetches one player at a time, by RSN, at signup time (see
// routes/bingos.ts / playerStatsService.ts) — not a live bulk group fetch
// at draft time anymore. That earlier approach needed WOM_GROUP_ID and had
// to work around WOM's 20 req/min unauthenticated limit for large pools;
// persisting each signup's data once, spread naturally over the signup
// period, sidesteps both. Optional WOM_API_KEY is sent as `x-api-key` and
// raises the cap from 20 to 100 req/min (https://docs.wiseoldman.net/api).
import type { AccountType } from "@bingo/shared";
import { USER_AGENT } from "../config";
import { log } from "../log";

const WOM_BASE_URL = "https://api.wiseoldman.net/v2";
const WOM_USER_AGENT = `${USER_AGENT} player stats`;

type FetchLike = typeof fetch;

// WOM accepts at least 200 snapshots per page (checked by hand); 100 keeps each response modest.
const SNAPSHOTS_PAGE_SIZE = 100;

/** A player looked up on WOM: found (the raw player), not tracked by WOM (a 404), or WOM unreachable or rate-limited. */
export type WomLookup = { status: "found"; player: unknown } | { status: "not_found" } | { status: "unavailable" };

/** An account as WOM knows it: its WOM id (kept through in-game renames) and the name it goes by now. */
export interface WomAccount {
  womId: string;
  displayName: string;
}

/** The account in a raw WOM player object (a lookup's `player`), or null if it isn't one. */
export function parseWomAccount(raw: unknown): WomAccount | null {
  const player = raw as { id?: unknown; username?: unknown; displayName?: unknown } | null;
  if (!player || typeof player.id !== "number") return null;
  const displayName = typeof player.displayName === "string" ? player.displayName : typeof player.username === "string" ? player.username : null;
  return displayName ? { womId: String(player.id), displayName } : null;
}

export class WomClient {
  // Set from a 429's `retry-after` header. While in the future, new requests
  // short-circuit locally instead of hitting WOM.
  private rateLimitedUntil = 0;

  constructor(
    private fetchImpl: FetchLike = fetch,
    private apiKey: string | null = process.env.WOM_API_KEY || null,
  ) {}

  /** Raw WOM player object for the given RSN, or null if unranked/unreachable/rate-limited. Caller persists it verbatim. */
  async getPlayerByUsername(rsn: string): Promise<unknown | null> {
    return this.get(`/players/${encodeURIComponent(rsn)}`, { rsn });
  }

  /** The WOM player for the RSN, telling an account WOM doesn't track apart from WOM being unreachable or rate-limited. */
  async lookupPlayer(rsn: string): Promise<WomLookup> {
    return this.lookup(`/players/${encodeURIComponent(rsn)}`, { rsn });
  }

  /** The WOM player with this WOM id, which follows the account through in-game renames (see lookupPlayer). */
  async lookupPlayerById(womId: string): Promise<WomLookup> {
    return this.lookup(`/players/id/${encodeURIComponent(womId)}`, { womId });
  }

  /**
   * Every snapshot WOM holds for the RSN between two dates, raw and newest first, paging through them all
   * (see parseSnapshots). Null if any page is unreachable or rate-limited. Only reads what WOM already has:
   * it never asks WOM to update the player.
   *
   * Each page is one request against WOM's rate limit: `beforeEachPage` is awaited before each, for a caller that
   * paces its requests. A caller reading repeatedly should store what it has and start from its last stored
   * snapshot, not re-read the whole Bingo every time.
   */
  async getSnapshots(rsn: string, start: Date, end: Date, opts: { beforeEachPage?: () => Promise<void> } = {}): Promise<unknown[] | null> {
    const snapshots: unknown[] = [];
    for (let offset = 0; ; offset += SNAPSHOTS_PAGE_SIZE) {
      await opts.beforeEachPage?.();
      const query = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: String(SNAPSHOTS_PAGE_SIZE),
        offset: String(offset),
      });
      const page = await this.get(`/players/${encodeURIComponent(rsn)}/snapshots?${query}`, { rsn });
      if (!Array.isArray(page)) return null;
      snapshots.push(...page);
      if (page.length < SNAPSHOTS_PAGE_SIZE) return snapshots;
    }
  }

  /** Until when WOM's 429 holds new requests off (ms since epoch); in the past when it doesn't. */
  get rateLimitedUntilMs(): number {
    return this.rateLimitedUntil;
  }

  /** Whether requests are sent with an API key, which raises WOM's limit from 20 to 100 a minute. */
  get hasApiKey(): boolean {
    return this.apiKey !== null;
  }

  /** The response body, or null for a 404, an error, or while (or because) WOM is rate-limiting us. */
  private async get(path: string, context: Record<string, unknown>): Promise<unknown | null> {
    const result = await this.lookup(path, context);
    return result.status === "found" ? result.player : null;
  }

  private async lookup(path: string, context: Record<string, unknown>): Promise<WomLookup> {
    if (Date.now() < this.rateLimitedUntil) return { status: "unavailable" };

    try {
      const headers: Record<string, string> = { "User-Agent": WOM_USER_AGENT };
      if (this.apiKey) headers["x-api-key"] = this.apiKey;
      const res = await this.fetchImpl(`${WOM_BASE_URL}${path}`, { headers });
      if (res.ok) return { status: "found", player: await res.json() };
      if (res.status === 404) return { status: "not_found" };
      if (res.status === 429) {
        const retryAfterSec = Number(res.headers.get("retry-after"));
        this.rateLimitedUntil = Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 60_000);
        // Logged as an error, so Sentry sees it: requests are paced to stay under WOM's limit, so a 429 means they aren't.
        log.error("wom rate limited", { until: new Date(this.rateLimitedUntil).toISOString(), err: new Error(`GET ${path}: HTTP 429`) });
      } else {
        // Any other non-2xx goes to Sentry (log.error with an Error): the lookup came back empty, and nothing else says why.
        log.error("wom request failed", { status: res.status, ...context, err: new Error(`GET ${path}: HTTP ${res.status}`) });
      }
    } catch (err) {
      log.warn("wom request failed", { ...context, err });
    }
    return { status: "unavailable" };
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
  ehp: number;
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
  ehp?: unknown;
  type?: unknown;
}

/** Parses a signups.womDataJson value (or a fresh getPlayerByUsername() result) into the draft pool's summary shape. */
export function parseWomSummary(raw: unknown): WomPlayerSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const player = raw as StoredWomPlayer;
  if (typeof player.ehb !== "number") return null;
  const accountType = (typeof player.type === "string" && WOM_TYPE_MAP[player.type]) || "unknown";
  // Blobs stored before EHP was read lack it; treat as 0 rather than dropping the whole summary.
  return { ehb: player.ehb, ehp: typeof player.ehp === "number" ? player.ehp : 0, accountType };
}

// --- A Player's kill counts over time, from their raw WOM snapshots (#195). ---

export interface WomSnapshot {
  at: Date;
  /** Kill count per WOM boss metric. Null while it's below the hiscores' minimum (WOM's -1). */
  bossKills: Record<string, number | null>;
  ehb: number | null;
  ehp: number | null;
  /** Clue scrolls of every tier. Null while it's below the hiscores' minimum. */
  clues: number | null;
}

interface RawSnapshot {
  createdAt?: unknown;
  data?: {
    bosses?: Record<string, { kills?: unknown }>;
    activities?: Record<string, { score?: unknown }>;
    computed?: Record<string, { value?: unknown }>;
  };
}

const ranked = (n: unknown): number | null => (typeof n === "number" && n >= 0 ? n : null);

/** Raw snapshots (from getSnapshots) as a timeline, oldest first. Entries it can't read are dropped. */
export function parseSnapshots(raw: unknown[]): WomSnapshot[] {
  const out: WomSnapshot[] = [];
  for (const entry of raw) {
    const snap = entry as RawSnapshot;
    const at = typeof snap?.createdAt === "string" ? new Date(snap.createdAt) : null;
    if (!at || Number.isNaN(at.getTime()) || !snap.data) continue;
    const bossKills: Record<string, number | null> = {};
    for (const [metric, boss] of Object.entries(snap.data.bosses ?? {})) bossKills[metric] = ranked(boss?.kills);
    out.push({
      at,
      bossKills,
      ehb: ranked(snap.data.computed?.ehb?.value),
      ehp: ranked(snap.data.computed?.ehp?.value),
      clues: ranked(snap.data.activities?.clue_scrolls_all?.score),
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
