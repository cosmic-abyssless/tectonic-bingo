import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { isAdminDiscordId } from "../config";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const devMode = process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true";
  // Mirrors the server-side gate on PATCH /api/admin/users/:id.
  const canGrantAdmin = isAdminDiscordId(req.user!.discordId);
  res.json({ user: req.user, devMode, canGrantAdmin });
});

export default router;
