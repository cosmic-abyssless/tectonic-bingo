import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { auditSkip } from "../audit/middleware";
import { log } from "../log";

const MAX_MSG = 500;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.user?.id ?? req.ip ?? "anon";
  const now = Date.now();
  const slot = hits.get(key);
  if (!slot || now >= slot.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }
  slot.count += 1;
  if (slot.count > MAX_PER_WINDOW) {
    res.status(429).json({ error: "Too many reports" });
    return;
  }
  next();
}

const router = Router();
router.use(requireAuth);
router.post(
  "/",
  auditSkip("client error report — ops log only"),
  rateLimit,
  (req, res) => {
    const body = req.body as { message?: unknown; source?: unknown; page?: unknown };
    const message = typeof body.message === "string" ? body.message.slice(0, MAX_MSG) : "client error";
    const source = typeof body.source === "string" ? body.source.slice(0, 80) : undefined;
    const page = typeof body.page === "string" ? body.page.split("?")[0]!.slice(0, 200) : undefined;
    log.error("client error", {
      message,
      source,
      page,
      userId: req.user?.id,
      requestId: req.audit?.requestId,
    });
    res.status(204).end();
  },
);

export default router;
