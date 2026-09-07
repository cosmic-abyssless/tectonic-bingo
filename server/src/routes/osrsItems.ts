// Bingo-agnostic reference data — not nested under /api/bingos/:slug, since
// item search isn't scoped to any one bingo. requireAuth (not requireAdmin)
// because it's read-only public wiki data with nothing bingo-sensitive in
// it; login-gating it just keeps this server from being usable as an open,
// unauthenticated proxy to the wiki by anyone on the internet.
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import { getOsrsWikiClient } from "../services/osrsWikiService";

const router = Router();

/** Test/CI escape hatch — mirrors SCREENSHOT_OCR_DISABLED/PLAYER_STATS_FETCH_DISABLED so E2E never hits the real wiki. */
export function isOsrsItemSearchEnabled(): boolean {
  return process.env.OSRS_ITEM_SEARCH_DISABLED !== "true";
}

router.get(
  "/search",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!isOsrsItemSearchEnabled() || q.length < 2) {
      res.json({ items: [] });
      return;
    }
    const items = await getOsrsWikiClient().searchItems(q);
    res.json({ items });
  }),
);

export default router;
