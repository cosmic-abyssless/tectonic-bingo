import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { requireBingoMod } from "../middleware/requireBingoMod";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as boardService from "../services/boardService";
import * as signupService from "../services/signupService";
import * as teamService from "../services/teamService";
import * as userService from "../services/userService";
import { ServiceError } from "../services/errors";

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBingo, requireBingoMod);

// ---------------------------------------------------------------------------
// Bingo settings
// ---------------------------------------------------------------------------

router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const dateFields = ["signupOpensAt", "draftScheduledAt", "revealScheduledAt", "startsAt", "endsAt"] as const;
    const params: bingoService.UpdateBingoSettingsParams = {};
    for (const key of ["name", "description", "theme", "buyinAmount", "potAmount", "rulesMarkdown", "aiHint"] as const) {
      if (key in body) (params as Record<string, unknown>)[key] = body[key];
    }
    for (const key of dateFields) {
      if (key in body) (params as Record<string, unknown>)[key] = body[key] ? new Date(body[key] as string) : null;
    }
    const bingo = bingoService.updateBingoSettings(db, req.bingo!.id, params);
    res.json({ bingo });
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

const TILE_UPLOADS_DIR = path.join(__dirname, "../../uploads/tiles");
fs.mkdirSync(TILE_UPLOADS_DIR, { recursive: true });
const tileImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TILE_UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 11)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});
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
    const { label, sortOrder, points, description } = req.body as { label?: string; sortOrder?: number; points?: number; description?: string };
    if (!label || sortOrder === undefined || points === undefined || !description) {
      throw new ServiceError(400, "label, sortOrder, points, and description are required");
    }
    const task = boardService.createTask(db, { tileId: req.params.tileId as string, ...req.body });
    res.status(201).json({ task });
  }),
);
router.patch(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const task = boardService.updateTask(db, req.params.id as string, req.body);
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
// Task items
// ---------------------------------------------------------------------------

router.post(
  "/tasks/:taskId/items",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { itemName } = req.body as { itemName?: string };
    if (!itemName) throw new ServiceError(400, "itemName is required");
    const item = boardService.createTaskItem(db, { taskId: req.params.taskId as string, ...req.body });
    res.status(201).json({ item });
  }),
);
router.patch(
  "/items/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const item = boardService.updateTaskItem(db, req.params.id as string, req.body);
    res.json({ item });
  }),
);
router.delete(
  "/items/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteTaskItem(db, req.params.id as string);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Wildcards
// ---------------------------------------------------------------------------

router.post(
  "/tiles/:tileId/wildcards",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { itemName } = req.body as { itemName?: string };
    if (!itemName) throw new ServiceError(400, "itemName is required");
    const wildcard = boardService.createWildcard(db, { tileId: req.params.tileId as string, ...req.body });
    res.status(201).json({ wildcard });
  }),
);
router.patch(
  "/wildcards/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const wildcard = boardService.updateWildcard(db, req.params.id as string, req.body);
    res.json({ wildcard });
  }),
);
router.delete(
  "/wildcards/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteWildcard(db, req.params.id as string);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

router.get(
  "/lines",
  asyncHandler(async (req, res) => {
    res.json({ lines: boardService.getLines(db, req.bingo!.id) });
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
    const line = boardService.updateLine(db, req.params.id as string, points);
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

router.post(
  "/teams",
  asyncHandler(async (req, res) => {
    const { captainUserId, name } = req.body as { captainUserId?: string; name?: string };
    if (!captainUserId) throw new ServiceError(400, "captainUserId is required");
    const team = teamService.createTeam(db, { bingoId: req.bingo!.id, captainUserId, name });
    res.status(201).json({ team });
  }),
);
router.patch(
  "/teams/:id",
  asyncHandler(async (req, res) => {
    const team = teamService.updateTeam(db, req.params.id as string, req.body);
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
  "/teams/:id/members/:userId",
  asyncHandler(async (req, res) => {
    teamService.removeTeamMember(db, req.params.id as string, req.params.userId as string);
    res.status(204).end();
  }),
);

export default router;
