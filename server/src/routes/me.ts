import { isDevModeActive } from "../devMode";
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { noStore } from "../middleware/cacheControl";
import { isAdminDiscordId } from "../config";

const router = Router();

// noStore first, so the 401 for a signed-out caller is uncached too.
router.get("/", noStore, requireAuth, (req, res) => {
  const devMode = isDevModeActive();
  // Mirrors the server-side gate on PATCH /api/admin/users/:id.
  const canGrantAdmin = isAdminDiscordId(req.user!.discordId);
  res.json({ user: req.user, devMode, canGrantAdmin });
});

export default router;
