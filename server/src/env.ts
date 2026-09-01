// Loads the monorepo root .env before any other local module reads
// process.env. This MUST be the very first import in index.ts (and stay
// import-free itself besides dotenv/path) — TS/esbuild hoists all `import`
// declarations in a file above any interleaved plain statements, so a
// `dotenv.config()` call written textually before other imports in index.ts
// does NOT actually run before those imports are required. That silently
// broke several env-var-gated things that only work correctly on a real
// cold start: routes/auth.ts's and routes/mod.ts's dev-only gates always
// saw DEV_LOGIN_ENABLED as undefined, auth/discord.ts's guild scope check
// always saw DISCORD_GUILD_ID as undefined, and db/index.ts always ignored
// a custom DB_PATH — because each of those files' top-level code ran before
// dotenv had populated process.env.
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
