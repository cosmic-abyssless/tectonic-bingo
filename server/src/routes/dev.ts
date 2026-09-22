// Dev-only tooling for the test data generator. Mounted at /api/dev by index.ts only while dev mode is on
// (devMode.ts), and every route needs a site admin. See docs/generate-bingo-plan.md.
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { UPLOADS_DIR } from "../config";
import { bingos } from "../db/schema";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { auditSkip } from "../audit/middleware";
import { ServiceError } from "../services/errors";
import * as devTestDataService from "../services/devTestDataService";
import { mockPastCompetition } from "../services/pastWomCompetitionService";

const router = Router();
router.use(requireAuth, requireAdmin);

// A throwaway "testdata-" user for the generator to sign up. Not audited: it makes site-level accounts that
// belong to no bingo.
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

// Fills a generated bingo's signups with made-up player stats. Not audited: test data, like the users above.
router.post(
  "/bingos/:slug/fake-stats",
  auditSkip("dev test data"),
  asyncHandler(async (req, res) => {
    res.json(devTestDataService.fillFakeStats(db, req.params.slug as string));
  }),
);

// Fakes a WOM competition for a bingo's current signups (issue #133). Not
// fenced to "testdata-" bingos like the routes above — see
// pastWomCompetitionService.mockPastCompetition for why. Not audited: test
// data, like the fake-stats route above.
router.post(
  "/bingos/:slug/mock-wom-competition",
  auditSkip("dev test data"),
  asyncHandler(async (req, res) => {
    const bingo = db.select({ id: bingos.id }).from(bingos).where(eq(bingos.slug, req.params.slug as string)).get();
    if (!bingo) throw new ServiceError(404, "Bingo not found");
    const { title, metric, gainedMin, gainedMax } = req.body as { title?: string; metric?: string; gainedMin?: number; gainedMax?: number };
    const competition = mockPastCompetition(db, bingo.id, { title, metric, gainedMin, gainedMax });
    res.status(201).json({ competition });
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
