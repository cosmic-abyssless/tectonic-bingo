import { devSkipsOcr } from "../devMode";
import { noStore, privateRevalidate } from "../middleware/cacheControl";
import { Router, type Request } from "express";
import fs from "fs";
import type { AccountTypesResponse, Action, AuditLogResponse, BingoPermissionsResponse, ClaimInput, FeedbackSubmission, PlayerProfile } from "@bingo/shared";
import { can, isAchievementKey, passesRules, resolvePermissions } from "@bingo/shared";
import { now as clockNow } from "../clock";
import * as achievementService from "../services/achievementService";
import { UPLOADS_DIR } from "../config";
import { imageUpload } from "../middleware/upload";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { requireBingoViewer } from "../middleware/requireBingoViewer";
import { getBingoAccess, isPartOfBingo } from "../services/bingoAccess";
import { assertCan, assertUserCan, bingoRoles, restrictionsOf, unavailable } from "../services/permissions";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import { effectiveStartsAt } from "../services/bingoStart";
import * as boardService from "../services/boardService";
import * as teamService from "../services/teamService";
import * as submissionService from "../services/submissionService";
import { resolveSubmissionTarget, resolveSubmissionTeam } from "../services/submissionTarget";
import * as signupService from "../services/signupService";
import * as draftService from "../services/draftService";
import * as pairingService from "../services/pairingService";
import * as memberPickService from "../services/memberPickService";
import * as userService from "../services/userService";
import * as statsService from "../services/statsService";
import * as rewindService from "../services/rewindService";
import * as wrappedService from "../services/wrappedService";
import * as superlativeService from "../services/superlativeService";
import * as feedbackService from "../services/feedbackService";
import * as historicalService from "../services/historicalService";
import * as restrictionService from "../services/restrictionService";
import { isOcrEnabled, analyzeSubmissionScreenshot } from "../ocr";
import { getTectonicClient, TectonicUnavailableError } from "../services/tectonicService";
import { getTectonicMembership, matchRsn } from "../services/tectonicMembership";
import { fetchProfiles } from "../services/tectonicProfileService";
import { applyRosterNames, partiesInPairingState } from "../services/pairingNames";
import { fetchAndPersistPlayerStats, getAccountTypes, getSignupStats, parseStoredPlayerStats } from "../services/playerStatsService";
import { parseStoredCaStats } from "../services/combatAchievements";
import { syncWomCompetition } from "../services/womCompetitionService";
import { getPastParticipationsForUser } from "../services/pastWomCompetitionService";
import { ServiceError } from "../services/errors";
import { refreshPricesAndFill } from "../services/gpValueService";
import { broadcast } from "../ws";
import { anonymous, auditSkip } from "../audit/middleware";
import { queryTeamActivity } from "../audit/query";

const upload = imageUpload(UPLOADS_DIR, { variants: true });
// Separate instance for analysis — memory only, nothing saved to disk.
const analyzeUpload = imageUpload();

const router = Router();

/** Whether the viewer requireBingoViewer let through may take `action` in this bingo. */
function viewerCan(req: Request, action: Action): boolean {
  return can(req.bingoAccess!.roles, req.bingo!, action).ok;
}

// Every route here needs a login: the shell carries each team's roster (players' Discord accounts and RSNs), so
// nothing about a bingo is served to an anonymous request (see requireLogin.test.ts).
//
// Past the login, a bingo's content is for the people who can see it (CONTEXT.md "Player"; services/bingoAccess.ts):
// its Players, Moderators and Admins, and every clan member once it's Finished. A Planning bingo 404s for anyone else
// (requireBingo). Everyone else gets the shell's landing data (name, stage, dates, buy-in: the signup form while
// signups are open, a "not part of this bingo" notice after), and every content route below carries
// requireBingoViewer (see bingoAccess.test.ts).
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ bingos: bingoService.listBingos(db, req.user!) });
  }),
);

router.get(
  "/:slug",
  requireAuth,
  requireBingo,
  privateRevalidate,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const { isMod, roles, ...viewer } = getBingoAccess(db, bingo, req.user!);
    const paidSignupCount = signupService.getPaidSignupCount(db, bingo.id);
    const viewerBingo = bingoService.toViewerBingo(bingo, can(roles, bingo, "view_hidden_board").ok);
    res.json({
      // effectiveStartsAt: when the bingo counts as started (see bingoStart.ts) — the settings' start date, or else
      // when it was last put live. The client runs tile freezes and "has it started" from this, not from startsAt.
      // Someone who can't see the bingo gets no rules or exclusive items (they describe the board), no board
      // categories and no rosters.
      bingo: { ...viewerBingo, ...(viewer.canSee ? {} : { rulesMarkdown: null, exclusivityRules: [] }), effectiveStartsAt: effectiveStartsAt(db, bingo) },
      categories: viewer.canSee ? boardService.getCategories(db, bingo.id) : [],
      teams: viewer.canSee ? teamService.getTeamsWithMembers(db, bingo.id) : [],
      isMod,
      myTeam: viewer.canSee ? teamService.getUserTeamForBingo(db, bingo.id, req.user!.id) : null,
      paidSignupCount,
      potTotal: bingoService.calculatePotTotal(bingo, paidSignupCount),
      hasSignups: signupService.hasAnySignup(db, bingo.id),
      viewer,
      wrappedPublished: bingo.stage === "complete" && wrappedService.isPublished(db, bingo.id),
      historical: historicalService.recordedFor(db, bingo),
    });
  }),
);

// The viewer's Actions in this bingo at its current stage, and why not for the ones a role of theirs grants but that
// are closed right now or taken by one of their Restrictions (BingoPermissionsResponse): what the client shows and
// hides by. Asked by everyone who gets the shell, whether or not they can see the bingo's content, and again whenever
// their roles, their Restrictions or the stage change (access_changed, stage_changed).
router.get(
  "/:slug/permissions",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    res.json(resolvePermissions(bingoRoles(db, bingo, req.user!), bingo, restrictionsOf(db, bingo.id, req.user!.id)) satisfies BingoPermissionsResponse);
  }),
);

// A Historical Bingo's (CONTEXT.md) standings, Wise Old Man leaderboard and what it recorded: what it shows besides
// its board. 404 for any other Bingo.
router.get(
  "/:slug/historical",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    res.json(historicalService.getHistoricalBingo(db, req.bingo!));
  }),
);

router.get(
  "/:slug/board",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  privateRevalidate,
  asyncHandler(async (req, res) => {
    res.json(boardService.getBoardForViewer(db, req.bingo!, viewerCan(req, "view_hidden_board")));
  }),
);

// Stats expose every team's progress, so players only get the full picture once
// the bingo is over (view_other_teams); while it's live they see just their own
// team (view_team_stats). Mods can watch everything throughout. "First to
// complete" events reach players only once the bingo is over
// (statsService.getStatsForViewer).
router.get(
  "/:slug/stats",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    historicalService.assertRecorded(db, bingo, "submissions");
    const seesEveryTeam = viewerCan(req, "view_other_teams");
    const myTeam = seesEveryTeam ? null : teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!seesEveryTeam && (!viewerCan(req, "view_team_stats") || !myTeam)) throw new ServiceError(403, "Stats aren't visible until the bingo is complete");

    res.json(statsService.getStatsForViewer(db, bingo.id, { teamId: myTeam?.id ?? null }));
  }),
);

// Rewind (CONTEXT.md): a Finished Bingo played back on its Board. Open to everyone who can view the Bingo, and only
// once it's Finished, when every Team's progress (and, in Rewind only, their Reactions) is visible to all. With "Show
// screenshots once Finished" off, other Teams' screenshots are left out for anyone but the mods, as in their
// submission lists.
router.get(
  "/:slug/rewind",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    historicalService.assertRecorded(db, bingo, "submissions");
    const rewind = rewindService.getRewind(db, bingo);
    const myTeamId = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id)?.id ?? null;
    res.json(rewindService.hideScreenshots(rewind, { seesOtherTeamsScreenshots: viewerCan(req, "view_other_teams_screenshots"), myTeamId }));
  }),
);

// Wrapped (CONTEXT.md): a Finished Bingo's year-in-review. Once a Moderator publishes it, everyone who can view the
// Bingo reads the stored copy (their own Player Wrapped, if they played, and the Bingo-wide one). Before that, only
// Moderators get it, as a live preview; everyone else a 404 "wrapped_not_published".
function wrappedViewer(req: Request): wrappedService.WrappedViewer {
  // Wrapped is made at the end of a Bingo, not recorded: never for a Historical one.
  historicalService.assertRecorded(db, req.bingo!, null);
  return { userId: req.user!.id, roles: req.bingoAccess!.roles, myTeamId: teamService.getUserTeamForBingo(db, req.bingo!.id, req.user!.id)?.id ?? null };
}

router.get(
  "/:slug/wrapped/me",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    res.json(wrappedService.readMyWrapped(db, req.bingo!, wrappedViewer(req)));
  }),
);

router.get(
  "/:slug/wrapped",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    res.json(wrappedService.readBingoWrapped(db, req.bingo!, wrappedViewer(req)));
  }),
);

// Superlative (CONTEXT.md) voting: the caller's own Team only — there's no reading or voting for another Team's
// ballot, and no endpoint anywhere returns another voter's pick or a tally while the bingo is live.
function myTeamOrThrow(req: Request) {
  const team = teamService.getUserTeamForBingo(db, req.bingo!.id, req.user!.id);
  if (!team) throw new ServiceError(403, "You're not on a Team in this bingo");
  return team;
}

router.get(
  "/:slug/superlatives/me",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    const team = myTeamOrThrow(req);
    res.json(superlativeService.getBallot(db, req.bingo!, team.id, req.user!.id));
  }),
);

router.put(
  "/:slug/superlatives/:categoryId",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  auditSkip("superlative votes are secret — no entry records who voted for whom"),
  asyncHandler(async (req, res) => {
    const team = myTeamOrThrow(req);
    const { nomineeUserId } = req.body as { nomineeUserId?: string };
    if (!nomineeUserId) throw new ServiceError(400, "nomineeUserId is required");
    superlativeService.setVote(db, req.bingo!, { categoryId: req.params.categoryId as string, teamId: team.id, voterUserId: req.user!.id, nomineeUserId });
    broadcast({ type: "superlative_votes_changed", bingoId: req.bingo!.id, payload: {} });
    res.json(superlativeService.getBallot(db, req.bingo!, team.id, req.user!.id));
  }),
);

router.delete(
  "/:slug/superlatives/:categoryId",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  auditSkip("superlative votes are secret — no entry records who voted for whom"),
  asyncHandler(async (req, res) => {
    const team = myTeamOrThrow(req);
    superlativeService.clearVote(db, req.bingo!, { categoryId: req.params.categoryId as string, voterUserId: req.user!.id });
    broadcast({ type: "superlative_votes_changed", bingoId: req.bingo!.id, payload: {} });
    res.json(superlativeService.getBallot(db, req.bingo!, team.id, req.user!.id));
  }),
);

// The Feedback form (CONTEXT.md "Feedback form"; docs/adr/0002-anonymous-feedback.md): a Finished Bingo's Players
// answer it anonymously. Everything under /feedback is anonymous end to end (anonymous(): no user in the request log,
// no actor in the audit context), and the routes write nothing to the audit log and tell no one over the WebSocket.
router.use("/:slug/feedback", anonymous());
router.get(
  "/:slug/feedback",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  noStore,
  asyncHandler(async (req, res) => {
    res.json(feedbackService.getFeedbackForm(db, req.bingo!, req.user!));
  }),
);

// Who a Member pick question on the Feedback form can pick: every clan member who has logged in, except the asker. Only
// for someone the form is open to.
router.get(
  "/:slug/feedback/members",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  noStore,
  asyncHandler(async (req, res) => {
    const { open, unavailable } = feedbackService.feedbackOpenTo(db, req.bingo!, req.user!);
    if (unavailable) throw new ServiceError(503, feedbackService.UNAVAILABLE_MESSAGE[unavailable]);
    if (!open) throw new ServiceError(403, "The Feedback form isn't open to you");
    res.json({ members: memberPickService.getPickableMembers(db, req.user!.id) });
  }),
);

router.put(
  "/:slug/feedback",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  auditSkip("Feedback responses are anonymous — nothing records that, or who, someone answered (ADR 0002)"),
  asyncHandler(async (req, res) => {
    res.json(feedbackService.submitFeedback(db, req.bingo!, req.user!, req.body as Partial<FeedbackSubmission>));
  }),
);

router.get(
  "/:slug/teams/:teamId/progress",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const teamId = req.params.teamId as string;
    const team = teamService.getTeamById(db, teamId);
    if (!team || team.bingoId !== bingo.id) throw new ServiceError(404, "Team not found");

    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (myTeam?.id !== teamId && !viewerCan(req, "view_other_teams")) {
      throw new ServiceError(403, "Other teams' progress isn't visible until the bingo is complete");
    }
    res.json(teamService.getTeamProgressForViewer(db, bingo, teamId, viewerCan(req, "view_hidden_board")));
  }),
);

// A team's submissions and activity: its own players, and whoever may see other teams (view_other_teams: the mods
// while the bingo runs, everyone who can see it once it's Finished). Then, with "Show screenshots once Finished" off,
// other teams' screenshots are left out for anyone but the mods (view_other_teams_screenshots; the submission records
// themselves stay).
function teamHistoryAccess(req: Request, teamId: string, what: string) {
  const bingo = req.bingo!;
  const team = teamService.getTeamById(db, teamId);
  if (!team || team.bingoId !== bingo.id) throw new ServiceError(404, "Team not found");
  const ownTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id)?.id === teamId;
  if (!ownTeam && !viewerCan(req, "view_other_teams")) throw new ServiceError(403, `Other teams' ${what} isn't visible until the bingo is complete`);
  return { hideScreenshots: !ownTeam && !viewerCan(req, "view_other_teams_screenshots") };
}

// A submission's activity entry names its screenshot too.
function withoutScreenshotUrls(activity: AuditLogResponse): AuditLogResponse {
  return {
    ...activity,
    entries: activity.entries.map((e) => {
      if (!e.details || typeof e.details !== "object" || !("screenshotUrl" in e.details)) return e;
      const { screenshotUrl: _screenshotUrl, ...details } = e.details as Record<string, unknown>;
      return { ...e, details };
    }),
  };
}

router.get(
  "/:slug/teams/:teamId/submissions",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    const { hideScreenshots } = teamHistoryAccess(req, req.params.teamId as string, "submissions");
    const submissions = submissionService.getTeamSubmissions(db, req.params.teamId as string);
    res.json({ submissions: hideScreenshots ? submissions.map((s) => ({ ...s, screenshots: [] })) : submissions });
  }),
);

router.get(
  "/:slug/teams/:teamId/activity",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const teamId = req.params.teamId as string;
    const { hideScreenshots } = teamHistoryAccess(req, teamId, "activity");

    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const condensed = req.query.condensed === "1" || req.query.condensed === "true";
    const activity = queryTeamActivity(db, bingo.id, teamId, { seesModEntries: viewerCan(req, "view_mod_activity"), cursor, limit, condensed });
    res.json(hideScreenshots ? withoutScreenshotUrls(activity) : activity);
  }),
);

router.post(
  "/:slug/submissions",
  requireAuth,
  requireBingo,
  upload.single("screenshot"),
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    // kind "proof" is a Proof screenshot (CONTEXT.md): for tileId, and taskId when the requirement is per-Task; no claims.
    const { claims: claimsRaw, teamId, forUserId, kind, tileId, taskId } = req.body as {
      claims?: string; teamId?: string; forUserId?: string; kind?: string; tileId?: string; taskId?: string;
    };
    // Your own team, for yourself or a teammate; a mod may name another team, and then the player it is for.
    let target;
    try {
      target = resolveSubmissionTarget(db, bingo, req.user!, { teamId, forUserId });
    } catch (err) {
      if (req.file) fs.unlinkSync(req.file.path);
      throw err;
    }
    const team = target.team;
    if (!req.file) throw new ServiceError(400, "Screenshot is required");

    if (kind !== undefined && kind !== "drop" && kind !== "proof") {
      fs.unlinkSync(req.file.path);
      throw new ServiceError(400, 'kind must be "drop" or "proof"');
    }
    if (kind === "proof" && !tileId) {
      fs.unlinkSync(req.file.path);
      throw new ServiceError(400, "tileId is required for a Proof screenshot");
    }

    let claims: ClaimInput[] = [];
    if (kind !== "proof") {
      try {
        claims = claimsRaw ? JSON.parse(claimsRaw) : [];
      } catch {
        fs.unlinkSync(req.file.path);
        throw new ServiceError(400, "claims must be valid JSON");
      }
    }

    let submission;
    try {
      const common = { teamId: team.id, submittedByUserId: target.submittedByUserId, postedByUserId: target.postedByUserId, screenshotUrl: `/uploads/${req.file.filename}` };
      submission = submissionService.createSubmission(db, bingo, kind === "proof" ? { ...common, kind, tileId: tileId!, taskId: taskId || null } : { ...common, claims });
    } catch (err) {
      fs.unlinkSync(req.file.path);
      throw err;
    }
    broadcast({ type: "submission_created", bingoId: bingo.id, payload: { teamId: team.id } });
    res.status(201).json({ submission });

    // After responding: refreshes the GE price table if it's due and prices any claims that came in without a Drop value.
    void refreshPricesAndFill(db);

    // Runs after responding — OCR (~1.6s+) shouldn't hold up submission
    // creation. Populates the same fields the mod panel shows (issue #7);
    // failure here just leaves that panel without OCR info for this one.
    if (isOcrEnabled() && !devSkipsOcr(req.header("x-dev-skip-ocr"))) {
      const filePath = req.file.path;
      const submissionId = submission.id;
      (async () => {
        const buffer = fs.readFileSync(filePath);
        // Background: the person already has their submission, so anyone waiting on the modal goes first.
        const result = await analyzeSubmissionScreenshot(db, bingo, team, { buffer, mimetype: req.file!.mimetype }, { priority: "background" });
        submissionService.recordScreenshotAnalysis(db, submissionId, {
          extractedText: result.extractedText,
          codewordFound: result.codewordFound,
          detectedItemName: result.detectedMatch?.itemName ?? null,
        });
      })().catch(() => submissionService.markScreenshotAnalysisFailed(db, submission!.id));
    }
  }),
);

router.post(
  "/:slug/submissions/analyze",
  requireAuth,
  requireBingo,
  analyzeUpload.single("screenshot"),
  auditSkip("read-only OCR analysis — no state changes"),
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    // Before anything reads the board: outside live, a match would tell anyone which tile holds an item. Mods included.
    submissionService.assertSubmissionsOpen(bingo);
    // The codeword to look for is the team the screenshot is being submitted to (a mod may name another team).
    const team = resolveSubmissionTeam(db, bingo, req.user!, (req.body as { teamId?: string }).teamId);
    if (!req.file) throw new ServiceError(400, "Screenshot is required");

    if (!isOcrEnabled()) throw new ServiceError(503, "Screenshot analysis is disabled on this server");

    // An OCR engine failure (corrupt image, model load issue, a tiny test
    // fixture PNG) just throws here — asyncHandler routes it to errorHandler,
    // which falls back to a plain 500. The client's existing analysisFailed
    // path already treats any non-2xx the same way it treats "not configured".
    const result = await analyzeSubmissionScreenshot(db, bingo, team, req.file);
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

// The signup form's questions: for anyone while signups are open, and afterwards for whoever can see the bingo.
router.get(
  "/:slug/signup/questions",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    if (req.bingo!.stage !== "signup" && !getBingoAccess(db, req.bingo!, req.user!).canSee) throw new ServiceError(403, "You're not part of this bingo");
    res.json({ questions: signupService.getQuestions(db, req.bingo!.id) });
  }),
);

router.get(
  "/:slug/signup",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const result = signupService.getSignupForUser(db, req.bingo!.id, req.user!.id);
    // Only warn while the mods have opted in and the player can still act on it.
    const atRisk = !!result?.signup && result.signup.status === "active" && req.bingo!.warnLeftovers && draftService.getCutUserIds(db, req.bingo!).has(req.user!.id);
    res.json({
      signup: result?.signup ?? null,
      answers: result?.answers ?? [],
      atRisk,
      caCurrent: result ? parseStoredCaStats(result.caCurrentJson) : null,
      caPeak: result ? parseStoredCaStats(result.caPeakJson) : null,
      statsFetchedAt: result?.statsFetchedAt ? result.statsFetchedAt.toISOString() : null,
      leadsTeam: teamService.ledTeamName(db, req.bingo!.id, req.user!.id),
    });
  }),
);

// The signer's tectonic-api membership + RSNs — drives both the RSN select
// (instead of free text) and the client-side "clan members only" gate.
router.get(
  "/:slug/signup/rsns",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const { enabled, member } = await getTectonicMembership(req.user!.discordId);
    res.json({
      enabled,
      isMember: !!member,
      rsns: (member?.rsns ?? []).map((r) => ({ rsn: r.rsn, womId: r.wom_id })),
    });
  }),
);

router.post(
  "/:slug/signup",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const { rsn, timezone, answers } = req.body as { rsn?: string; timezone?: string; answers?: signupService.SignupAnswerInput[] };
    if (!rsn) throw new ServiceError(400, "rsn is required");
    if (typeof timezone !== "string" || !timezone.trim()) throw new ServiceError(400, "timezone is required");
    const { enabled, member } = await getTectonicMembership(req.user!.discordId);
    // Hard gate on new signups only — someone who already signed up before
    // the integration was turned on (or before they were registered) keeps
    // their spot; PATCH below doesn't re-check membership.
    if (enabled && !member) {
      throw new ServiceError(403, "This bingo is only open to registered clan members. Ask a mod to check your clan registration.");
    }
    const { womId, rsnVerified } = matchRsn(member, rsn);
    const signup = signupService.createSignup(db, req.bingo!, {
      bingoId: req.bingo!.id,
      userId: req.user!.id,
      rsn,
      timezone,
      answers: answers ?? [],
      womId,
      rsnVerified,
    });
    // Fire-and-forget: WOM/RuneProfile data is a reference display, not
    // load-bearing — never let a flaky third-party API slow down or fail a
    // signup. Broadcast after persist (playerStatsService) so clients see CA.
    // Immediate broadcast still covers the new row before stats land.
    void fetchAndPersistPlayerStats(db, signup.id, signup.rsn, {
      discordId: req.user!.discordId,
      linkedRsns: (member?.rsns ?? []).map((r) => r.rsn),
    });
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(201).json({ signup });
  }),
);

router.patch(
  "/:slug/signup",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const existing = signupService.getSignupForUser(db, req.bingo!.id, req.user!.id);
    if (!existing) throw new ServiceError(404, "You haven't signed up for this bingo");
    const { rsn, timezone, answers } = req.body as { rsn?: string; timezone?: string; answers?: signupService.SignupAnswerInput[] };
    if (timezone !== undefined && typeof timezone !== "string") throw new ServiceError(400, "timezone must be a string");
    const membership = await getTectonicMembership(req.user!.discordId);
    const verification = rsn !== undefined ? matchRsn(membership.member, rsn) : {};
    const signup = signupService.updateSignup(db, req.bingo!, existing.signup.id, { rsn, timezone, answers, ...verification });
    // Re-fetch on any update, not just an RSN change — cheap, and keeps the
    // stored snapshot from going stale if someone edits other fields.
    void fetchAndPersistPlayerStats(db, signup.id, signup.rsn, {
      discordId: req.user!.discordId,
      linkedRsns: (membership.member?.rsns ?? []).map((r) => r.rsn),
    });
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.json({ signup });
  }),
);

router.delete(
  "/:slug/signup",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const existing = signupService.getSignupForUser(db, req.bingo!.id, req.user!.id);
    if (!existing) throw new ServiceError(404, "You haven't signed up for this bingo");
    const signup = signupService.withdrawSignup(db, req.bingo!, existing.signup.id);
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.json({ signup });
  }),
);

// ---------------------------------------------------------------------------
// Duo pairings
// ---------------------------------------------------------------------------

const me = (req: { user?: { id: string; discordId: string } }) => ({ id: req.user!.id, discordId: req.user!.discordId });

// The signup helpers (who to pair with, who's unpaired, your pairing) are for the signup form: they answer while
// signups are open, and to the bingo's mods at any time. The pairing actions keep their own stage rules
// (pairingService).
function assertSignupHelpersOpen(req: Request): void {
  if (req.bingo!.stage === "signup") return;
  assertCan(bingoRoles(db, req.bingo!, req.user!), req.bingo!, "moderate_bingo", { role: new ServiceError(403, "Signups are closed") });
}

// Who a player may request as a duo: the whole clan roster when tectonic-api
// is configured, otherwise (dev / no integration) everyone signed up so far.
router.get(
  "/:slug/signup/partners",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    assertSignupHelpersOpen(req);
    const client = getTectonicClient();
    let candidates: { discordId: string; rsns: string[] }[];
    if (client) {
      try {
        candidates = (await client.getRoster()).map((u) => ({ discordId: u.user_id, rsns: u.rsns.map((r) => r.rsn) }));
      } catch (err) {
        if (err instanceof TectonicUnavailableError) throw new ServiceError(503, "The clan roster is temporarily unavailable. Please try again in a minute.");
        throw err;
      }
    } else {
      candidates = signupService
        .getAllSignups(db, req.bingo!.id)
        .filter((r) => r.signup.status === "active")
        .map((r) => ({ discordId: r.user.discordId, rsns: [r.signup.rsn] }));
    }
    const userByDiscordId = new Map(userService.getPublicUsersByDiscordIds(db, req.bingo!.id, candidates.map((c) => c.discordId)).map((u) => [u.discordId, u]));
    res.json({
      candidates: candidates
        .filter((c) => c.discordId !== req.user!.discordId)
        .map((c) => ({ ...c, user: userByDiscordId.get(c.discordId) ?? null })),
    });
  }),
);

// Who a Member pick question on the signup form can pick: every clan member who has logged in, except the asker.
router.get(
  "/:slug/signup/members",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    assertSignupHelpersOpen(req);
    res.json({ members: memberPickService.getPickableMembers(db, req.user!.id) });
  }),
);

// Who else is signed up without a partner, for a player choosing one (duo bingos only).
router.get(
  "/:slug/signup/unpaired",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    assertSignupHelpersOpen(req);
    const players = req.bingo!.signupMode === "duo" ? pairingService.getUnpairedSignups(db, req.bingo!.id, req.user!.id) : [];
    res.json({ players });
  }),
);

router.get(
  "/:slug/signup/pairing",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    assertSignupHelpersOpen(req);
    const state = pairingService.getPairingState(db, req.bingo!.id, me(req));
    await applyRosterNames(partiesInPairingState(state));
    res.json(state);
  }),
);

router.post(
  "/:slug/signup/pairing",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const { targetDiscordId } = req.body as { targetDiscordId?: string };
    if (!targetDiscordId) throw new ServiceError(400, "targetDiscordId is required");
    const pairing = pairingService.requestPairing(db, req.bingo!, { requester: me(req), targetDiscordId });
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(201).json({ pairing });
  }),
);

// Removes a pairing regardless of its state: cancels it if still pending (requester only), leaves it if already
// accepted (either half) — see pairingService.removePairing for the dispatch.
router.delete(
  "/:slug/signup/pairing/:pairingId",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    pairingService.removePairing(db, req.bingo!, me(req), req.params.pairingId as string);
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(204).end();
  }),
);

router.post(
  "/:slug/signup/pairing/:pairingId/respond",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const { accept } = req.body as { accept?: boolean };
    if (typeof accept !== "boolean") throw new ServiceError(400, "accept must be a boolean");
    const pairing = pairingService.respondToRequest(db, req.bingo!, me(req), req.params.pairingId as string, accept);
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.json({ pairing });
  }),
);

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

router.get(
  "/:slug/draft",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    historicalService.assertRecorded(db, bingo, "draft");
    const roles = bingoRoles(db, bingo, req.user!);
    if (!can(roles, bingo, "view_draft_room").ok) throw new ServiceError(403, draftService.draftRoomForbiddenMessage(bingo.stage));

    const state = draftService.getDraftState(db, bingo, {
      includeAnswers: can(roles, bingo, "view_draft_pool_answers").ok,
      answerViewer: signupService.answerViewerFor(roles, bingo),
      hideCut: true,
    });
    // Ratings and notes are private to the team's leads (captain and co-captain): not its other players, not mods.
    const ratings = draftService.ratingsForViewer(db, bingo.id, req.user!.id);

    // Clan standing (points, tier, records, event placements) is fetched live
    // from tectonic-api in one batched call so it stays current through weeks
    // of signups; the client caches it for 60s. Public clan data, so it's
    // shown to everyone who can see the draft room.
    const tectonic = await fetchProfiles(db, state.pool.flatMap((unit) => unit.entries.map((entry) => entry.user.id)));

    // WOM EHB + account type and RuneProfile's account type were fetched
    // once at signup time (playerStatsService.ts) and persisted on the
    // signup row — no live external calls here, just parsing already-stored
    // JSON. The raw JSON blobs are internal only — stripped off `signup`
    // here rather than sent to the client.
    const pool = state.pool.map((unit) => ({
      ...unit,
      entries: unit.entries.map((entry) => {
        const { womDataJson, runeProfileDataJson, statsFetchedAt, caCurrentJson, caPeakJson, ...signup } = entry.signup;
        void statsFetchedAt;
        const parsed = parseStoredPlayerStats({ womDataJson, runeProfileDataJson, caCurrentJson, caPeakJson });
        return {
          ...entry,
          signup,
          womStats: parsed.womStats,
          accountType: parsed.accountType,
          caCurrent: parsed.caCurrent,
          caPeak: parsed.caPeak,
          tectonicProfile: tectonic.profiles[entry.user.id] ?? null,
        };
      }),
    }));

    res.json({ ...state, pool, ratings, tectonicUnavailable: tectonic.unavailable });
  }),
);

// Every signed-up player's account type (ironman, UIM…), for the badge beside their name wherever it's shown. Every
// bingo page asks for it, so someone who can't see the bingo gets none rather than an error.
router.get(
  "/:slug/account-types",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const canSee = getBingoAccess(db, req.bingo!, req.user!).canSee;
    const response: AccountTypesResponse = { accountTypes: canSee ? getAccountTypes(db, req.bingo!.id) : {} };
    res.json(response);
  }),
);

// One player's card, opened from any name on the page. Same data as a draft
// pool entry, plus it works for players who are already on a team. The viewer
// has to be able to see the bingo, and the card's subject has to be in it (an
// active signup, or on a team); mods can open anyone's (view_any_player; then
// someone who never signed up is clan standing only).
router.get(
  "/:slug/players/:userId",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const userId = req.params.userId as string;
    const user = userService.getMinimalUser(db, userId);
    if (!user || (!viewerCan(req, "view_any_player") && !isPartOfBingo(db, bingo.id, userId))) throw new ServiceError(404, "Player not found");

    // Signup answers follow the draft room's rule: mods always, team leads while scouting and drafting.
    const seesAnswers = viewerCan(req, "view_player_card_answers");
    // ...and of those, only the questions visible at the viewer's level.
    const visibleQuestions = signupService.visibleQuestionIds(db, bingo.id, signupService.answerViewerFor(req.bingoAccess!.roles, bingo));

    const signup = getSignupStats(db, bingo.id, userId);
    const tectonic = await fetchProfiles(db, [userId]);
    const player: PlayerProfile = {
      user,
      rsn: signup?.rsn ?? null,
      womStats: signup?.womStats ?? null,
      accountType: signup?.accountType ?? null,
      caCurrent: signup?.caCurrent ?? null,
      caPeak: signup?.caPeak ?? null,
      profile: tectonic.profiles[userId] ?? null,
      answers: signup && seesAnswers ? signup.answers.filter((a) => visibleQuestions.has(a.questionId)) : null,
      tectonicUnavailable: tectonic.unavailable,
      pastBingoStats: getPastParticipationsForUser(db, userId),
      achievements: achievementService.getAchievementCount(db, bingo, userId),
      access: viewerCan(req, "moderate_bingo") ? restrictionService.playerAccess(db, bingo, req.user!, userId) : null,
    };
    res.json({ player });
  }),
);

// A lead rates a signup for their own team's scouting list. Ratings never
// leave the team, so the acting user's team is resolved here, not from the body.
router.put(
  "/:slug/draft/ratings/:signupId",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    // The lock comes before who's asking: everyone gets it once the bingo is live.
    if (!passesRules(bingo, "rate_picks")) throw unavailable(bingo, "rate_picks");
    const onlyLeads = new ServiceError(403, "Only team leads can rate picks");
    assertUserCan(db, bingo, req.user!, "rate_picks", { role: onlyLeads });
    // Ratings go to the Team the user leads; an Admin who leads none has nothing to rate for.
    const myTeam = teamService.getLedTeam(db, bingo.id, req.user!.id);
    if (!myTeam) throw onlyLeads;

    const { stars, note } = req.body as { stars?: number; note?: string };
    draftService.setPickRating(db, myTeam.id, req.params.signupId as string, { stars: stars ?? 0, note: note ?? "" });
    broadcast({ type: "draft_rating_changed", bingoId: bingo.id, payload: { teamId: myTeam.id } });
    res.json({ ratings: draftService.getTeamRatings(db, myTeam.id) });
  }),
);

// A teammate puts an emoji on one of their team's submissions, or takes it off (audited for the team); teammates
// refetch the team's submissions from the broadcast.
router.put(
  "/:slug/submissions/:id/reactions",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const { emoji, reacted } = req.body as { emoji?: unknown; reacted?: unknown };
    if (!submissionService.isSubmissionReaction(emoji)) throw new ServiceError(400, "Not a reaction");
    const submissionId = req.params.id as string;
    const team = teamService.getTeamById(db, submissionService.getSubmissionById(db, submissionId)?.teamId ?? "");
    if (!team || team.bingoId !== req.bingo!.id) throw new ServiceError(404, "Submission not found");
    // Refuses for a Restriction; who is on the submission's team is the service's to say.
    assertUserCan(db, req.bingo!, req.user!, "react", { role: new ServiceError(403, "Only the submission's team can react to it") });
    const { teamId } = submissionService.setSubmissionReaction(db, submissionId, req.user!.id, emoji, reacted === true);
    broadcast({ type: "submission_reactions_changed", bingoId: req.bingo!.id, payload: { teamId, submissionId } });
    res.json({ reactions: submissionService.getSubmissionDetails(db, submissionId)?.reactions ?? [] });
  }),
);

// A player raises or lowers their hand for one part (task) of a tile on their
// own team's board.
router.put(
  "/:slug/tiles/:tileId/tasks/:taskId/interest",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!myTeam) throw new ServiceError(403, "You need to be on a team to claim a task");

    const { interested } = req.body as { interested?: boolean };
    teamService.setTileInterest(db, myTeam.id, req.user!.id, req.params.tileId as string, req.params.taskId as string, interested === true);
    broadcast({ type: "tile_interest_changed", bingoId: bingo.id, payload: { teamId: myTeam.id } });
    res.json(teamService.getTeamProgress(db, myTeam.id));
  }),
);

router.post(
  "/:slug/draft/pick",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new ServiceError(400, "userId is required");

    const picks = draftService.makePick(db, { bingo, pickedUserId: userId, actingUserId: req.user!.id, actingIsAdmin: req.user!.isAdmin });
    const [first] = picks;
    broadcast({ type: "draft_pick", bingoId: bingo.id, payload: { pickNumber: first!.pickNumber, teamId: first!.teamId, userIds: picks.map((p) => p.userId) } });
    res.status(201).json({ picks });
  }),
);

// A site admin takes back the latest pick (a misclick). Its players go back into the pool.
router.post(
  "/:slug/draft/undo",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const undone = draftService.undoLastPick(db, { bingo, actingUserId: req.user!.id, actingIsAdmin: req.user!.isAdmin });
    broadcast({ type: "draft_pick_undone", bingoId: bingo.id, payload: undone });
    res.json({ undone });
  }),
);

// Captain/co-captain self-service rename — mods can already rename any team
// from the admin panel; this is the player-facing equivalent, name-only.
router.patch(
  "/:slug/teams/:teamId",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const team = teamService.getTeamById(db, req.params.teamId as string);
    if (!team || team.bingoId !== req.bingo!.id) throw new ServiceError(404, "Team not found");
    // Only a Team's own Captain or co-captain renames it here, and only during Board revealed: before it the Draft
    // hasn't set the Team, and Live locks the name (CONTEXT.md "Team name"). Admins can still fix names from the mod
    // panel at any stage.
    const onlyCaptain = new ServiceError(403, "Only the captain can rename this team");
    if (teamService.getLedTeam(db, req.bingo!.id, req.user!.id)?.id !== team.id) throw onlyCaptain;
    // Outside Board revealed, the shared reason says which side of it the Bingo is on.
    assertUserCan(db, req.bingo!, req.user!, "rename_team", { role: onlyCaptain });

    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) throw new ServiceError(400, "name is required");
    const updated = teamService.updateTeam(db, team.id, { name: name.trim() });
    broadcast({ type: "team_updated", bingoId: req.bingo!.id, payload: { teamId: team.id } });
    void syncWomCompetition(db, req.bingo!.id);
    res.json({ team: updated });
  }),
);

// ---------------------------------------------------------------------------
// Achievements (CONTEXT.md "Achievement")
// ---------------------------------------------------------------------------

router.get(
  "/:slug/achievements",
  requireAuth,
  requireBingo,
  requireBingoViewer,
  asyncHandler(async (req, res) => {
    historicalService.assertRecorded(db, req.bingo!, null);
    res.json(achievementService.getMyAchievements(db, req.bingo!, req.user!.id));
  }),
);

// The player's device reports which unlock popups it has already played, so they don't play again.
router.post(
  "/:slug/achievements/popups-shown",
  requireAuth,
  requireBingo,
  auditSkip("device reporting a popup already played — UI state, nothing to audit"),
  asyncHandler(async (req, res) => {
    const { keys } = req.body as { keys?: unknown[] };
    const valid = Array.isArray(keys) ? keys.filter(isAchievementKey) : [];
    achievementService.markPopupsShown(db, req.bingo!.id, req.user!.id, valid);
    res.status(204).end();
  }),
);

// A Tile's details, the Rules, or the Stats page were opened. Fire-and-forget: always 204, even for a viewer not on
// a team (achievementService itself no-ops outside Live too) — the client never needs to handle a failure here.
router.post(
  "/:slug/achievements/opened",
  requireAuth,
  requireBingo,
  auditSkip("fire-and-forget page-open signal for Achievements — no visible state to audit"),
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (myTeam) {
      const body = req.body as { kind?: unknown; tileId?: unknown };
      const base = { bingoId: bingo.id, userId: req.user!.id, teamId: myTeam.id, occurredAt: clockNow() };
      if (body.kind === "tile" && typeof body.tileId === "string") {
        achievementService.recordPageOpened(db, { ...base, kind: "tile", tileId: body.tileId });
      } else if (body.kind === "rules" || body.kind === "stats") {
        achievementService.recordPageOpened(db, { ...base, kind: body.kind });
      }
    }
    res.status(204).end();
  }),
);

export default router;
