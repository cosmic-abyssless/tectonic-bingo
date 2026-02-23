import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bingo.db');

// Ensure the data directory exists before opening the file
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);

// WAL mode gives much better read concurrency (multiple readers, one writer).
// Foreign key enforcement is off by default in SQLite — turn it on.
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
