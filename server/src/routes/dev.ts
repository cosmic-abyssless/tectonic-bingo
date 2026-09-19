// Dev-only tooling for the test data generator. Mounted at /api/dev by index.ts only while dev mode is on
// (devMode.ts), and every route needs a site admin. See docs/test-data-generator-plan.md.
import { Router } from "express";
import { db } from "../db";
import { UPLOADS_DIR } from "../config";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { auditSkip } from "../audit/middleware";
import * as devTestDataService from "../services/devTestDataService";

const router = Router();
router.use(requireAuth, requireAdmin);

// A throwaway "testdata-" user for the generator to sign up. Not audited: like the signup seed tool, it makes
// site-level accounts that belong to no bingo.
router.post(
  "/users",
  auditSkip("dev test data"),
  asyncHandler(async (req, res) => {
    const user = devTestDataService.createTestUser(db, req.body as devTestDataService.CreateTestUserParams);
    res.status(201).json({ user });
  }),
);

router.get(
  "/bingos",
  asyncHandler(async (_req, res) => {
    res.json({ bingos: devTestDataService.listTestDataBingos(db) });
  }),
);

// Removes a generated bingo, its audit rows, its uploaded files and its now-unused test users. The bingo's own
// audit trail goes with it, so nothing is recorded.
router.delete(
  "/bingos/:slug",
  auditSkip("dev test data teardown"),
  asyncHandler(async (req, res) => {
    const result = devTestDataService.teardownTestBingo(db, req.params.slug as string);
    const files = devTestDataService.removeUploads(UPLOADS_DIR, result.urls);
    console.info(`[dev] tore down ${req.params.slug}: ${result.usersDeleted} test users, ${files} files`);
    res.json({ deleted: { users: result.usersDeleted, files } });
  }),
);

export default router;
