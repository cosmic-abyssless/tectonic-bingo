import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
