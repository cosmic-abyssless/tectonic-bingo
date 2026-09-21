import fs from "fs";
import path from "path";
import express from "express";
import { injectRuntimeConfig, type RuntimeConfig } from "../runtimeConfig";
import { INDEX_HTML_CACHE_CONTROL, clientDistStaticOptions } from "./staticCaching";

/**
 * Serves the built client: hashed assets and static files as they are, and index.html (with the runtime config in its
 * head, see runtimeConfig.ts) for the page itself and for every other GET that isn't the API, auth, uploads or the
 * websocket, so client-side routing still resolves a direct navigation or refresh on a deep link.
 *
 * Returns false, and mounts nothing, when there is no build to serve. That is how development works: the client is
 * served by Vite's own dev server instead, so this never engages there. (It is keyed off the build existing rather than
 * NODE_ENV so a misconfigured environment variable can't silently skip it.)
 */
export function mountClientApp(app: express.Express, distDir: string, config: RuntimeConfig): boolean {
  const indexPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexPath)) return false;

  // Read once at startup: index.html is part of the build, and the config is fixed for the life of the process.
  const html = injectRuntimeConfig(fs.readFileSync(indexPath, "utf8"), config);
  const sendIndex: express.RequestHandler = (_req, res) => {
    res.set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": INDEX_HTML_CACHE_CONTROL }).send(html);
  };

  // Registered ahead of the static handler so neither `/` nor `/index.html` can serve the file without the config.
  app.get("/index.html", sendIndex);
  app.use(express.static(distDir, clientDistStaticOptions(distDir)));
  app.get(/^\/(?!api|auth|uploads|wiki-icons|ws|health).*/, sendIndex);
  return true;
}
