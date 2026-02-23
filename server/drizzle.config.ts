import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import path from 'path';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bingo.db'),
  },
});
