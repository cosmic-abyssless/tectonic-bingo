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

const SNAPSHOTS_PAGE_SIZE = 50;

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

  /**
   * Every snapshot WOM holds for the RSN between two dates, raw and newest first, paging through them all
   * (see parseSnapshots). Null if any page is unreachable or rate-limited. Only reads what WOM already has:
   * it never asks WOM to update the player.
   */
  async getSnapshots(rsn: string, start: Date, end: Date): Promise<unknown[] | null> {
    const snapshots: unknown[] = [];
    for (let offset = 0; ; offset += SNAPSHOTS_PAGE_SIZE) {
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

  private async get(path: string, context: Record<string, unknown>): Promise<unknown | null> {
    if (Date.now() < this.rateLimitedUntil) return null;

    try {
      const headers: Record<string, string> = { "User-Agent": WOM_USER_AGENT };
      if (this.apiKey) headers["x-api-key"] = this.apiKey;
      const res = await this.fetchImpl(`${WOM_BASE_URL}${path}`, { headers });
      if (res.ok) return await res.json();
      if (res.status === 429) {
        const retryAfterSec = Number(res.headers.get("retry-after"));
        this.rateLimitedUntil = Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 60_000);
        log.warn("wom rate limited", { until: new Date(this.rateLimitedUntil).toISOString() });
      } else if (res.status !== 404) {
        log.warn("wom request failed", { status: res.status, ...context });
      }
    } catch (err) {
      log.warn("wom request failed", { ...context, err });
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
