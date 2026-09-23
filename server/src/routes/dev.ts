// Dev-only tooling for the test data generator. Mounted at /api/dev by index.ts only while dev mode is on
// (devMode.ts), and every route needs a site admin. See docs/generate-bingo-plan.md.
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { UPLOADS_DIR } from "../config";
import { bingos, users } from "../db/schema";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { auditSkip } from "../audit/middleware";
import { ServiceError } from "../services/errors";
import * as devTestDataService from "../services/devTestDataService";
import { mockPastCompetition } from "../services/pastWomCompetitionService";
import { OptionsError, normalizeOptions, type RawOptions } from "../devTools/generateBingo/options";
import { getGenerateJob, isGenerateJobRunning, jobView, startGenerateJob } from "../devTools/generateBingo/job";
import type { BoardSource } from "../devTools/generateBingo/run";
import type { BingoExportDocument } from "@bingo/shared";

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

// Starts a generator run inside the server (devTools/generateBingo/job.ts): the site admin's Test data tab, and the
// CLI. The board is another bingo's on this server (`from`, a slug) or a document sent along (`document`, the CLI's
// --export). Everything that can be checked now is, so the caller hears about a bad option at once rather than from a
// failed run. Not audited itself; what the run does is, as it happens.
router.post(
  "/generate",
  auditSkip("dev test data"),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as RawOptions & { from?: unknown; document?: unknown };
    let options;
    try {
      options = normalizeOptions(body);
    } catch (err) {
      if (err instanceof OptionsError) throw new ServiceError(400, err.message);
      throw err;
    }
    let board: BoardSource;
    if (typeof body.from === "string" && body.from) {
      if (!db.select({ id: bingos.id }).from(bingos).where(eq(bingos.slug, body.from)).get()) throw new ServiceError(400, `No bingo "${body.from}" to copy the board from`);
      board = { kind: "bingo", slug: body.from };
    } else if (body.document && typeof body.document === "object") {
      board = { kind: "document", document: body.document as BingoExportDocument };
    } else {
      throw new ServiceError(400, "Say which board to use: from (a bingo's slug) or document (an export)");
    }
    if (db.select({ id: bingos.id }).from(bingos).where(eq(bingos.slug, options.slug)).get()) throw new ServiceError(409, `There is already a bingo called ${options.slug}`);
    if (options.me && !db.select({ id: users.id }).from(users).where(eq(users.discordId, options.me)).get()) {
      throw new ServiceError(400, `No user with discordId ${options.me}: they need to have logged in to this server once`);
    }
    if (isGenerateJobRunning()) throw new ServiceError(409, "A test data run is already in progress");
    const job = startGenerateJob({ options, board, adminDiscordId: req.user!.discordId, startedBy: req.user!.discordUsername });
    res.status(202).json({ job });
  }),
);

// The current (or last) run, if any: `after` returns only the log lines after that one, for polling.
router.get(
  "/generate",
  asyncHandler(async (req, res) => {
    const job = getGenerateJob();
    const after = req.query.after !== undefined ? Number(req.query.after) : undefined;
    res.json({ job: job ? jobView(job, Number.isFinite(after) ? after : undefined) : null });
  }),
);

// Removes a generated bingo, its audit rows, its uploaded files and its now-unused test users. The bingo's own
// audit trail goes with it, so nothing is recorded.
router.delete(
  "/bingos/:slug",
  auditSkip("dev test data teardown"),
  asyncHandler(async (req, res) => {
    // Not while a run is building this one: it would go on writing into a bingo that's gone.
    if (isGenerateJobRunning() && getGenerateJob()?.slug === req.params.slug) throw new ServiceError(409, "This bingo is still being generated");
    const result = devTestDataService.teardownTestBingo(db, req.params.slug as string);
    const files = devTestDataService.removeUploads(UPLOADS_DIR, result.urls);
    console.info(`[dev] tore down ${req.params.slug}: ${result.usersDeleted} test users, ${files} files`);
    res.json({ deleted: { users: result.usersDeleted, files } });
  }),
);

export default router;
