// Deletes the SQLite file db:reset is about to (re)create, plus its WAL
// sidecars — so db:reset is actually idempotent (its name implies "start
// fresh", but drizzle-kit migrate is a no-op once the schema is current, and
// seed-dev.ts isn't idempotent, so re-running db:reset against an
// already-seeded DB previously failed with a UNIQUE constraint error
// instead of resetting anything). Mirrors db/index.ts's own DB_PATH
// resolution exactly, so it always targets the same file the server would
// open. Never touches anything if DB_PATH points elsewhere (e.g. the E2E
// suite's own data/e2e.db, which has its own prepare-db.cjs).
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "bingo.db");

const removed = [DB_PATH, `${DB_PATH}-shm`, `${DB_PATH}-wal`].filter((file) => {
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
});
console.log(removed.length > 0 ? `[db:wipe] removed ${removed.join(", ")}` : `[db:wipe] ${DB_PATH} didn't exist, nothing to do`);
