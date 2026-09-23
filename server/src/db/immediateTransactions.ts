import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/**
 * Makes every transaction on `db` start with BEGIN IMMEDIATE instead of SQLite's default deferred BEGIN, unless a call
 * site asks for another behavior.
 *
 * A deferred transaction takes the write lock only at its first write. If another connection commits between the
 * transaction's first read and that write, SQLite can't upgrade the stale read snapshot and fails at once with
 * SQLITE_BUSY_SNAPSHOT ("database is locked"): the busy timeout never applies. Our own process has one connection, but
 * Litestream replicates the same file and commits too (TECTONIC-SERVER-4: a draft pick failed this way on staging while
 * the test data generator was writing hard). Taking the lock at BEGIN, where the busy timeout does apply, means a
 * transaction waits for a moment instead of failing. Our transactions are synchronous and short, and this process is
 * the only app writer, so holding the lock from the start costs nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema; the db keeps its own exact type
export function withImmediateTransactions<D extends BetterSQLite3Database<any>>(db: D): D {
  const transaction = db.transaction.bind(db);
  db.transaction = ((fn, config) => transaction(fn, { behavior: 'immediate', ...config })) as typeof db.transaction;
  return db;
}
