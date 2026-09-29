// A Historical Bingo's screenshots, uploaded one at a time after its import (#320): see
// services/historicalScreenshotService.ts. Mounted at /api/bingos/:slug/admin/historical, ahead of the admin router,
// because requireBingo refuses every other write to a Historical Bingo. Site Admins only.
import { Router, type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { UPLOADS_DIR } from "../config";
import { db } from "../db";
import { bingos } from "../db/schema";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAuth } from "../middleware/requireAuth";
import { imageUpload } from "../middleware/upload";
import { ServiceError } from "../services/errors";
import * as historicalScreenshotService from "../services/historicalScreenshotService";

const router = Router({ mergeParams: true });
// The same storage, variants and size limit as a live Submission's screenshot (routes/bingos.ts).
const upload = imageUpload(UPLOADS_DIR, { variants: true });

// Like requireBingo, without its refusal of writes to a Historical Bingo: attaching its screenshots is the one write
// it takes.
async function loadBingo(req: Request, res: Response, next: NextFunction): Promise<void> {
  const [bingo] = await db.select().from(bingos).where(eq(bingos.slug, req.params.slug as string));
  if (!bingo) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }
  req.bingo = bingo;
  next();
}

router.use(requireAuth, requireAdmin, asyncHandler(loadBingo));

/** No audit entry per screenshot: attachScreenshot writes one when the last is attached. */
function skipAuditUnlessDone(req: Request, pending: number): void {
  if (pending > 0 && req.audit) req.audit.skip = "a historical screenshot attached; one entry is written when the last is";
}

// How many are pending and attached, and which keys are still to upload, so the script can resume.
router.get(
  "/screenshots",
  asyncHandler(async (req, res) => {
    res.json(historicalScreenshotService.getScreenshotStatus(db, req.bingo!));
  }),
);

router.post(
  "/screenshots/:key",
  // An unknown key is refused, and a key already attached answered, before the file is stored.
  asyncHandler(async (req, res, next) => {
    const key = req.params.key as string;
    if (historicalScreenshotService.screenshotKeyState(db, req.bingo!, key) === "attached") {
      skipAuditUnlessDone(req, 1);
      res.json({ attached: false, alreadyAttached: true, status: historicalScreenshotService.getScreenshotStatus(db, req.bingo!) });
      return;
    }
    next();
  }),
  upload.single("screenshot"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ServiceError(400, "A screenshot file is required (the form field is \"screenshot\")");
    const file = req.file;
    try {
      await sharp(file.path).metadata();
    } catch {
      fs.rmSync(file.path, { force: true });
      throw new ServiceError(415, "That file isn't an image that can be read");
    }
    let result;
    try {
      result = historicalScreenshotService.attachScreenshot(db, req.bingo!, req.params.key as string, `/uploads/${file.filename}`);
    } catch (err) {
      fs.rmSync(file.path, { force: true });
      throw err;
    }
    // Attached by a concurrent upload of the same key in the meantime: this copy isn't needed.
    if (!result.attached) fs.rmSync(file.path, { force: true });
    skipAuditUnlessDone(req, result.attached ? result.status.pending : 1);
    res.status(result.attached ? 201 : 200).json({ attached: result.attached, alreadyAttached: !result.attached, status: result.status });
  }),
);

export default router;
