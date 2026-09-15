// Client for the clan's tectonic-api (../tectonic-api): the source of truth
// for clan membership, WOM-verified RSNs, clan points, and rank tiers. See
// docs/tectonic-api-integration-plan.md for the full picture.
//
// Server-to-server only — auth is a single static API key that must never
// reach the browser; every consumer proxies through our routes. The whole
// integration is optional: getTectonicClient() returns null unless all three
// env vars are set, and every method returns null on failure rather than
// throwing, so consumers degrade to current behavior when tectonic-api is
// down or unconfigured.
import { USER_AGENT } from "../config";

export interface TectonicConfig {
  baseUrl: string;
  apiKey: string;
  guildId: string;
}

// Field names mirror tectonic-api's JSON exactly (snake_case).
export interface TectonicRsn {
  rsn: string;
  wom_id: string;
}

export interface TectonicTier {
  name: string;
  icon?: string;
  role_id?: string;
  min_points: number;
  display_order: number;
}

export interface TectonicRecordTeammate {
  user_id: string;
  guild_id: string;
}

export interface TectonicRecord {
  record_id: number;
  boss_name: string;
  display_name: string;
  category: string;
  solo: boolean;
  value_type: string;
  date: string;
  value: number;
  team: TectonicRecordTeammate[];
}

export interface TectonicEvent {
  name: string;
  wom_id: string;
  guild_id: string;
  placement: number;
  position_cutoff: number;
  solo: boolean;
}

export interface TectonicAchievement {
  name: string;
  thumbnail: string;
  discord_icon: string;
  order: number;
}

export interface TectonicDetailedUser {
  user_id: string; // Discord snowflake — joins on our users.discordId
  guild_id: string;
  points: number;
  rank: number;
  tier?: TectonicTier;
  rsns: TectonicRsn[];
  records: TectonicRecord[];
  events: TectonicEvent[];
  achievements: TectonicAchievement[];
  combat_achievements: { name: string }[];
}

export interface TectonicRosterUser {
  user_id: string;
  guild_id: string;
  points: number;
  rsns: TectonicRsn[];
}

export function getTectonicConfig(): TectonicConfig | null {
  const baseUrl = process.env.TECTONIC_API_URL;
  const apiKey = process.env.TECTONIC_API_KEY;
  const guildId = process.env.TECTONIC_GUILD_ID;
  if (!baseUrl || !apiKey || !guildId) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, guildId };
}

type FetchLike = typeof fetch;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

/**
 * tectonic-api couldn't be reached or returned a non-2xx. Distinct from "the
 * API answered and this user isn't in it" — callers must not treat an outage
 * as non-membership.
 */
export class TectonicUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TectonicUnavailableError";
  }
}

export class TectonicClient {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private cfg: TectonicConfig,
    private fetchImpl: FetchLike = fetch,
  ) {}

  // Cache is keyed by URL. 60s keeps us far under tectonic-api's global
  // 120 req/s limiter even with a busy signup page, while staying fresh
  // enough for draft-time data.
  private async get<T>(path: string): Promise<T> {
    const url = `${this.cfg.baseUrl}${path}`;
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;

    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { Authorization: this.cfg.apiKey, "User-Agent": `${USER_AGENT} clan roster` } });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[tectonic] request failed: GET ${path}`, reason);
      throw new TectonicUnavailableError(`GET ${path}: ${reason}`);
    }
    if (!res.ok) {
      console.warn(`[tectonic] ${res.status} from GET ${path}`);
      throw new TectonicUnavailableError(`GET ${path}: HTTP ${res.status}`);
    }
    const value = (await res.json()) as T;
    this.cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** Full guild roster (leaderboard ordering) with RSNs and points. */
  async getRoster(limit = 1000): Promise<TectonicRosterUser[]> {
    return this.get<TectonicRosterUser[]>(`/api/v1/guilds/${this.cfg.guildId}/leaderboard?limit=${Math.min(limit, 1000)}`);
  }

  /**
   * Detailed users (RSNs, points, tier, records, events, achievements) by
   * Discord IDs. IDs unknown to tectonic are simply absent from the result.
   */
  async getDetailedUsers(discordIds: string[]): Promise<TectonicDetailedUser[]> {
    if (discordIds.length === 0) return [];
    const ids = discordIds.map(encodeURIComponent).join(",");
    return this.get<TectonicDetailedUser[]>(`/api/v1/guilds/${this.cfg.guildId}/users/${ids}`);
  }

  /** Convenience: one user's detailed record, or null if tectonic doesn't know them. Throws TectonicUnavailableError on failure. */
  async getDetailedUser(discordId: string): Promise<TectonicDetailedUser | null> {
    const users = await this.getDetailedUsers([discordId]);
    return users.find((u) => u.user_id === discordId) ?? null;
  }
}

let _client: TectonicClient | null | undefined;

/** Returns the client, or null if TECTONIC_API_URL/KEY/GUILD_ID aren't all set. */
export function getTectonicClient(): TectonicClient | null {
  if (_client === undefined) {
    const cfg = getTectonicConfig();
    _client = cfg ? new TectonicClient(cfg) : null;
  }
  return _client;
}
