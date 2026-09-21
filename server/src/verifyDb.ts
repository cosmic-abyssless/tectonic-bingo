// Prints a health report for a database file and exits non-zero if it isn't fit to start on:
//   node server/dist/verifyDb.js [path]      (defaults to DB_PATH)
// From the image: `docker run --rm -v <data>:/data IMAGE verify-db`. Read-only: it never changes the file.
import path from "node:path";
import { verifyDatabase } from "./db/verify";

const dbPath = process.argv[2] ?? process.env.DB_PATH ?? "/data/sqlite/bingo.db";
const report = verifyDatabase(dbPath, path.resolve(__dirname, "../drizzle"));

process.stdout.write(`${JSON.stringify({ db: dbPath, ...report }, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 1;
