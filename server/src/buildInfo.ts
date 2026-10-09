import fs from "fs";
import path from "path";
import type { RequestHandler } from "express";
import type { ServerSocketMessage } from "@bingo/shared";

// Open pages learn a new build is out (#455): an Admin's page from before a fix shouldn't keep the bug alive until they
// happen to reload (docs/postmortems/2026-10-03-colour-picker.md). The server announces the build it serves, on every
// API response (X-Build-Id) and to every socket on connect (hello); a page built otherwise offers a reload.

let buildId: string | null = null;

/**
 * The id the built client was made with (client/dist/build-id.txt, written by client/vite.config.ts), or null with no
 * built client: in development Vite serves the client and nothing is announced.
 */
export function readBuildId(clientDist: string): string | null {
  try {
    return fs.readFileSync(path.join(clientDist, "build-id.txt"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

export function setBuildId(id: string | null): void {
  buildId = id;
}

/** FORCE_CLIENT_RELOAD=true: an outdated page reloads itself (at its next navigation, or after a 10-second notice). */
export function forceClientReload(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FORCE_CLIENT_RELOAD === "true";
}

/** The socket's hello, or null when there's no build to announce. */
export function helloMessage(): ServerSocketMessage | null {
  return buildId ? { type: "hello", buildId, forceReload: forceClientReload() } : null;
}

/** Puts the build on every response it sees: X-Build-Id, and X-Force-Reload: 1 when forcing. */
export const buildHeaders: RequestHandler = (_req, res, next) => {
  if (buildId) {
    res.setHeader("X-Build-Id", buildId);
    if (forceClientReload()) res.setHeader("X-Force-Reload", "1");
  }
  next();
};
