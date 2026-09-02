import { defineConfig, devices } from "@playwright/test";

// Separate ports from the normal dev server (3001/5173) so the E2E suite
// never collides with a manually-running dev session — see
// docs/e2e-testing-plan.md §0/§2.
const SERVER_PORT = 3101;
const CLIENT_PORT = 5273;
const BASE_URL = `http://localhost:${CLIENT_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // prepare-db.cjs must finish BEFORE the server starts, not as a
      // Playwright globalSetup — see its header comment for why.
      command: "node e2e/prepare-db.cjs && npm run dev --workspace=server",
      url: `http://localhost:${SERVER_PORT}/api/bingos`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PORT: String(SERVER_PORT),
        DB_PATH: "./data/e2e.db",
        DEV_LOGIN_ENABLED: "true",
        DISCORD_CLIENT_ID: "e2e",
        DISCORD_CLIENT_SECRET: "e2e",
        DISCORD_CALLBACK_URL: `${BASE_URL}/auth/discord/callback`,
        DISCORD_GUILD_ID: "e2e",
        SESSION_SECRET: "e2e-secret",
        CLIENT_URL: BASE_URL,
        // Blank, not omitted — dotenv never overrides an already-set env
        // var, so an empty string here beats a real value in the root
        // .env and getTectonicConfig()/etc. treat "" as unset.
        TECTONIC_API_URL: "",
        TECTONIC_API_KEY: "",
        TECTONIC_GUILD_ID: "",
        ANTHROPIC_API_KEY: "",
        RUNEPROFILE_API_KEY: "",
        PLAYER_STATS_FETCH_DISABLED: "true",
      },
    },
    {
      command: "npm run dev --workspace=client",
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        VITE_PORT: String(CLIENT_PORT),
        VITE_API_TARGET: `http://localhost:${SERVER_PORT}`,
      },
    },
  ],
});
