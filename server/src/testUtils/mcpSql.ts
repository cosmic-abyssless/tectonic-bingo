// Test helpers for the SQL tool: the live database's shape (migrations plus the session store's table), on disk.
import fs from "fs";
import os from "os";
import path from "path";
import type Database from "better-sqlite3";
import session from "express-session";
import createSqliteStoreFactory from "better-sqlite3-session-store";

/** Creates the session store's table the way index.ts does, without its cleanup timer. */
export function addSessionStore(sqlite: Database.Database): void {
  const SqliteStore = createSqliteStoreFactory(session);
  const proto = SqliteStore.prototype as unknown as { startInterval: () => void };
  const original = proto.startInterval;
  proto.startInterval = () => {};
  try {
    new SqliteStore({ client: sqlite });
  } finally {
    proto.startInterval = original;
  }
}

/** A fresh temporary directory, removed by the returned cleanup. */
export function tempDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-sql-"));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Writes an in-memory database to a file, as the live database would be on disk. */
export function saveTo(sqlite: Database.Database, file: string): string {
  sqlite.prepare("VACUUM INTO ?").run(file);
  return file;
}
