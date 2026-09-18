import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Overridable so the E2E suite can run its own client+server pair on
// alternate ports alongside a manually-running dev server (see
// docs/e2e-testing-plan.md) instead of fighting over 5173/3001. Defaults are
// unchanged for normal `npm run dev` usage.
const clientPort = Number(process.env.VITE_PORT) || 5173;
const apiTarget = process.env.VITE_API_TARGET || "http://localhost:3001";
const wsTarget = apiTarget.replace(/^http/, "ws");

export default defineConfig({
  // A new build id discards every persisted board (api/boardCache.ts), so a
  // changed response shape can never be hydrated into new code.
  define: { __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA ?? String(Date.now())) },
  plugins: [react(), tailwindcss()],
  server: {
    port: clientPort,
    strictPort: true,
    proxy: {
      // Proxy API and auth requests to the Express server during dev
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
      "/ws": {
        target: wsTarget,
        ws: true,
      },
    },
  },
});
