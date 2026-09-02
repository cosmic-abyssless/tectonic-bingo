// Builds a fresh, fully-migrated e2e.db and seeds E2E users — run via
// playwright.config.ts's server webServer `command` (chained with `&&`
// BEFORE the server itself starts), not as a Playwright globalSetup.
//
// Why not globalSetup: Playwright starts webServer plugins BEFORE running
// globalSetup (see createGlobalSetupTasks in playwright's runner — plugin
// setup, i.e. webServer, is unconditionally ordered first). A globalSetup
// that deletes+recreates the DB file races the server, which opens (and,
// via better-sqlite3-session-store, auto-creates) the file the moment it
// boots. The server keeps its original file handle even after the
// directory entry is unlinked and recreated, so migrations applied by a
// later globalSetup are invisible to the already-running server — it just
// serves 500s against an empty (sessions-table-only) database forever.
// Plain CommonJS (not TS) so this can run directly via `node`, no
// transform, as the first half of the webServer command string.
//
// Keep E2E_USERS here in sync with e2e/helpers.ts's copy — duplicated
// because this file must stay require()-able with zero build step.
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.resolve(__dirname, "../server/data/e2e.db");
const MIGRATIONS_DIR = path.resolve(__dirname, "../server/drizzle");

const E2E_ADMIN = "e2e-admin";
const E2E_PLAYERS = ["e2e-p1", "e2e-p2", "e2e-p3", "e2e-p4", "e2e-p5"];

for (const suffix of ["", "-shm", "-wal"]) {
  const f = DB_PATH + suffix;
  if (fs.existsSync(f)) fs.rmSync(f);
}
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
for (const file of migrationFiles) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  sqlite.exec(sql.replace(/--> statement-breakpoint/g, ""));
}

const insertUser = sqlite.prepare("INSERT INTO users (id, discord_id, discord_username, is_admin) VALUES (?, ?, ?, ?)");
insertUser.run(crypto.randomUUID(), E2E_ADMIN, "e2e_admin", 1);
for (const [i, discordId] of E2E_PLAYERS.entries()) {
  insertUser.run(crypto.randomUUID(), discordId, `e2e_player_${i + 1}`, 0);
}

sqlite.close();
console.log(`[e2e] prepared ${DB_PATH} (${migrationFiles.length} migrations, ${1 + E2E_PLAYERS.length} users)`);
