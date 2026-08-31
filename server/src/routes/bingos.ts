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
import { getAIClient, analyzeSubmissionScreenshot } from "../ai";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";

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
    res.json({
      bingo,
      categories: boardService.getCategories(db, bingo.id),
      teams: teamService.getTeamsForBingo(db, bingo.id),
      isMod,
      myTeam,
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

router.post(
  "/:slug/signup",
  requireAuth,
  requireBingo,
  asyncHandler(async (req, res) => {
    const { rsn, answers } = req.body as { rsn?: string; answers?: signupService.SignupAnswerInput[] };
    if (!rsn) throw new ServiceError(400, "rsn is required");
    const signup = signupService.createSignup(db, req.bingo!, { bingoId: req.bingo!.id, userId: req.user!.id, rsn, answers: answers ?? [] });
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
    const signup = signupService.updateSignup(db, req.bingo!, existing.signup.id, { rsn, answers });
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

export default router;
