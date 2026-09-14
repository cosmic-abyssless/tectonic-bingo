import { Router } from "express";
import type { GraphNodeInput } from "@bingo/shared";
import path from "path";
import { UPLOADS_DIR } from "../config";
import { imageUpload } from "../middleware/upload";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as boardService from "../services/boardService";
import * as signupService from "../services/signupService";
import * as teamService from "../services/teamService";
import * as userService from "../services/userService";
import { syncWomTeamRename } from "../services/womCompetitionService";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";

// Site-admin only — not just any bingo mod. Board/settings/team/moderator
// management is structural setup, distinct from mod.ts's day-of operational
// routes (submissions, signups, stage, draft) which stay open to every
// per-bingo mod.
const router = Router({ mergeParams: true });
router.use(requireAuth, requireBingo, requireAdmin);

// Every successful mutation here changes what other clients are looking at
// (board, settings, teams…), so tell them to refetch.
router.use((req, res, next) => {
  if (req.method !== "GET") {
    res.on("finish", () => {
      if (res.statusCode < 400) broadcast({ type: "bingo_changed", bingoId: req.bingo!.id, payload: {} });
    });
  }
  next();
});

// ---------------------------------------------------------------------------
// Bingo settings
// ---------------------------------------------------------------------------

router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const dateFields = ["signupOpensAt", "draftScheduledAt", "revealScheduledAt", "startsAt", "endsAt"] as const;
    const params: bingoService.UpdateBingoSettingsParams = {};
    for (const key of ["name", "description", "theme", "buyinAmount", "bonusPotAmount", "rulesMarkdown"] as const) {
      if (key in body) (params as Record<string, unknown>)[key] = body[key];
    }
    if ("signupMode" in body) {
      if (body.signupMode !== "solo" && body.signupMode !== "duo") throw new ServiceError(400, "signupMode must be solo or duo");
      params.signupMode = body.signupMode;
    }
    for (const key of dateFields) {
      if (key in body) (params as Record<string, unknown>)[key] = body[key] ? new Date(body[key] as string) : null;
    }
    if ("womEnabled" in body) {
      if (typeof body.womEnabled !== "boolean") throw new ServiceError(400, "womEnabled must be a boolean");
      params.womEnabled = body.womEnabled;
    }
    if ("womGroupId" in body) {
      params.womGroupId = body.womGroupId ? String(body.womGroupId).trim() : null;
    }
    if ("womGroupVerificationCode" in body) {
      // Write-only — the current value is never sent back to the client, so
      // an empty/absent field here always means "leave it as is" from the
      // settings form, never "clear it".
      const code = body.womGroupVerificationCode ? String(body.womGroupVerificationCode).trim() : "";
      if (code) params.womGroupVerificationCode = code;
    }
    const bingo = bingoService.updateBingoSettings(db, req.bingo!.id, params);
    res.json({ bingo: bingoService.toPublicBingo(bingo) });
  }),
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) ?? "";
    res.json({ users: q ? userService.searchUsers(db, q) : [] });
  }),
);

// ---------------------------------------------------------------------------
// Mods
// ---------------------------------------------------------------------------

router.get(
  "/mods",
  asyncHandler(async (req, res) => {
    res.json({ mods: bingoService.getModerators(db, req.bingo!.id) });
  }),
);
router.post(
  "/mods",
  asyncHandler(async (req, res) => {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new ServiceError(400, "userId is required");
    const mod = bingoService.addModerator(db, { bingoId: req.bingo!.id, userId });
    res.status(201).json({ mod });
  }),
);
router.delete(
  "/mods/:userId",
  asyncHandler(async (req, res) => {
    bingoService.removeModerator(db, { bingoId: req.bingo!.id, userId: req.params.userId as string });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

router.get(
  "/categories",
  asyncHandler(async (req, res) => {
    res.json({ categories: boardService.getCategories(db, req.bingo!.id) });
  }),
);
router.post(
  "/categories",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { label, colorHex, sortOrder } = req.body as { label?: string; colorHex?: string; sortOrder?: number };
    if (!label) throw new ServiceError(400, "label is required");
    const category = boardService.createCategory(db, { bingoId: req.bingo!.id, label, colorHex, sortOrder });
    res.status(201).json({ category });
  }),
);
router.patch(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const category = boardService.updateCategory(db, req.params.id as string, req.body);
    res.json({ category });
  }),
);
router.delete(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteCategory(db, req.params.id as string);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

router.post(
  "/tiles",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { name, boardRow, boardCol, categoryId, hasFreezePeriod, freezeDurationMinutes, notes } = req.body as {
      name?: string; boardRow?: number; boardCol?: number; categoryId?: string | null;
      hasFreezePeriod?: boolean; freezeDurationMinutes?: number; notes?: string | null;
    };
    if (!name || boardRow === undefined || boardCol === undefined) throw new ServiceError(400, "name, boardRow, and boardCol are required");
    const tile = boardService.createTile(db, { bingoId: req.bingo!.id, name, boardRow, boardCol, categoryId, hasFreezePeriod, freezeDurationMinutes, notes });
    res.status(201).json({ tile });
  }),
);
router.patch(
  "/tiles/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const tile = boardService.updateTile(db, req.params.id as string, req.body);
    res.json({ tile });
  }),
);
router.delete(
  "/tiles/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteTile(db, req.params.id as string);
    res.status(204).end();
  }),
);

const tileImageUpload = imageUpload(path.join(UPLOADS_DIR, "tiles"));
router.post(
  "/tiles/:id/image",
  tileImageUpload.single("image"),
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    if (!req.file) throw new ServiceError(400, "image is required");
    const tile = boardService.updateTile(db, req.params.id as string, { imageUrl: `/uploads/tiles/${req.file.filename}` });
    res.json({ tile });
  }),
);

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

router.post(
  "/tiles/:tileId/tasks",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { sortOrder, ...input } = req.body as GraphNodeInput & { sortOrder?: number };
    if (!input.kind) throw new ServiceError(400, "kind is required");
    const task = boardService.createTask(db, req.params.tileId as string, input, sortOrder);
    res.status(201).json({ task });
  }),
);
router.patch(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const task = boardService.updateNode(db, req.params.id as string, req.body as GraphNodeInput);
    res.json({ task });
  }),
);
router.delete(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteTask(db, req.params.id as string);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

router.get(
  "/lines",
  asyncHandler(async (req, res) => {
    res.json({ lines: boardService.getBoardLines(db, req.bingo!.id) });
  }),
);
router.post(
  "/lines/generate",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { pointsPerLine } = req.body as { pointsPerLine?: number };
    const lines = boardService.generateLines(db, req.bingo!, pointsPerLine);
    res.status(201).json({ lines });
  }),
);
router.patch(
  "/lines/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { points } = req.body as { points?: number };
    if (points === undefined) throw new ServiceError(400, "points is required");
    const line = boardService.updateLinePoints(db, req.params.id as string, points);
    res.json({ line });
  }),
);
router.delete(
  "/lines/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteLine(db, req.params.id as string);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Signup questions
// ---------------------------------------------------------------------------

router.get(
  "/questions",
  asyncHandler(async (req, res) => {
    res.json({ questions: signupService.getQuestions(db, req.bingo!.id) });
  }),
);
router.post(
  "/questions",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { prompt, type } = req.body as { prompt?: string; type?: string };
    if (!prompt || !type) throw new ServiceError(400, "prompt and type are required");
    const question = signupService.createQuestion(db, { bingoId: req.bingo!.id, ...req.body });
    res.status(201).json({ question });
  }),
);
router.patch(
  "/questions/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const question = signupService.updateQuestion(db, req.params.id as string, req.body);
    res.json({ question });
  }),
);
router.delete(
  "/questions/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    signupService.deleteQuestion(db, req.params.id as string);
    res.status(204).end();
  }),
);
router.post(
  "/questions/reorder",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { orderedIds } = req.body as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds)) throw new ServiceError(400, "orderedIds must be an array");
    signupService.reorderQuestions(db, req.bingo!.id, orderedIds);
    res.json({ questions: signupService.getQuestions(db, req.bingo!.id) });
  }),
);

// ---------------------------------------------------------------------------
// Teams (manual creation — stopgap until the Phase 7 draft flow exists)
// ---------------------------------------------------------------------------

router.get(
  "/captain-candidates",
  asyncHandler(async (req, res) => {
    res.json({ candidates: teamService.getCaptainCandidates(db, req.bingo!.id) });
  }),
);
router.post(
  "/teams",
  asyncHandler(async (req, res) => {
    const { captainUserId, coCaptainUserId, name } = req.body as { captainUserId?: string; coCaptainUserId?: string | null; name?: string };
    if (!captainUserId) throw new ServiceError(400, "captainUserId is required");
    const team = teamService.createTeam(db, { bingoId: req.bingo!.id, captainUserId, coCaptainUserId, name });
    res.status(201).json({ team });
  }),
);
router.patch(
  "/teams/:id",
  asyncHandler(async (req, res) => {
    const { name, color, codeword } = req.body as teamService.UpdateTeamParams;
    const team = teamService.updateTeam(db, req.params.id as string, { name, color, codeword });
    // Keep the WOM competition's roster labels in sync with renames made
    // from the admin panel too, not just the captain self-service route.
    if (name !== undefined) void syncWomTeamRename(db, req.bingo!.id);
    res.json({ team });
  }),
);
router.post(
  "/teams/:id/members",
  asyncHandler(async (req, res) => {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new ServiceError(400, "userId is required");
    const member = teamService.addTeamMember(db, req.params.id as string, userId);
    res.status(201).json({ member });
  }),
);
router.delete(
  "/teams/:id",
  asyncHandler(async (req, res) => {
    teamService.deleteTeam(db, req.params.id as string);
    res.status(204).end();
  }),
);
router.delete(
  "/teams/:id/members/:userId",
  asyncHandler(async (req, res) => {
    teamService.removeTeamMember(db, req.params.id as string, req.params.userId as string);
    res.status(204).end();
  }),
);

export default router;
