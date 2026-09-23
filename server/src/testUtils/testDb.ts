import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "../db/schema";
import { withImmediateTransactions } from "../db/immediateTransactions";

// Builds a fresh, fully-migrated in-memory SQLite DB for tests — real schema,
// real foreign keys, no mocking. Applies every migration in server/drizzle in
// order so it stays correct as the schema evolves.
export function createTestDb(): { sqlite: Database.Database; db: BetterSQLite3Database<typeof schema> } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const migrationsDir = path.resolve(__dirname, "../../drizzle");
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrationFiles) {
    const migrationSql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    sqlite.exec(migrationSql.replace(/--> statement-breakpoint/g, ""));
  }
  // The same transaction behavior as the app's db (db/index.ts), so tests exercise what runs.
  return { sqlite, db: withImmediateTransactions(drizzle(sqlite, { schema })) };
}
