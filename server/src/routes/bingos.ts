import { Router } from "express";
import fs from "fs";
import type { ClaimInput } from "@bingo/shared";
import { UPLOADS_DIR } from "../config";
import { imageUpload } from "../middleware/upload";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as boardService from "../services/boardService";
import * as teamService from "../services/teamService";
import * as submissionService from "../services/submissionService";
import * as signupService from "../services/signupService";
import * as draftService from "../services/draftService";
import * as pairingService from "../services/pairingService";
import * as userService from "../services/userService";
import * as statsService from "../services/statsService";
import { isOcrEnabled, analyzeSubmissionScreenshot } from "../ocr";
import { getTectonicClient, TectonicUnavailableError, type TectonicDetailedUser } from "../services/tectonicService";
import { parseWomSummary } from "../services/womService";
import { parseAccountType } from "../services/runeProfileService";
import { fetchAndPersistPlayerStats } from "../services/playerStatsService";
import { syncWomTeamRename } from "../services/womCompetitionService";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";

// Async tectonic lookups live at the route layer (not signupService, which
// stays sync/DB-pure). One call covers both membership gating and RSN
// verification for a request. `enabled: false` means the integration isn't
// configured — no gating or verification applies, current behavior.
// `member: null` means tectonic answered and doesn't know this user; an
// outage is surfaced as a 503 rather than mistaken for non-membership.
async function getTectonicMembership(discordId: string): Promise<{ enabled: boolean; member: TectonicDetailedUser | null }> {
  const client = getTectonicClient();
  if (!client) return { enabled: false, member: null };
  try {
    return { enabled: true, member: await client.getDetailedUser(discordId) };
  } catch (err) {
    if (err instanceof TectonicUnavailableError) {
      throw new ServiceError(503, "Clan membership check is temporarily unavailable. Please try again in a minute.");
    }
    throw err;
  }
}

// Matches the submitted RSN against the signer's tectonic-api RSNs
// case-insensitively. A client-sent "verified" claim is never trusted; this
// is the only path that can set rsnVerified: true.
function matchRsn(member: TectonicDetailedUser | null, rsn: string): { womId: string | null; rsnVerified: boolean } {
  const match = member?.rsns.find((r) => r.rsn.toLowerCase() === rsn.trim().toLowerCase());
  return match ? { womId: match.wom_id, rsnVerified: true } : { womId: null, rsnVerified: false };
}

const upload = imageUpload(UPLOADS_DIR);
// Separate instance for analysis — memory only, nothing saved to disk.
const analyzeUpload = imageUpload();

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ bingos: bingoService.listBingos(db) });
  }),
);

router.get(
  "/:slug",
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const isMod = req.user ? bingoService.isBingoMod(db, bingo.id, req.user.id, req.user.isAdmin) : false;
    const myTeam = req.user ? teamService.getUserTeamForBingo(db, bingo.id, req.user.id) : null;
    const paidSignupCount = signupService.getPaidSignupCount(db, bingo.id);
    res.json({
      bingo: bingoService.toPublicBingo(bingo),
      categories: boardService.getCategories(db, bingo.id),
      teams: teamService.getTeamsWithMembers(db, bingo.id),
      isMod,
      myTeam,
      paidSignupCount,
      potTotal: bingoService.calculatePotTotal(bingo, paidSignupCount),
      hasSignups: signupService.hasAnySignup(db, bingo.id),
    });
  }),
);

router.get(
  "/:slug/board",
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const isMod = req.user ? bingoService.isBingoMod(db, bingo.id, req.user.id, req.user.isAdmin) : false;
    const canView = bingoService.canViewTiles(bingo, isMod);
    res.json({
      tiles: canView ? boardService.getBoardTiles(db, bingo.id) : [],
      lines: canView ? boardService.getBoardLines(db, bingo.id) : [],
    });
  }),
);

// Stats expose every team's progress, so players only get them once the bingo
// is over; mods can watch throughout.
router.get(
  "/:slug/stats",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    if (!isMod && bingo.stage !== "complete") throw new ServiceError(403, "Stats aren't visible until the bingo is complete");

    res.json({
      pointsOverTime: statsService.getPointsOverTime(db, bingo.id),
      timeline: statsService.getTimeline(db, bingo.id),
      contributions: statsService.getContributionCounts(db, bingo.id),
      heatmap: statsService.getTileHeatmap(db, bingo.id),
    });
  }),
);

router.get(
  "/:slug/teams/:teamId/progress",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const teamId = req.params.teamId as string;
    const team = teamService.getTeamById(db, teamId);
    if (!team || team.bingoId !== bingo.id) throw new ServiceError(404, "Team not found");

    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!isMod && bingo.stage !== "complete" && myTeam?.id !== teamId) {
      throw new ServiceError(403, "Other teams' progress isn't visible until the bingo is complete");
    }
    res.json(teamService.getTeamProgress(db, teamId));
  }),
);

router.get(
  "/:slug/teams/:teamId/submissions",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const teamId = req.params.teamId as string;
    const team = teamService.getTeamById(db, teamId);
    if (!team || team.bingoId !== bingo.id) throw new ServiceError(404, "Team not found");

    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!isMod && myTeam?.id !== teamId) throw new ServiceError(403, "Not allowed to view another team's submissions");

    res.json({ submissions: submissionService.getTeamSubmissions(db, teamId) });
  }),
);

router.post(
  "/:slug/submissions",
  requireAuth,
  requireBingo,
  upload.single("screenshot"),
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const team = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!team) {
      if (req.file) fs.unlinkSync(req.file.path);
      throw new ServiceError(403, "You are not on a team for this bingo");
    }
    if (!req.file) throw new ServiceError(400, "Screenshot is required");

    const { claims: claimsRaw } = req.body as { claims?: string };
    let claims: ClaimInput[];
    try {
      claims = claimsRaw ? JSON.parse(claimsRaw) : [];
    } catch {
      fs.unlinkSync(req.file.path);
      throw new ServiceError(400, "claims must be valid JSON");
    }

    let submission;
    try {
      submission = submissionService.createSubmission(db, bingo, {
        teamId: team.id,
        submittedByUserId: req.user!.id,
        claims,
        screenshotUrl: `/uploads/${req.file.filename}`,
      });
    } catch (err) {
      fs.unlinkSync(req.file.path);
      throw err;
    }
    broadcast({ type: "submission_created", bingoId: bingo.id, payload: { teamId: team.id } });
    res.status(201).json({ submission });

    // Runs after responding — OCR (~1.6s+) shouldn't hold up submission
    // creation. Populates the same fields the mod panel shows (issue #7);
    // failure here just leaves that panel without OCR info for this one.
    if (isOcrEnabled()) {
      const filePath = req.file.path;
      const submissionId = submission.id;
      (async () => {
        const buffer = fs.readFileSync(filePath);
        const result = await analyzeSubmissionScreenshot(db, bingo, team, { buffer, mimetype: req.file!.mimetype });
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
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const team = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!team) throw new ServiceError(403, "You are not on a team for this bingo");
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

router.get(
  "/:slug/signup/questions",
  requireBingo,
  asyncHandler(async (req, res) => {
    res.json({ questions: signupService.getQuestions(db, req.bingo!.id) });
  }),
);

router.get(
  "/:slug/signup",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const result = signupService.getSignupForUser(db, req.bingo!.id, req.user!.id);
    res.json({ signup: result?.signup ?? null, answers: result?.answers ?? [] });
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
    const { rsn, answers } = req.body as { rsn?: string; answers?: signupService.SignupAnswerInput[] };
    if (!rsn) throw new ServiceError(400, "rsn is required");
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
      answers: answers ?? [],
      womId,
      rsnVerified,
    });
    // Fire-and-forget: WOM/RuneProfile data is a reference display, not
    // load-bearing — never let a flaky third-party API slow down or fail a
    // signup. See playerStatsService.ts.
    void fetchAndPersistPlayerStats(db, signup.id, signup.rsn);
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
    const { rsn, answers } = req.body as { rsn?: string; answers?: signupService.SignupAnswerInput[] };
    const verification = rsn !== undefined ? matchRsn((await getTectonicMembership(req.user!.discordId)).member, rsn) : {};
    const signup = signupService.updateSignup(db, req.bingo!, existing.signup.id, { rsn, answers, ...verification });
    // Re-fetch on any update, not just an RSN change — cheap, and keeps the
    // stored snapshot from going stale if someone edits other fields.
    void fetchAndPersistPlayerStats(db, signup.id, signup.rsn);
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

// Who a player may request as a duo: the whole clan roster when tectonic-api
// is configured, otherwise (dev / no integration) everyone signed up so far.
router.get(
  "/:slug/signup/partners",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
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
    const userByDiscordId = new Map(userService.getUsersByDiscordIds(db, candidates.map((c) => c.discordId)).map((u) => [u.discordId, u]));
    res.json({
      candidates: candidates
        .filter((c) => c.discordId !== req.user!.discordId)
        .map((c) => ({ ...c, user: userByDiscordId.get(c.discordId) ?? null })),
    });
  }),
);

router.get(
  "/:slug/signup/pairing",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    res.json(pairingService.getPairingState(db, req.bingo!.id, me(req)));
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

router.delete(
  "/:slug/signup/pairing/:pairingId",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    pairingService.cancelRequest(db, req.bingo!, me(req), req.params.pairingId as string);
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
    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    // Visible to mods, captains, and anyone signed up for this bingo — not the general public.
    const canView = isMod || !!teamService.getUserTeamForBingo(db, bingo.id, req.user!.id) || !!signupService.getSignupForUser(db, bingo.id, req.user!.id)?.signup;
    if (!canView) throw new ServiceError(403, "The draft room is only visible to signed-up players and mods");

    const isLead = teamService.getTeamsForBingo(db, bingo.id).some((t) => teamService.isTeamLead(db, t.id, req.user!.id));
    const state = draftService.getDraftState(db, bingo.id, { includeAnswers: isMod || isLead });

    // WOM EHB + account type and RuneProfile's account type were fetched
    // once at signup time (playerStatsService.ts) and persisted on the
    // signup row — no live external calls here, just parsing already-stored
    // JSON. Account type prefers RuneProfile (it distinguishes group
    // ironman variants; WOM just reports "ironman" for a GIM member),
    // falling back to WOM for a player who syncs to WOM but isn't set up
    // with the RuneProfile RuneLite plugin. The raw JSON blobs are internal
    // only — stripped off `signup` here rather than sent to the client.
    const pool = state.pool.map((unit) => ({
      ...unit,
      entries: unit.entries.map((entry) => {
        const { womDataJson, runeProfileDataJson, statsFetchedAt, ...signup } = entry.signup;
        void statsFetchedAt;
        const womSummary = parseWomSummary(womDataJson ? JSON.parse(womDataJson) : null);
        const accountType = parseAccountType(runeProfileDataJson ? JSON.parse(runeProfileDataJson) : null) ?? womSummary?.accountType ?? null;
        return {
          ...entry,
          signup,
          womStats: womSummary ? { ehb: womSummary.ehb } : null,
          accountType,
        };
      }),
    }));

    res.json({ ...state, pool });
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

// Captain/co-captain self-service rename — mods can already rename any team
// from the admin panel; this is the player-facing equivalent, name-only.
router.patch(
  "/:slug/teams/:teamId",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const team = teamService.getTeamById(db, req.params.teamId as string);
    if (!team || team.bingoId !== req.bingo!.id) throw new ServiceError(404, "Team not found");
    if (!teamService.isTeamLead(db, team.id, req.user!.id)) throw new ServiceError(403, "Only the captain can rename this team");

    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) throw new ServiceError(400, "name is required");
    const updated = teamService.updateTeam(db, team.id, { name: name.trim() });
    broadcast({ type: "team_updated", bingoId: req.bingo!.id, payload: { teamId: team.id } });
    void syncWomTeamRename(db, req.bingo!.id);
    res.json({ team: updated });
  }),
);

export default router;
