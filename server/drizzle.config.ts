import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import fs from 'fs';
import path from 'path';

// Bare `dotenv/config` loads .env from process.cwd() — fine when invoked
// from the repo root, but npm runs workspace scripts (e.g. `npm run
// db:migrate --workspace=server`, or just `npm run db:migrate` from inside
// server/) with cwd set to the workspace itself, where there is no .env.
// The actual .env lives at the monorepo root — same fix src/env.ts already
// needed for the same reason (see its own comment).
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bingo.db');

// better-sqlite3 creates the file but not its directory, and drizzle-kit
// migrate is the first thing to open the DB on a fresh deploy (e.g. a nested
// DB_PATH on an empty volume). Same guard src/db/index.ts applies.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: DB_PATH,
  },
});
