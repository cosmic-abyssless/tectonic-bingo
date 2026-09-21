import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Applies every migration in `migrationsFolder` that the database doesn't have yet, the way `drizzle-kit migrate` does
 * (same journal, same `__drizzle_migrations` table, so a database migrated by either is understood by the other), but
 * from the runtime dependencies alone: a production image doesn't carry drizzle-kit.
 *
 * Like drizzle-kit, it skips any migration dated earlier than the newest one already applied, so migrations must be
 * generated in order and merged in order.
 */
export function runMigrations(db: BetterSQLite3Database<any>, migrationsFolder: string): void {
  migrate(db, { migrationsFolder });
}
