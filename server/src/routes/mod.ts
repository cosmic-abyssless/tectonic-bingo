import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { requireBingoMod } from "../middleware/requireBingoMod";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as schema from "../db/schema";
import * as bingoService from "../services/bingoService";
import * as historicalService from "../services/historicalService";
import * as submissionService from "../services/submissionService";
import { changeSubmissionAttribution } from "../services/submissionTarget";
import * as signupService from "../services/signupService";
import * as restrictionService from "../services/restrictionService";
import * as draftService from "../services/draftService";
import { fetchProfiles } from "../services/tectonicProfileService";
import { applyRosterNames } from "../services/pairingNames";
import * as pairingService from "../services/pairingService";
import * as teamService from "../services/teamService";
import * as cutReviewService from "../services/cutReviewService";
import { syncWomCompetition, syncWomCompetitionAfterDraft } from "../services/womCompetitionService";
import { syncDiscordTeams } from "../services/discordTeamService";
import { getWomReadQueue, queueBingoReads } from "../services/womReadService";
import { archiveBingoCompetition } from "../services/pastWomCompetitionService";
import { getTectonicClient, TectonicUnavailableError } from "../services/tectonicService";
import { fetchAndPersistPlayerStats } from "../services/playerStatsService";
import { syncSignupRsn } from "../services/rsnSyncService";
import { approveSubmission, rejectSubmission, undoSubmissionReview } from "../services/scoringService";
import { assertUserCan, bingoRoles } from "../services/permissions";
import { ServiceError } from "../services/errors";
import { broadcastChange } from "../broadcastChange";
import { markAuditedNoop } from "../audit/record";
import { queryAuditLog } from "../audit/query";
import type { AuditAction, AuditCategory, AuditEntityType, AuditLogFilters, AuditVisibility } from "@bingo/shared";
import { repriceSubmission } from "../services/gpRepriceService";
import * as wrappedService from "../services/wrappedService";
import * as superlativeService from "../services/superlativeService";
import * as feedbackService from "../services/feedbackService";
import { noStore } from "../middleware/cacheControl";

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBingo, requireBingoMod);

// The Feedback results (CONTEXT.md "Feedback form"): how many responded, each response and the totals. Never who gave a
// response: nothing stored says (docs/adr/0002-anonymous-feedback.md).
router.get(
  "/feedback",
  noStore,
  asyncHandler(async (req, res) => {
    assertUserCan(db, req.bingo!, req.user!, "view_feedback_results", { role: new ServiceError(403, "Moderator access required for this bingo") });
    res.json(feedbackService.getFeedbackResults(db, req.bingo!));
  }),
);

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

    if (action === "approve" || action === "reject") {
      const result =
        action === "approve"
          ? approveSubmission(db, { submissionId, reviewedByUserId: req.user!.id, reviewerNotes })
          : rejectSubmission(db, { submissionId, reviewedByUserId: req.user!.id, reviewerNotes });
      broadcastChange({
        type: "submission_reviewed",
        bingoId: req.bingo!.id,
        payload: { teamId: submission.teamId, nodeIds: result.nodeIds },
      });
      // A Finished Bingo set to publish Wrapped on its own does so once the last pending Submission is reviewed.
      if (wrappedService.publishWhenReady(db, req.bingo!, req.user!.id)) broadcastChange({ type: "wrapped_published", bingoId: req.bingo!.id, payload: {} });
      res.json(result);
      return;
    }

    if (action === "undo") {
      const result = undoSubmissionReview(db, { submissionId, undoneByUserId: req.user!.id });
      broadcastChange({
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

// Changes which player a submission is credited to (someone forgot to pick the player they posted for).
router.patch(
  "/submissions/:id/attribution",
  asyncHandler(async (req, res) => {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new ServiceError(400, "userId is required");
    const submission = changeSubmissionAttribution(db, req.bingo!, { submissionId: req.params.id as string, userId, changedByUserId: req.user!.id });
    // The same refresh a review triggers: drawers, the mod queue and the board all show who it is credited to.
    broadcastChange({ type: "submission_reviewed", bingoId: req.bingo!.id, payload: { teamId: submission.teamId, nodeIds: [] } });
    res.json({ submission });
  }),
);

// Wrapped (CONTEXT.md): publish a Finished Bingo's, or publish it again with the latest numbers. Either way every
// Player's is computed now and stored; readers only ever read what's stored.
router.get(
  "/wrapped",
  asyncHandler(async (req, res) => {
    res.json(wrappedService.getWrappedState(db, req.bingo!));
  }),
);

router.post(
  "/wrapped/publish",
  asyncHandler(async (req, res) => {
    const state = wrappedService.publishWrapped(db, req.bingo!, req.user!.id);
    broadcastChange({ type: "wrapped_published", bingoId: req.bingo!.id, payload: {} });
    res.json(state);
  }),
);

// Superlative (CONTEXT.md) vote counts per category per Team: an Admin's call only, and only once voting has
// closed (the bingo is Finished) — nobody, Moderators included, sees a tally while it's still Live.
router.get(
  "/superlatives/tally",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ teams: superlativeService.getTallies(db, req.bingo!) });
  }),
);

// Superlative turnout: how many of each Team's Players have voted, as counts only (never who, or for whom), so it's
// readable at any stage. Admin-only, like the rest of the Superlatives tab.
router.get(
  "/superlatives/turnout",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ teams: superlativeService.getTurnout(db, req.bingo!) });
  }),
);

// Prices a submission's claims again, when they were priced from the wrong thing (CONTEXT.md "Drop value").
router.post(
  "/submissions/:id/reprice",
  asyncHandler(async (req, res) => {
    const claims = await repriceSubmission(db, req.bingo!.id, req.params.id as string);
    res.json({ claims });
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
    broadcastChange({ type: "team_updated", bingoId: req.bingo!.id, payload: { teamId: adjustment.teamId } });
    res.status(201).json({ adjustment });
  }),
);

// Moving a bingo between stages is for site admins only: a per-bingo mod reviews and manages, but doesn't run the event's timeline.
router.post(
  "/stage",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { toStage } = req.body as { toStage?: bingoService.Stage };
    if (!toStage || !bingoService.STAGE_ORDER.includes(toStage)) {
      throw new ServiceError(400, "toStage must be a valid stage");
    }
    const fromStage = req.bingo!.stage;
    const bingo = bingoService.advanceStage(db, { bingoId: req.bingo!.id, toStage, changedByUserId: req.user!.id });
    broadcastChange({ type: "stage_changed", bingoId: bingo.id, payload: { stage: bingo.stage } });
    // Fire-and-forget: a WOM outage or bad credentials must never block the
    // stage change itself. syncWomCompetitionAfterDraft no-ops when the
    // integration isn't configured.
    if (fromStage === "draft") void syncWomCompetitionAfterDraft(db, bingo.id);
    // With no start date set, the bingo starts when it goes live: the competition's start moves to match.
    if (toStage === "live") void syncWomCompetition(db, bingo.id);
    // Discord roles and channels are made as the draft finishes, alongside the WOM competition; later stage changes
    // (back to the Draft too, which undoes Teams) keep them in step.
    void syncDiscordTeams(db, bingo.id);
    // Same fire-and-forget convention: snapshot the bingo's WOM competition
    // once it's actually over, so its per-player gains survive independently
    // of WOM's own record. No-ops when the bingo has no linked competition.
    if (toStage === "complete") void archiveBingoCompetition(db, bingo.id);
    // Wise Old Man snapshots for Titles: a first read (with the baseline) as it goes live, and the final one as it ends.
    if (toStage === "live" || toStage === "complete") queueBingoReads(db, getWomReadQueue(db), bingo.id);
    // "Publish Wrapped when the Bingo finishes" (CONTEXT.md "Wrapped"); late Wise Old Man reads (queued above) need a
    // Re-publish.
    if (toStage === "complete" && wrappedService.publishWhenReady(db, bingo, req.user!.id)) broadcastChange({ type: "wrapped_published", bingoId: bingo.id, payload: {} });
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
    broadcastChange({ type: "draft_order_shuffled", bingoId: req.bingo!.id, payload: { lockedUntil: lockedUntil.toISOString(), order } });
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
    broadcastChange({ type: "draft_order_set", bingoId: req.bingo!.id, payload: { order } });
    res.json({ teams });
  }),
);

router.post(
  "/draft/start",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const teams = draftService.startDraft(db, req.bingo!);
    broadcastChange({ type: "draft_started", bingoId: req.bingo!.id, payload: {} });
    res.json({ teams });
  }),
);

router.get(
  "/signups",
  asyncHandler(async (req, res) => {
    historicalService.assertRecorded(db, req.bingo!, "signupRoster");
    const cut = draftService.getCutUserIds(db, req.bingo!);
    const roster = signupService.getAllSignups(db, req.bingo!.id, signupService.answerViewerFor(bingoRoles(db, req.bingo!, req.user!), req.bingo!));
    const [tectonic] = await Promise.all([
      fetchProfiles(db, roster.map((entry) => entry.user.id)),
      applyRosterNames(roster.flatMap((entry) => (entry.outgoingPairingRequest ? [entry.outgoingPairingRequest.target] : []))),
    ]);
    const restrictions = restrictionService.getRestrictions(db, req.bingo!.id);
    const restrictable = restrictionService.restrictableUserIds(db, req.bingo!, req.user!, roster.map((entry) => entry.user.id));
    const signups = roster.map((entry) => ({
      ...entry,
      cut: cut.has(entry.user.id),
      tectonicProfile: tectonic.profiles[entry.user.id] ?? null,
      restrictions: restrictions.filter((r) => r.userId === entry.user.id),
      restrictable: restrictable.has(entry.user.id),
    }));
    res.json({ signups });
  }),
);

// Who's cut as things stand, and what every team drafts: shown before moving into the draft stage.
router.get(
  "/draft/cuts",
  asyncHandler(async (req, res) => {
    res.json(draftService.getCutPreview(db, req.bingo!));
  }),
);

// The Cut review's proposed plan plus the Avoidable/Unavoidable split it implies (CONTEXT.md "Cut review"): the
// Signups tab notice and the move-to-Draft confirmation. Visible to any mod; only Admins get to act on it (the
// score/apply endpoints, under /admin).
router.get(
  "/draft/cut-review",
  asyncHandler(async (req, res) => {
    res.json(cutReviewService.getCutReviewPreview(db, req.bingo!));
  }),
);

// Who can be recorded as having collected a buy-in: the bingo's Moderators and its Staff (CONTEXT.md "Staff"). Mods
// only need names, so this mirrors the admin-only GET /mods and /staff without opening up user management.
router.get(
  "/moderators",
  asyncHandler(async (req, res) => {
    res.json({ mods: [...bingoService.getModerators(db, req.bingo!.id), ...bingoService.getStaff(db, req.bingo!.id)] });
  }),
);

router.get(
  "/audit-log",
  asyncHandler(async (req, res) => {
    historicalService.assertRecorded(db, req.bingo!, null);
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
    const page = { cursor: q.cursor ? Number(q.cursor) : undefined, limit: q.limit ? Number(q.limit) : undefined, condensed: q.condensed === "1" || q.condensed === "true" };
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
    broadcastChange({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(201).json({ pairing });
  }),
);

router.delete(
  "/pairings/:id",
  asyncHandler(async (req, res) => {
    pairingService.unpair(db, req.bingo!, req.params.id as string);
    broadcastChange({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(204).end();
  }),
);

router.post(
  "/signups/:signupId/refresh-stats",
  asyncHandler(async (req, res) => {
    const signupId = req.params.signupId as string;
    const row = db
      .select({ id: schema.signups.id, rsn: schema.signups.rsn, bingoId: schema.signups.bingoId, userId: schema.signups.userId })
      .from(schema.signups)
      .where(eq(schema.signups.id, signupId))
      .get();
    if (!row || row.bingoId !== req.bingo!.id) throw new ServiceError(404, "Signup not found");
    markAuditedNoop();
    // First catch an in-game rename: the signup's WOM id tells tectonic-api which name the account goes by now
    // (rsnSyncService). Awaited, so the stats below are fetched under the current name. Never fails the refresh.
    const { rsn } = await syncSignupRsn(db, row.id);
    // Tell clients to spin before the fire-and-forget fetch starts, so the
    // button doesn't sit idle between 204 and the first lookup. Skip when
    // the E2E hook disables the fetch — otherwise the spinner would stick.
    if (process.env.PLAYER_STATS_FETCH_DISABLED !== "true") {
      broadcastChange({ type: "signup_changed", bingoId: req.bingo!.id, payload: { signupId: row.id, userId: row.userId, statsRefreshing: true } });
    }
    void fetchAndPersistPlayerStats(db, row.id, rsn);
    res.status(204).end();
  }),
);

router.patch(
  "/signups/:id/buyin",
  asyncHandler(async (req, res) => {
    const { received, collectedByUserId } = req.body as { received?: boolean; collectedByUserId?: string | null };
    if (typeof received !== "boolean") throw new ServiceError(400, "received must be a boolean");
    assertUserCan(db, req.bingo!, req.user!, "mark_buyins", { role: new ServiceError(403, "Moderator access required for this bingo") });
    const signup = signupService.markBuyin(db, req.bingo!, req.params.id as string, {
      received,
      collectedByUserId,
      recordedByUserId: req.user!.id,
    });
    broadcastChange({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.json({ signup });
  }),
);

// Set (or, with null, clear) a player's timezone from the roster — see signupService.setSignupTimezone.
router.patch(
  "/signups/:id/timezone",
  asyncHandler(async (req, res) => {
    const { timezone } = req.body as { timezone?: string | null };
    if (timezone !== null && typeof timezone !== "string") throw new ServiceError(400, "timezone must be a string or null");
    const signup = signupService.setSignupTimezone(db, req.bingo!, req.params.id as string, timezone, req.user!.id);
    broadcastChange({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.json({ signup });
  }),
);

// Withdraw on a player's behalf (no-shows, duplicate accounts, ...). Soft
// delete like self-withdrawal so the player can sign up again later.
router.delete(
  "/signups/:id",
  asyncHandler(async (req, res) => {
    const signup = signupService.withdrawSignup(db, req.bingo!, req.params.id as string, { byMod: true });
    broadcastChange({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.json({ signup });
  }),
);

// Restrictions (CONTEXT.md "Restriction"): an Admin restricts anyone but an Admin, a Moderator only Captains and
// Players (restrictionService). The restricted user's client refetches its Actions (access_changed), the mods' their
// roster (restrictions_changed).
function restrictionsChanged(bingoId: string, userId: string): void {
  broadcastChange({ type: "access_changed", bingoId, payload: { userIds: [userId] } });
  broadcastChange({ type: "restrictions_changed", bingoId, payload: {} });
}

router.post(
  "/restrictions",
  asyncHandler(async (req, res) => {
    const { userId, action, reason } = req.body as { userId?: unknown; action?: unknown; reason?: unknown };
    if (typeof userId !== "string" || !userId) throw new ServiceError(400, "userId is required");
    const restriction = restrictionService.applyRestriction(db, req.bingo!, req.user!, { userId, action, reason });
    restrictionsChanged(req.bingo!.id, userId);
    res.status(201).json({ restriction });
  }),
);

router.delete(
  "/restrictions/:id",
  asyncHandler(async (req, res) => {
    const { userId } = restrictionService.liftRestriction(db, req.bingo!, req.user!, req.params.id as string);
    restrictionsChanged(req.bingo!.id, userId);
    res.status(204).end();
  }),
);

export default router;
