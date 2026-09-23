import { devSkipsOcr } from "../devMode";
import { privateRevalidate } from "../middleware/cacheControl";
import { Router } from "express";
import fs from "fs";
import type { ClaimInput, PlayerProfile } from "@bingo/shared";
import { UPLOADS_DIR } from "../config";
import { imageUpload } from "../middleware/upload";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
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
import * as userService from "../services/userService";
import * as statsService from "../services/statsService";
import { isOcrEnabled, analyzeSubmissionScreenshot } from "../ocr";
import { getTectonicClient, TectonicUnavailableError, type TectonicDetailedUser } from "../services/tectonicService";
import { fetchProfiles } from "../services/tectonicProfileService";
import { applyRosterNames, partiesInPairingState } from "../services/pairingNames";
import { fetchAndPersistPlayerStats, getSignupStats, parseStoredPlayerStats } from "../services/playerStatsService";
import { parseStoredCaStats } from "../services/combatAchievements";
import { syncWomTeamRename } from "../services/womCompetitionService";
import { getPastParticipationsForUser } from "../services/pastWomCompetitionService";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";
import { auditSkip } from "../audit/middleware";
import { queryTeamActivity } from "../audit/query";

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

const upload = imageUpload(UPLOADS_DIR, { variants: true });
// Separate instance for analysis — memory only, nothing saved to disk.
const analyzeUpload = imageUpload();

const router = Router();

// Every route here needs a login: the shell carries each team's roster (players' Discord accounts and RSNs), so
// nothing about a bingo is served to an anonymous request (see requireLogin.test.ts).
router.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ bingos: bingoService.listBingos(db) });
  }),
);

router.get(
  "/:slug",
  requireAuth,
  requireBingo,
  privateRevalidate,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const isMod = req.user ? bingoService.isBingoMod(db, bingo.id, req.user.id, req.user.isAdmin) : false;
    const myTeam = req.user ? teamService.getUserTeamForBingo(db, bingo.id, req.user.id) : null;
    const paidSignupCount = signupService.getPaidSignupCount(db, bingo.id);
    res.json({
      // effectiveStartsAt: when the bingo counts as started (see bingoStart.ts) — the settings' start date, or else
      // when it was last put live. The client runs tile freezes and "has it started" from this, not from startsAt.
      bingo: { ...bingoService.toViewerBingo(bingo, isMod), effectiveStartsAt: effectiveStartsAt(db, bingo) },
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
  requireAuth,
  requireBingo,
  privateRevalidate,
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

// Stats expose every team's progress, so players only get the full picture once
// the bingo is over; while it's live they see just their own team. Mods can
// watch everything throughout. "First to complete" events are mods-only, always
// (statsService.getStatsForViewer).
router.get(
  "/:slug/stats",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    const seesEveryTeam = isMod || bingo.stage === "complete";
    const myTeam = seesEveryTeam ? null : teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!seesEveryTeam && (bingo.stage !== "live" || !myTeam)) throw new ServiceError(403, "Stats aren't visible until the bingo is complete");

    res.json(statsService.getStatsForViewer(db, bingo.id, { isMod, teamId: myTeam?.id ?? null }));
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

router.get(
  "/:slug/teams/:teamId/activity",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const teamId = req.params.teamId as string;
    const team = teamService.getTeamById(db, teamId);
    if (!team || team.bingoId !== bingo.id) throw new ServiceError(404, "Team not found");

    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!isMod && myTeam?.id !== teamId) throw new ServiceError(403, "Not allowed to view another team's activity");

    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const condensed = req.query.condensed === "1" || req.query.condensed === "true";
    res.json(queryTeamActivity(db, bingo.id, teamId, { isMod, cursor, limit, condensed }));
  }),
);

router.post(
  "/:slug/submissions",
  requireAuth,
  requireBingo,
  upload.single("screenshot"),
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const { claims: claimsRaw, teamId, forUserId } = req.body as { claims?: string; teamId?: string; forUserId?: string };
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
        submittedByUserId: target.submittedByUserId,
        postedByUserId: target.postedByUserId,
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

router.get(
  "/:slug/signup/questions",
  requireAuth,
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
    // Only warn while the mods have opted in and the player can still act on it.
    const atRisk = !!result?.signup && result.signup.status === "active" && req.bingo!.warnLeftovers && draftService.getLeftoverUserIds(db, req.bingo!).has(req.user!.id);
    res.json({
      signup: result?.signup ?? null,
      answers: result?.answers ?? [],
      atRisk,
      caCurrent: result ? parseStoredCaStats(result.caCurrentJson) : null,
      caPeak: result ? parseStoredCaStats(result.caPeakJson) : null,
      statsFetchedAt: result?.statsFetchedAt ? result.statsFetchedAt.toISOString() : null,
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
    const { rsn, answers } = req.body as { rsn?: string; answers?: signupService.SignupAnswerInput[] };
    const membership = await getTectonicMembership(req.user!.discordId);
    const verification = rsn !== undefined ? matchRsn(membership.member, rsn) : {};
    const signup = signupService.updateSignup(db, req.bingo!, existing.signup.id, { rsn, answers, ...verification });
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
    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    const isLead = !!myTeam && teamService.isTeamLead(db, myTeam.id, req.user!.id);
    const isSignedUp = !!signupService.getSignupForUser(db, bingo.id, req.user!.id)?.signup;
    if (!draftService.canViewDraftRoom(bingo.stage, { isMod, isLead, isOnTeam: !!myTeam, isSignedUp })) {
      throw new ServiceError(403, draftService.draftRoomForbiddenMessage(bingo.stage));
    }

    const ledTeamId = isLead && myTeam ? myTeam.id : null;
    const state = draftService.getDraftState(db, bingo, { includeAnswers: isMod || !!ledTeamId, hideCut: true });
    // Scouting notes are private to the lead's own team.
    const ratings = ledTeamId ? draftService.getTeamRatings(db, ledTeamId) : {};

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

// One player's card, opened from any name on the page. Same data as a draft
// pool entry, plus it works for players who are already on a team (or never
// signed up at all — then it's clan standing only).
router.get(
  "/:slug/players/:userId",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const userId = req.params.userId as string;
    const user = userService.getMinimalUser(db, userId);
    if (!user) throw new ServiceError(404, "Player not found");

    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    // Signup answers follow the draft room's rule: mods and team leads only.
    const seesAnswers = isMod || (!!myTeam && teamService.isTeamLead(db, myTeam.id, req.user!.id));

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
      answers: signup && seesAnswers ? signup.answers : null,
      tectonicUnavailable: tectonic.unavailable,
      pastBingoStats: getPastParticipationsForUser(db, userId),
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
    if (bingoService.isBoardLocked(bingo)) throw new ServiceError(400, "Ratings are locked once the bingo is live");
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!myTeam || !teamService.isTeamLead(db, myTeam.id, req.user!.id)) throw new ServiceError(403, "Only team leads can rate picks");

    const { stars, note } = req.body as { stars?: number; note?: string };
    draftService.setPickRating(db, myTeam.id, req.params.signupId as string, { stars: stars ?? 0, note: note ?? "" });
    broadcast({ type: "draft_rating_changed", bingoId: bingo.id, payload: { teamId: myTeam.id } });
    res.json({ ratings: draftService.getTeamRatings(db, myTeam.id) });
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
    if (!teamService.isTeamLead(db, team.id, req.user!.id)) throw new ServiceError(403, "Only the captain can rename this team");
    // Admins can still fix names from the mod panel; captains are done once live.
    if (bingoService.isBoardLocked(req.bingo!)) throw new ServiceError(400, "Team names are locked once the bingo is live");

    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) throw new ServiceError(400, "name is required");
    const updated = teamService.updateTeam(db, team.id, { name: name.trim() });
    broadcast({ type: "team_updated", bingoId: req.bingo!.id, payload: { teamId: team.id } });
    void syncWomTeamRename(db, req.bingo!.id);
    res.json({ team: updated });
  }),
);

export default router;
