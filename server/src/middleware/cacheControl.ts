import type { RequestHandler } from "express";

// For per-viewer API responses the browser may keep but must always
// revalidate. `private`: the response depends on who is asking (the board is
// empty for non-mods before the reveal stage), so shared caches must not store
// it. `no-cache`, not `max-age`: the client refetches after WebSocket events
// (bingo_changed, stage_changed) and a max-age would answer that refetch from
// the HTTP cache. Revalidation is cheap — Express already sends a weak ETag, so
// an unchanged response is a bodyless 304.
export const privateRevalidate: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "private, no-cache");
  next();
};
