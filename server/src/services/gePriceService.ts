// Grand Exchange prices from the OSRS Wiki's real-time prices API
// (https://prices.runescape.wiki/api/v1/osrs) — no auth or key required, but
// the wiki asks for a descriptive User-Agent and for bulk requests over
// per-item loops. So this keeps the whole price list in memory: `/mapping`
// (every item's name → id, ~4k items) at most daily, `/latest` (every item's
// latest buy/sell price) at most every 5 minutes and only when a price is
// wanted. However many items or submissions, that's at most 12 requests an
// hour, and none while nobody submits.
//
// Staleness is judged on the real clock, never clock.ts `now()`: the dev
// test-data generator spoofs that hours apart between submissions, which would
// make every one of them look stale and refetch.
import { USER_AGENT } from "../config";
import { log } from "../log";

const PRICES_BASE_URL = "https://prices.runescape.wiki/api/v1/osrs";
const PRICES_USER_AGENT = `${USER_AGENT} ge prices`;
const LATEST_MAX_AGE_MS = 5 * 60_000;
const MAPPING_MAX_AGE_MS = 24 * 60 * 60_000;
// A charged item (Craw's bow, Tumeken's shadow, Toxic blowpipe) isn't on the GE; its uncharged version is. A name the
// GE doesn't know is tried with these suffixes, in order.
export const UNCHARGED_SUFFIXES = [" (u)", " (uncharged)", " (empty)"];

// After a failed refresh, wait this long before trying again, so a wiki outage isn't retried on every submission.
const RETRY_AFTER_FAILURE_MS = 60_000;

type FetchLike = typeof fetch;

interface MappingEntry {
  id: number;
  name: string;
}

interface LatestResponse {
  data?: Record<string, { high?: number | null; low?: number | null }>;
}

/** Test/CI escape hatch — same convention as OSRS_ITEM_SEARCH_DISABLED, so E2E never hits the real wiki. */
export function isGePriceFetchEnabled(): boolean {
  return process.env.GE_PRICES_FETCH_DISABLED !== "true";
}

export class GePriceTable {
  private idByName = new Map<string, number>();
  private priceById = new Map<number, number>();
  private mappingFetchedAt = -Infinity;
  private latestFetchedAt = -Infinity;
  private failedAt = -Infinity;
  private inflight: Promise<boolean> | null = null;

  constructor(
    private fetchImpl: FetchLike = fetch,
    private clock: () => number = Date.now,
    private enabled: () => boolean = isGePriceFetchEnabled,
  ) {}

  /** Whether prices have been loaded at least once. */
  isLoaded(): boolean {
    return this.priceById.size > 0;
  }

  /** The GE id of `name`, or of its uncharged version when the charged one isn't on the GE. Case-insensitive. */
  private idFor(name: string): number | undefined {
    const key = name.trim().toLowerCase();
    for (const suffix of ["", ...UNCHARGED_SUFFIXES]) {
      const id = this.idByName.get(key + suffix);
      if (id !== undefined) return id;
    }
    return undefined;
  }

  /** Whether `name` (or its uncharged version) is an item the GE knows, from the last mapping fetched. */
  isKnownItem(name: string): boolean {
    return this.idFor(name) !== undefined;
  }

  /**
   * The item's price from the last fetch: the midpoint of its latest buy and sell, or whichever exists. A charged
   * item is priced as its uncharged version. Null when unknown or not loaded yet.
   */
  unitPrice(name: string): number | null {
    const id = this.idFor(name);
    return id === undefined ? null : (this.priceById.get(id) ?? null);
  }

  isStale(): boolean {
    const now = this.clock();
    return now - this.latestFetchedAt > LATEST_MAX_AGE_MS && now - this.failedAt > RETRY_AFTER_FAILURE_MS;
  }

  /**
   * Refetches whatever is out of date. Concurrent callers share one refresh. Resolves true when new prices were
   * loaded, false when nothing was due or the fetch failed. Never throws — a flaky wiki means missing GP values
   * for a while, not a broken submission.
   */
  refreshIfStale(): Promise<boolean> {
    if (!this.enabled() || !this.isStale()) return Promise.resolve(false);
    this.inflight ??= this.refresh()
      .then((ok) => {
        if (!ok) this.failedAt = this.clock();
        return ok;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async refresh(): Promise<boolean> {
    try {
      if (this.clock() - this.mappingFetchedAt > MAPPING_MAX_AGE_MS) {
        const mapping = await this.getJson<MappingEntry[]>("/mapping");
        if (!Array.isArray(mapping)) return false;
        this.idByName = new Map(mapping.map((m) => [m.name.trim().toLowerCase(), m.id]));
        this.mappingFetchedAt = this.clock();
      }
      const latest = await this.getJson<LatestResponse>("/latest");
      if (!latest?.data) return false;
      const prices = new Map<number, number>();
      for (const [id, { high, low }] of Object.entries(latest.data)) {
        const price = high && low ? Math.round((high + low) / 2) : (high ?? low);
        if (price) prices.set(Number(id), price);
      }
      this.priceById = prices;
      this.latestFetchedAt = this.clock();
      return true;
    } catch (err) {
      log.warn("ge prices fetch failed", { err });
      return false;
    }
  }

  private async getJson<T>(path: string): Promise<T | null> {
    const res = await this.fetchImpl(`${PRICES_BASE_URL}${path}`, { headers: { "User-Agent": PRICES_USER_AGENT } });
    if (!res.ok) {
      log.warn("ge prices fetch failed", { path, status: res.status });
      return null;
    }
    return (await res.json()) as T;
  }
}

let _table: GePriceTable | undefined;

export function getGePriceTable(): GePriceTable {
  if (!_table) _table = new GePriceTable();
  return _table;
}
