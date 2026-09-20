// A player is named by their RSN inside a bingo, not by their Discord name. The RSN is the one they signed up with
// (a signup of any status: someone who withdrew is still named by it in the history). A user with no signup in the
// bingo, like a mod who isn't playing, has none and is named by their Discord name.
import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signups } from "../db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** userId -> RSN, for the users who signed up to this bingo. */
export function rsnsInBingo(db: Db | Tx, bingoId: string, userIds: readonly string[]): Map<string, string> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = db.select({ userId: signups.userId, rsn: signups.rsn }).from(signups).where(and(eq(signups.bingoId, bingoId), inArray(signups.userId, ids))).all();
  return new Map(rows.map((r) => [r.userId, r.rsn]));
}

/** `${bingoId}|${userId}` -> RSN, for entries that span bingos (the site-wide audit log). */
export function rsnsAcrossBingos(db: Db | Tx, pairs: readonly { bingoId: string | null; userId: string | null }[]): Map<string, string> {
  const bingoIds = [...new Set(pairs.flatMap((p) => (p.bingoId ? [p.bingoId] : [])))];
  const userIds = [...new Set(pairs.flatMap((p) => (p.userId ? [p.userId] : [])))];
  if (bingoIds.length === 0 || userIds.length === 0) return new Map();
  const rows = db
    .select({ bingoId: signups.bingoId, userId: signups.userId, rsn: signups.rsn })
    .from(signups)
    .where(and(inArray(signups.bingoId, bingoIds), inArray(signups.userId, userIds)))
    .all();
  return new Map(rows.map((r) => [`${r.bingoId}|${r.userId}`, r.rsn]));
}

/** The rows with `rsn` set to the RSN each user signed up with in this bingo (null when they didn't). */
export function withRsn<T extends { id: string }>(db: Db | Tx, bingoId: string, rows: readonly T[]): (T & { rsn: string | null })[] {
  const rsns = rsnsInBingo(db, bingoId, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, rsn: rsns.get(r.id) ?? null }));
}
