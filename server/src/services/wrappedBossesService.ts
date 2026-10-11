// The raids and bosses Wrapped's "Who killed it the most" part looks at (CONTEXT.md "Wrapped"): a per-Bingo list of Wise
// Old Man boss metrics, in display order, that Admins edit with the Bingo's settings. Stored as JSON on the Bingo; null
// is the default list. A new Bingo starts with the previous Bingo's list, as it does with its Wrapped art.
import { and, desc, eq, like, not, sql } from "drizzle-orm";
import { DEFAULT_WRAPPED_BOSSES, MAX_WRAPPED_BOSSES, isWomBossMetric } from "@bingo/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos } from "../db/schema";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

/** Generated test Bingos (devTestDataService) are never the "previous Bingo" a real one copies its list from. */
const TESTDATA_PREFIX = "testdata-";

/** A Bingo's stored list, read back: the default for none, and anything the app no longer knows left out. */
export function parseWrappedBosses(json: string | null): string[] {
  if (json === null) return [...DEFAULT_WRAPPED_BOSSES];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(isWomBossMetric) : [...DEFAULT_WRAPPED_BOSSES];
  } catch {
    return [...DEFAULT_WRAPPED_BOSSES];
  }
}

/** A list from a request, checked: Wise Old Man boss metrics the app knows, each once, at most MAX_WRAPPED_BOSSES. */
export function normalizeWrappedBosses(input: unknown): string[] {
  if (!Array.isArray(input)) throw new ServiceError(400, "wrappedBosses must be an array of Wise Old Man boss metrics");
  for (const metric of input) if (!isWomBossMetric(metric)) throw new ServiceError(400, `Unknown Wise Old Man boss: ${String(metric)}`);
  const unique = [...new Set(input as string[])];
  if (unique.length > MAX_WRAPPED_BOSSES) throw new ServiceError(400, `Wrapped can look at most ${MAX_WRAPPED_BOSSES} raids and bosses`);
  return unique;
}

/** A new Bingo starts with the previous Bingo's list: the newest other Bingo (never a generated test Bingo). */
export function copyFromPreviousBingo(tx: Queryable, bingoId: string): void {
  const previous = tx
    .select({ json: bingos.wrappedBossesJson })
    .from(bingos)
    .where(and(not(eq(bingos.id, bingoId)), not(like(bingos.slug, `${TESTDATA_PREFIX}%`))))
    .orderBy(desc(bingos.createdAt), desc(sql`rowid`))
    .limit(1)
    .get();
  if (previous?.json) tx.update(bingos).set({ wrappedBossesJson: previous.json }).where(eq(bingos.id, bingoId)).run();
}
