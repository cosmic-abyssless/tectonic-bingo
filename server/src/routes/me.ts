import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const devMode = process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true";
  res.json({ user: req.user, devMode });
});

export default router;
