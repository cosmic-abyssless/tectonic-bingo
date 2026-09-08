import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { requireBingoMod } from "../middleware/requireBingoMod";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as submissionService from "../services/submissionService";
import * as signupService from "../services/signupService";
import * as draftService from "../services/draftService";
import * as devSeedService from "../services/devSeedService";
import { getTectonicClient } from "../services/tectonicService";
import { approveSubmission, rejectSubmission } from "../services/scoringService";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBingo, requireBingoMod);

router.get(
  "/pending-count",
  asyncHandler(async (req, res) => {
    res.json({ count: submissionService.getPendingCount(db, req.bingo!.id) });
  }),
);

router.get(
  "/submissions",
  asyncHandler(async (req, res) => {
    res.json({ submissions: submissionService.getAllSubmissionsForBingo(db, req.bingo!.id) });
  }),
);

router.patch(
  "/submissions/:id",
  asyncHandler(async (req, res) => {
    const submissionId = req.params.id as string;
    const submission = submissionService.getSubmissionById(db, submissionId);
    if (!submission) throw new ServiceError(404, "Submission not found");

    const { action, reviewerNotes, pointsAwardedOverride, taskCompleted } = req.body as {
      action?: "approve" | "reject";
      reviewerNotes?: string;
      pointsAwardedOverride?: number;
      taskCompleted?: boolean; // required when the task's scoringMode is 'manual'
    };

    if (action === "approve") {
      const result = approveSubmission(db, {
        submissionId,
        reviewedByUserId: req.user!.id,
        reviewerNotes,
        pointsAwardedOverride,
        taskCompleted,
      });
      broadcast({
        type: "submission_reviewed",
        bingoId: req.bingo!.id,
        payload: { teamId: submission.teamId, taskIds: result.taskIds },
      });
      res.json(result);
      return;
    }

    if (action === "reject") {
      const result = rejectSubmission(db, { submissionId, reviewedByUserId: req.user!.id, reviewerNotes });
      broadcast({
        type: "submission_reviewed",
        bingoId: req.bingo!.id,
        payload: { teamId: submission.teamId, taskIds: result.taskIds },
      });
      res.json(result);
      return;
    }

    throw new ServiceError(400, 'action must be "approve" or "reject"');
  }),
);

router.post(
  "/stage",
  asyncHandler(async (req, res) => {
    const { toStage } = req.body as { toStage?: bingoService.Stage };
    if (!toStage || !bingoService.STAGE_ORDER.includes(toStage)) {
      throw new ServiceError(400, "toStage must be a valid stage");
    }
    const bingo = bingoService.advanceStage(db, { bingoId: req.bingo!.id, toStage, changedByUserId: req.user!.id });
    broadcast({ type: "stage_changed", bingoId: bingo.id, payload: { stage: bingo.stage } });
    res.json({ bingo });
  }),
);

router.post(
  "/draft/start",
  asyncHandler(async (req, res) => {
    const teams = draftService.startDraft(db, req.bingo!);
    broadcast({ type: "draft_started", bingoId: req.bingo!.id, payload: {} });
    res.json({ teams });
  }),
);

router.get(
  "/signups",
  asyncHandler(async (req, res) => {
    res.json({ signups: signupService.getAllSignups(db, req.bingo!.id) });
  }),
);

router.patch(
  "/signups/:id/buyin",
  asyncHandler(async (req, res) => {
    const { received, collectedByUserId } = req.body as { received?: boolean; collectedByUserId?: string | null };
    if (typeof received !== "boolean") throw new ServiceError(400, "received must be a boolean");
    const signup = signupService.markBuyin(db, req.bingo!, req.params.id as string, {
      received,
      collectedByUserId,
      recordedByUserId: req.user!.id,
    });
    res.json({ signup });
  }),
);

// Dev-only test data helper — route only exists at all when explicitly
// enabled, same gate as /auth/dev-login, so it's not reachable in production
// even by a mod who knows the URL.
if (process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true") {
  router.post(
    "/dev/seed-signups",
    asyncHandler(async (req, res) => {
      const { count } = req.body as { count?: number };
      const n = Math.min(Math.max(Math.trunc(count ?? 8), 1), 50);
      const tectonic = getTectonicClient();
      const roster = (await tectonic?.getRoster(1000)) ?? [];
      // devSeedService fabricates WOM/RuneProfile stats locally (no network
      // calls) for every seeded signup — up to 50 real API round trips per
      // click would be slow and pointless rate-limit exposure for
      // throwaway test data. Real signups still fetch real data.
      const result = devSeedService.seedTestSignups(db, req.bingo!, n, roster);
      res.status(201).json({ ...result, tectonicConfigured: tectonic !== null });
    }),
  );

  router.delete(
    "/dev/signups",
    asyncHandler(async (req, res) => {
      if (req.bingo!.stage !== "signup") throw new ServiceError(400, "Signups can only be wiped during the signup stage");
      res.json({ deleted: devSeedService.deleteAllSignups(db, req.bingo!.id) });
    }),
  );
}

export default router;
