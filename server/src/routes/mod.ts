import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { requireBingoMod } from "../middleware/requireBingoMod";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as submissionService from "../services/submissionService";
import * as signupService from "../services/signupService";
import * as draftService from "../services/draftService";
import { fetchProfiles } from "../services/tectonicProfileService";
import * as pairingService from "../services/pairingService";
import * as devSeedService from "../services/devSeedService";
import * as teamService from "../services/teamService";
import { syncWomCompetitionAfterDraft } from "../services/womCompetitionService";
import { getTectonicClient, TectonicUnavailableError } from "../services/tectonicService";
import { approveSubmission, rejectSubmission, undoSubmissionReview } from "../services/scoringService";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";
import { queryAuditLog } from "../audit/query";
import type { AuditAction, AuditCategory, AuditEntityType, AuditLogFilters, AuditVisibility } from "@bingo/shared";

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

    const { action, reviewerNotes } = req.body as { action?: "approve" | "reject" | "undo"; reviewerNotes?: string };

    if (action === "approve") {
      const result = approveSubmission(db, { submissionId, reviewedByUserId: req.user!.id, reviewerNotes });
      broadcast({
        type: "submission_reviewed",
        bingoId: req.bingo!.id,
        payload: { teamId: submission.teamId, nodeIds: result.nodeIds },
      });
      res.json(result);
      return;
    }

    if (action === "reject") {
      const result = rejectSubmission(db, { submissionId, reviewedByUserId: req.user!.id, reviewerNotes });
      broadcast({
        type: "submission_reviewed",
        bingoId: req.bingo!.id,
        payload: { teamId: submission.teamId, nodeIds: result.nodeIds },
      });
      res.json(result);
      return;
    }

    if (action === "undo") {
      const result = undoSubmissionReview(db, { submissionId, undoneByUserId: req.user!.id });
      broadcast({
        type: "submission_reviewed",
        bingoId: req.bingo!.id,
        payload: { teamId: submission.teamId, nodeIds: result.nodeIds },
      });
      res.json(result);
      return;
    }

    throw new ServiceError(400, 'action must be "approve", "reject" or "undo"');
  }),
);

router.post(
  "/teams/:teamId/adjustments",
  asyncHandler(async (req, res) => {
    const { amount, reason } = req.body as { amount?: number; reason?: string };
    if (typeof amount !== "number" || !amount) throw new ServiceError(400, "amount must be a non-zero number");
    if (!reason) throw new ServiceError(400, "reason is required");
    const adjustment = teamService.createPointAdjustment(db, {
      teamId: req.params.teamId as string,
      bingoId: req.bingo!.id,
      amount,
      reason,
      createdByUserId: req.user!.id,
    });
    broadcast({ type: "team_updated", bingoId: req.bingo!.id, payload: { teamId: adjustment.teamId } });
    res.status(201).json({ adjustment });
  }),
);

router.post(
  "/stage",
  asyncHandler(async (req, res) => {
    const { toStage } = req.body as { toStage?: bingoService.Stage };
    if (!toStage || !bingoService.STAGE_ORDER.includes(toStage)) {
      throw new ServiceError(400, "toStage must be a valid stage");
    }
    const fromStage = req.bingo!.stage;
    const bingo = bingoService.advanceStage(db, { bingoId: req.bingo!.id, toStage, changedByUserId: req.user!.id });
    broadcast({ type: "stage_changed", bingoId: bingo.id, payload: { stage: bingo.stage } });
    // Fire-and-forget: a WOM outage or bad credentials must never block the
    // stage change itself. syncWomCompetitionAfterDraft no-ops when the
    // integration isn't configured.
    if (fromStage === "draft") void syncWomCompetitionAfterDraft(db, bingo.id);
    res.json({ bingo: bingoService.toPublicBingo(bingo) });
  }),
);

router.post(
  "/draft/shuffle",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { teams, lockedUntil } = draftService.shuffleDraftOrder(db, req.bingo!);
    const order = teams
      .filter((t) => t.draftOrder != null)
      .sort((a, b) => (a.draftOrder ?? 0) - (b.draftOrder ?? 0))
      .map((t) => ({ teamId: t.id, draftOrder: t.draftOrder! }));
    broadcast({ type: "draft_order_shuffled", bingoId: req.bingo!.id, payload: { lockedUntil: lockedUntil.toISOString(), order } });
    res.json({ teams, lockedUntil: lockedUntil.toISOString() });
  }),
);

router.put(
  "/draft/order",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { teamIds } = req.body as { teamIds?: string[] };
    if (!Array.isArray(teamIds)) throw new ServiceError(400, "teamIds is required");
    const teams = draftService.setDraftOrder(db, req.bingo!, teamIds);
    const order = teams
      .filter((t) => t.draftOrder != null)
      .sort((a, b) => (a.draftOrder ?? 0) - (b.draftOrder ?? 0))
      .map((t) => ({ teamId: t.id, draftOrder: t.draftOrder! }));
    broadcast({ type: "draft_order_set", bingoId: req.bingo!.id, payload: { order } });
    res.json({ teams });
  }),
);

router.post(
  "/draft/start",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const teams = draftService.startDraft(db, req.bingo!);
    broadcast({ type: "draft_started", bingoId: req.bingo!.id, payload: {} });
    res.json({ teams });
  }),
);

router.get(
  "/signups",
  asyncHandler(async (req, res) => {
    const leftovers = draftService.getLeftoverUserIds(db, req.bingo!);
    const roster = signupService.getAllSignups(db, req.bingo!.id);
    const tectonic = await fetchProfiles(db, roster.map((entry) => entry.user.id));
    const signups = roster.map((entry) => ({
      ...entry,
      leftover: leftovers.has(entry.user.id),
      tectonicProfile: tectonic.profiles[entry.user.id] ?? null,
    }));
    res.json({ signups });
  }),
);

// Who can be recorded as having collected a buy-in. Mods only need names, so
// this mirrors the admin-only GET /mods without opening up user management.
router.get(
  "/moderators",
  asyncHandler(async (req, res) => {
    res.json({ mods: bingoService.getModerators(db, req.bingo!.id) });
  }),
);

router.get(
  "/audit-log",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filters: AuditLogFilters = {
      action: q.action ? (q.action.split(",") as AuditAction[]) : undefined,
      category: q.category ? (q.category.split(",") as AuditCategory[]) : undefined,
      actorUserId: q.actorUserId ? q.actorUserId.split(",") : undefined,
      teamId: q.teamId ? q.teamId.split(",") : undefined,
      entityType: q.entityType as AuditEntityType | undefined,
      entityId: q.entityId,
      visibility: q.visibility as AuditVisibility | undefined,
      since: q.since,
      until: q.until,
      q: q.q,
    };
    const page = { cursor: q.cursor ? Number(q.cursor) : undefined, limit: q.limit ? Number(q.limit) : undefined };
    res.json(queryAuditLog(db, { bingoId: req.bingo!.id }, filters, page));
  }),
);

// Duo mode: mods pair two unpaired signups by hand, or split a pair.
router.post(
  "/pairings",
  asyncHandler(async (req, res) => {
    const { userIdA, userIdB } = req.body as { userIdA?: string; userIdB?: string };
    if (!userIdA || !userIdB) throw new ServiceError(400, "userIdA and userIdB are required");
    const pairing = pairingService.adminPair(db, req.bingo!, { userIdA, userIdB, createdByUserId: req.user!.id });
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(201).json({ pairing });
  }),
);

router.delete(
  "/pairings/:id",
  asyncHandler(async (req, res) => {
    pairingService.unpair(db, req.bingo!, req.params.id as string);
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(204).end();
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
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.json({ signup });
  }),
);

// Withdraw on a player's behalf (no-shows, duplicate accounts, ...). Soft
// delete like self-withdrawal so the player can sign up again later.
router.delete(
  "/signups/:id",
  asyncHandler(async (req, res) => {
    const signup = signupService.withdrawSignup(db, req.bingo!, req.params.id as string, { byMod: true });
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
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
      // Throwaway test data: an unreachable tectonic-api just means seeded
      // signups aren't drawn from the real roster.
      const roster = tectonic
        ? await tectonic.getRoster(1000).catch((err: unknown) => {
            if (err instanceof TectonicUnavailableError) return [];
            throw err;
          })
        : [];
      // devSeedService fabricates WOM/RuneProfile stats locally (no network
      // calls) for every seeded signup — up to 50 real API round trips per
      // click would be slow and pointless rate-limit exposure for
      // throwaway test data. Real signups still fetch real data.
      const result = devSeedService.seedTestSignups(db, req.bingo!, n, roster);
      broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
      res.status(201).json({ ...result, tectonicConfigured: tectonic !== null });
    }),
  );

  router.delete(
    "/dev/signups",
    asyncHandler(async (req, res) => {
      if (req.bingo!.stage !== "signup") throw new ServiceError(400, "Signups can only be wiped during the signup stage");
      const deleted = devSeedService.deleteAllSignups(db, req.bingo!.id);
      broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
      res.json({ deleted });
    }),
  );
}

export default router;
