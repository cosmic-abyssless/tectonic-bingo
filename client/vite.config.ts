import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Overridable so the E2E suite can run its own client+server pair on
// alternate ports alongside a manually-running dev server (see
// docs/e2e-testing-plan.md) instead of fighting over 5173/3001. Defaults are
// unchanged for normal `npm run dev` usage.
const clientPort = Number(process.env.VITE_PORT) || 5173;
const apiTarget = process.env.VITE_API_TARGET || "http://localhost:3001";
const wsTarget = apiTarget.replace(/^http/, "ws");

// Readable stack traces in Sentry need the build's source maps. Without SENTRY_AUTH_TOKEN (local builds, CI) none are
// made and nothing is uploaded. The release name is the commit, matching what the SDK reports at runtime.
const sentryToken = process.env.SENTRY_AUTH_TOKEN;
const sentryRelease = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;

export default defineConfig({
  // A new build id discards every persisted board (api/boardCache.ts), so a
  // changed response shape can never be hydrated into new code.
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA ?? String(Date.now())),
    // Railway sets the commit being built; it is what Sentry calls the release (the server reports the same value).
    __SENTRY_RELEASE__: JSON.stringify(process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? ""),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(sentryToken
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG ?? "tectonic-l9",
            project: process.env.SENTRY_PROJECT ?? "tectonic-client",
            authToken: sentryToken,
            ...(sentryRelease ? { release: { name: sentryRelease } } : {}),
            sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
            telemetry: false,
          }),
        ]
      : []),
  ],
  build: { sourcemap: sentryToken ? "hidden" : false },
  server: {
    port: clientPort,
    strictPort: true,
    proxy: {
      // Proxy API and auth requests to the Express server during dev
      "/health": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/auth": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/uploads": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/wiki-icons": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: wsTarget,
        ws: true,
      },
    },
  },
});
