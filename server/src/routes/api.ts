import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// Get current authenticated user
router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// Health check (no auth required)
router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

export default router;
