import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
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
import * as statsService from "../services/statsService";
import { getAIClient, analyzeSubmissionScreenshot } from "../ai";
import { getTectonicClient, type TectonicDetailedUser } from "../services/tectonicService";
import { getWomClient, getWomGroupId } from "../services/womService";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";

// Async tectonic lookups live at the route layer (not signupService, which
// stays sync/DB-pure). One call covers both membership gating and RSN
// verification for a request. `enabled: false` means the integration isn't
// configured — no gating or verification applies, current behavior.
async function getTectonicMembership(discordId: string): Promise<{ enabled: boolean; member: TectonicDetailedUser | null }> {
  const client = getTectonicClient();
  if (!client) return { enabled: false, member: null };
  return { enabled: true, member: await client.getDetailedUser(discordId) };
}

// Matches the submitted RSN against the signer's tectonic-api RSNs
// case-insensitively. A client-sent "verified" claim is never trusted; this
// is the only path that can set rsnVerified: true.
function matchRsn(member: TectonicDetailedUser | null, rsn: string): { womId: string | null; rsnVerified: boolean } {
  const match = member?.rsns.find((r) => r.rsn.toLowerCase() === rsn.trim().toLowerCase());
  return match ? { womId: match.wom_id, rsnVerified: true } : { womId: null, rsnVerified: false };
}

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function imageOnlyFilter(_req: unknown, file: Express.Multer.File, cb: (err: Error | null, ok?: boolean) => void) {
  if (!file.mimetype.startsWith("image/")) {
    cb(new Error("Only image files are allowed"));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 11)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageOnlyFilter,
});

// Separate instance for analysis — memory only, nothing saved to disk.
const analyzeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageOnlyFilter,
});

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
      bingo,
      categories: boardService.getCategories(db, bingo.id),
      teams: teamService.getTeamsForBingo(db, bingo.id),
      isMod,
      myTeam,
      paidSignupCount,
      potTotal: bingoService.calculatePotTotal(bingo, paidSignupCount),
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
    res.json({ tiles: canView ? boardService.getBoardTiles(db, bingo.id) : [] });
  }),
);

// Same visibility rule as the board itself — read-only and entirely derived,
// so there's no reason to gate it any tighter.
router.get(
  "/:slug/stats",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const bingo = req.bingo!;
    const isMod = bingoService.isBingoMod(db, bingo.id, req.user!.id, req.user!.isAdmin);
    if (!bingoService.canViewTiles(bingo, isMod)) throw new ServiceError(403, "Stats aren't visible until the board is revealed");

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
    const isPublic = bingo.stage === "live" || bingo.stage === "complete";
    const myTeam = teamService.getUserTeamForBingo(db, bingo.id, req.user!.id);
    if (!isMod && !isPublic && myTeam?.id !== teamId) {
      throw new ServiceError(403, "Team progress isn't visible to other teams yet");
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

    const { taskId, itemClaims: itemClaimsRaw, isWildcardRedemption, wildcardId } = req.body as {
      taskId?: string;
      itemClaims?: string;
      isWildcardRedemption?: string;
      wildcardId?: string;
    };
    if (!taskId) {
      fs.unlinkSync(req.file.path);
      throw new ServiceError(400, "taskId is required");
    }

    let itemClaims: submissionService.ItemClaimInput[];
    try {
      itemClaims = itemClaimsRaw ? JSON.parse(itemClaimsRaw) : [];
    } catch {
      fs.unlinkSync(req.file.path);
      throw new ServiceError(400, "itemClaims must be valid JSON");
    }

    try {
      const submission = submissionService.createSubmission(db, bingo, {
        teamId: team.id,
        taskId,
        submittedByUserId: req.user!.id,
        itemClaims,
        screenshotUrl: `/uploads/${req.file.filename}`,
        isWildcardRedemption: isWildcardRedemption === "true",
        wildcardId,
      });
      broadcast({ type: "submission_created", bingoId: bingo.id, payload: { teamId: team.id } });
      res.status(201).json({ submission });
    } catch (err) {
      fs.unlinkSync(req.file.path);
      throw err;
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

    const ai = getAIClient();
    if (!ai) throw new ServiceError(503, "AI analysis is not configured on this server");

    const result = await analyzeSubmissionScreenshot(ai, db, bingo, team, req.file);
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
    res.json({ signup });
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

    const isCaptain = teamService.getTeamsForBingo(db, bingo.id).some((t) => t.captainUserId === req.user!.id);
    const state = draftService.getDraftState(db, bingo.id, { includeAnswers: isMod || isCaptain });

    // Enrich the pool with WOM EHB for players whose signup RSN matched a
    // tectonic-linked account (signups.womId, Phase T2) — one bulk request
    // for the whole WOM_GROUP_ID group covers every pool entry at once
    // (instead of one WOM request per player, which blew through WOM's
    // 20 req/min unauthenticated limit for any pool bigger than ~20). Null
    // (WOM_GROUP_ID unset, WOM unreachable, or this player unlinked/not a
    // group member there) degrades to no stats shown, same as tectonic.
    const groupId = getWomGroupId();
    const womStatsById = groupId ? await getWomClient().getGroupEhb(groupId) : null;
    const pool = state.pool.map((entry) => ({
      ...entry,
      womStats: entry.signup.womId ? (womStatsById?.get(entry.signup.womId) ?? null) : null,
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

    const pick = draftService.makePick(db, { bingo, pickedUserId: userId, actingUserId: req.user!.id, actingIsAdmin: req.user!.isAdmin });
    broadcast({ type: "draft_pick", bingoId: bingo.id, payload: { pickNumber: pick.pickNumber, teamId: pick.teamId, userId: pick.userId } });
    res.status(201).json({ pick });
  }),
);

// Captain self-service rename — mods can already rename any team from the
// admin panel; this is the player-facing equivalent, name-only.
router.patch(
  "/:slug/teams/:teamId",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const team = teamService.getTeamById(db, req.params.teamId as string);
    if (!team || team.bingoId !== req.bingo!.id) throw new ServiceError(404, "Team not found");
    if (team.captainUserId !== req.user!.id) throw new ServiceError(403, "Only the captain can rename this team");

    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) throw new ServiceError(400, "name is required");
    const updated = teamService.updateTeam(db, team.id, { name: name.trim() });
    broadcast({ type: "team_updated", bingoId: req.bingo!.id, payload: { teamId: team.id } });
    res.json({ team: updated });
  }),
);

export default router;
