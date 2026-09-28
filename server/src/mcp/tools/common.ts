// What the Bingo tools share: finding the Bingo a call names, time from its start, and keeping an answer well under
// what a model can read at once.
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as z from "zod";
import * as schema from "../../db/schema";
import { bingos, teams } from "../../db/schema";
import { effectiveStartsAt, endedAt } from "../../services/bingoStart";
import { McpToolError } from "../tool";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof bingos.$inferSelect;

export const slugInput = z.string().min(1).describe("The Bingo's slug, from list_bingos.");

/** The Bingo with this slug, or a tool error saying there's none. */
export function bingoBySlug(db: Db, slug: string): Bingo {
  const bingo = db.select().from(bingos).where(eq(bingos.slug, slug)).get();
  if (!bingo) throw new McpToolError(`No Bingo has the slug "${slug}". list_bingos gives every Bingo's slug.`);
  return bingo;
}

/** For a call's audit entry: the Bingo its slug names, if any. */
export function bingoIdForSlug(args: { slug: string }, { db }: { db: Db }): string | null {
  return db.select({ id: bingos.id }).from(bingos).where(eq(bingos.slug, args.slug)).get()?.id ?? null;
}

/** When the Bingo counts as started and when it ended (null while it hasn't), as the Stats page measures them. */
export function bingoSpan(db: Db, bingo: Bingo): { start: Date | null; end: Date | null } {
  return { start: effectiveStartsAt(db, bingo), end: endedAt(db, bingo) };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Hours from the Bingo's start to `at`, to two decimals; null when the Bingo hasn't started. */
export function hoursFrom(start: Date | null, at: Date): number | null {
  return start ? round2((at.getTime() - start.getTime()) / 3_600_000) : null;
}

/** Each Team's name by id. */
export function teamNames(db: Db, bingoId: string): Map<string, string> {
  return new Map(db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => [t.id, t.name]));
}

/** The most characters of JSON one list in an answer may take, leaving room for the rest (well under ~150k). */
export const LIST_BUDGET = 120_000;

/**
 * The first `limit` items that fit in `budget` characters of JSON, and a note saying how many were left out (null when
 * none were), so the model knows to narrow the call.
 */
export function fitList<T>(items: T[], limit: number | undefined, hint: string, budget = LIST_BUDGET): { items: T[]; truncated: string | null } {
  const capped = limit === undefined ? items : items.slice(0, limit);
  let used = 0;
  let n = 0;
  for (const item of capped) {
    used += JSON.stringify(item).length + 1;
    if (used > budget) break;
    n++;
  }
  if (n === items.length) return { items, truncated: null };
  return { items: capped.slice(0, n), truncated: `Showing ${n} of ${items.length}. ${hint}` };
}
