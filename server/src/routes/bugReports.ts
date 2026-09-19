import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bugReportService from "../services/bugReportService";
import * as bingoService from "../services/bingoService";
import { ServiceError } from "../services/errors";

// Site-wide — deliberately not gated on requireGuildMember, since the bug
// report button is visible to every logged-in user, not just clan members.
const router = Router();
router.use(requireAuth);

// Bingo pages are all mounted under /b/:slug (see client/src/App.tsx) — best
// effort tag, not a hard requirement, so an unrecognized slug just means null.
function resolveBingoIdFromPageUrl(pageUrl: string | null): string | null {
  const slug = pageUrl?.match(/^\/b\/([^/]+)/)?.[1];
  if (!slug) return null;
  return bingoService.getBingoBySlug(db, slug)?.id ?? null;
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { description, pageUrl, userAgent, palette } = req.body as { description?: string; pageUrl?: string; userAgent?: string; palette?: string };
    if (!description) throw new ServiceError(400, "description is required");
    const bugReport = bugReportService.createBugReport(db, {
      reporterUserId: req.user!.id,
      description,
      pageUrl: pageUrl ?? null,
      userAgent: userAgent ?? null,
      palette: typeof palette === "string" ? palette : null,
      bingoId: resolveBingoIdFromPageUrl(pageUrl ?? null),
    });
    res.status(201).json({ bugReport });
  }),
);

export default router;
