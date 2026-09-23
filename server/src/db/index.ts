import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { withImmediateTransactions } from './immediateTransactions';
import path from 'path';
import fs from 'fs';

/** The database file actually opened; log this, not a re-derived default. */
export const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bingo.db');

// Ensure the data directory exists before opening the file
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

/**
 * How long a write waits for another connection's lock before failing with "database is locked". Litestream, which
 * replicates this file, briefly locks it to checkpoint; set explicitly (better-sqlite3's default is 5s) so that is a
 * wait, not an error. The wait blocks the event loop, so it is a ceiling for a rare case, not something to lean on.
 */
export const BUSY_TIMEOUT_MS = 10_000;

export const sqlite = new Database(DB_PATH, { timeout: BUSY_TIMEOUT_MS });

// WAL mode gives much better read concurrency (multiple readers, one writer).
// Foreign key enforcement is off by default in SQLite — turn it on.
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Every transaction takes the write lock at BEGIN, so the busy timeout above applies to it (see immediateTransactions.ts).
export const db = withImmediateTransactions(drizzle(sqlite, { schema }));
