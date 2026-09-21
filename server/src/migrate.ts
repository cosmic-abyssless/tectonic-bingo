// Applies pending migrations to the database at DB_PATH and exits. This is what a deploy runs (from the built image,
// `node server/dist/migrate.js`) before the new version starts, while the previous version is still serving, so it
// must stay safe to run against a live database: see docs/zero-downtime-deploy-plan.md on additive migrations.
import "./env";
import path from "path";
import { DB_PATH, db, sqlite } from "./db";
import { runMigrations } from "./db/migrate";
import { log } from "./log";

try {
  runMigrations(db, path.resolve(__dirname, "../drizzle"));
  log.info("migrations applied", { db: DB_PATH });
} catch (err) {
  log.error("migration failed", { err });
  process.exitCode = 1;
} finally {
  sqlite.close();
}
