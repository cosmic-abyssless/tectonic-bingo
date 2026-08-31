import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { requireBingoMod } from "../middleware/requireBingoMod";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as submissionService from "../services/submissionService";
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

    const { action, reviewerNotes, pointsAwardedOverride } = req.body as {
      action?: "approve" | "reject";
      reviewerNotes?: string;
      pointsAwardedOverride?: number;
    };

    if (action === "approve") {
      const result = approveSubmission(db, {
        submissionId,
        reviewedByUserId: req.user!.id,
        reviewerNotes,
        pointsAwardedOverride,
      });
      broadcast({
        type: "submission_reviewed",
        bingoId: req.bingo!.id,
        payload: { teamId: submission.teamId, taskId: submission.taskId },
      });
      res.json(result);
      return;
    }

    if (action === "reject") {
      const result = rejectSubmission(db, { submissionId, reviewedByUserId: req.user!.id, reviewerNotes });
      broadcast({
        type: "submission_reviewed",
        bingoId: req.bingo!.id,
        payload: { teamId: submission.teamId, taskId: submission.taskId },
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

export default router;
