import { Router, type Request } from "express";
import { CUT_MODES, isAchievementKey, type AchievementKey, type AppliedCutChange, type CutChange, type CutMode, type GraphNodeInput } from "@bingo/shared";
import * as achievementService from "../services/achievementService";
import path from "path";
import { UPLOADS_DIR } from "../config";
import { imageUpload } from "../middleware/upload";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as bingoExportService from "../services/bingoExportService";
import * as boardService from "../services/boardService";
import * as boardDraftService from "../services/boardDraftService";
import { removeUploads } from "../services/uploadFiles";
import * as wrappedArtService from "../services/wrappedArtService";
import * as signupService from "../services/signupService";
import { assertUserCan } from "../services/permissions";
import { QUESTION_FORMS, type QuestionForm } from "@bingo/shared";
import * as superlativeService from "../services/superlativeService";
import * as teamService from "../services/teamService";
import * as cutReviewService from "../services/cutReviewService";
import * as userService from "../services/userService";
import * as memberPickService from "../services/memberPickService";
import { getTectonicMembership, matchRsn } from "../services/tectonicMembership";
import { fetchAndPersistPlayerStats } from "../services/playerStatsService";
import { checkWomGroup, syncWomCompetition } from "../services/womCompetitionService";
import { auditSkip } from "../audit/middleware";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";
import { countPricedSubmissions, repriceNodeClaims } from "../services/gpRepriceService";

// Site-admin only — not just any bingo mod. Board/settings/team/moderator
// management is structural setup, distinct from mod.ts's day-of operational
// routes (submissions, signups, stage, draft) which stay open to every
// per-bingo mod.
const router = Router({ mergeParams: true });
router.use(requireAuth, requireBingo, requireAdmin);

// Every successful mutation here changes what other clients are looking at
// (board, settings, teams…), so tell them to refetch. (A read-only POST sets res.locals.readOnly.)
router.use((req, res, next) => {
  if (req.method !== "GET") {
    res.on("finish", () => {
      if (res.statusCode < 400 && !res.locals.readOnly) broadcast({ type: "bingo_changed", bingoId: req.bingo!.id, payload: {} });
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
    for (const key of ["name", "description", "theme", "buyinAmount", "bonusPotAmount"] as const) {
      if (key in body) (params as Record<string, unknown>)[key] = body[key];
    }
    if ("signupMode" in body) {
      if (body.signupMode !== "solo" && body.signupMode !== "duo") throw new ServiceError(400, "signupMode must be solo or duo");
      params.signupMode = body.signupMode;
    }
    if ("cutMode" in body) {
      if (!(CUT_MODES as readonly unknown[]).includes(body.cutMode)) throw new ServiceError(400, `cutMode must be one of ${CUT_MODES.join(", ")}`);
      params.cutMode = body.cutMode as CutMode;
    }
    if ("warnLeftovers" in body) params.warnLeftovers = !!body.warnLeftovers;
    // Sealed Tiles and Hide rules (CONTEXT.md "Sealed Tiles"): only take effect during Board revealed.
    for (const key of ["sealedTiles", "hideRules"] as const) {
      if (!(key in body)) continue;
      if (typeof body[key] !== "boolean") throw new ServiceError(400, `${key} must be a boolean`);
      params[key] = body[key];
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
    // Achievements (CONTEXT.md "Achievement"): the master switch, and/or a partial map of per-Achievement switches.
    if ("showScreenshotsWhenFinished" in body) {
      if (typeof body.showScreenshotsWhenFinished !== "boolean") throw new ServiceError(400, "showScreenshotsWhenFinished must be a boolean");
      params.showScreenshotsWhenFinished = body.showScreenshotsWhenFinished;
    }
    if ("publishWrappedOnFinish" in body) {
      if (typeof body.publishWrappedOnFinish !== "boolean") throw new ServiceError(400, "publishWrappedOnFinish must be a boolean");
      params.publishWrappedOnFinish = body.publishWrappedOnFinish;
    }
    if ("achievementsEnabled" in body) {
      if (typeof body.achievementsEnabled !== "boolean") throw new ServiceError(400, "achievementsEnabled must be a boolean");
      params.achievementsEnabled = body.achievementsEnabled;
    }
    if ("achievements" in body) {
      const raw = body.achievements;
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ServiceError(400, "achievements must be an object of key -> boolean");
      const switches: Partial<Record<AchievementKey, boolean>> = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!isAchievementKey(key)) throw new ServiceError(400, `Unknown achievement key: ${key}`);
        if (typeof value !== "boolean") throw new ServiceError(400, `achievements.${key} must be a boolean`);
        switches[key] = value;
      }
      params.achievements = switches;
    }
    // The Exclusive Item rules and the Rules text go through the Draft board with the Board (CONTEXT.md "Draft board"):
    // published, and only then scored, with it. Every other setting saves straight away.
    if ("rulesMarkdown" in body || "exclusivityRules" in body) {
      bingoService.assertBoardEditable(req.bingo!);
      boardDraftService.updateDraftRules(db, req.bingo!.id, req.user!.id, {
        ...("rulesMarkdown" in body ? { rulesMarkdown: body.rulesMarkdown as string | null } : {}),
        ...("exclusivityRules" in body ? { exclusivityRules: body.exclusivityRules } : {}),
      });
    }
    // Only the draft's two fields sent: nothing else to save (an empty update is no update).
    const bingo = Object.keys(params).length ? bingoService.updateBingoSettings(db, req.bingo!.id, params) : bingoService.getBingoBySlug(db, req.bingo!.slug)!;
    // The WOM competition carries the bingo's name and dates (fire-and-forget; a no-op without a competition).
    if (params.name !== undefined || params.startsAt !== undefined || params.endsAt !== undefined) void syncWomCompetition(db, req.bingo!.id);
    res.json({ bingo: bingoService.toPublicBingo(bingo) });
  }),
);

// Test connection: checks a WOM group id and verification code without changing anything, on WOM or here. A POST so
// the code stays out of the URL. Each comes from the form if typed there, before saving; otherwise the saved one (the
// saved code is never sent to the client, so a blank code field means the saved code).
router.post(
  "/settings/wom-check",
  auditSkip("read-only WOM credential check"),
  asyncHandler(async (req, res) => {
    res.locals.readOnly = true;
    const body = req.body as { groupId?: unknown; verificationCode?: unknown };
    const groupId = String(body.groupId || req.bingo!.womGroupId || "").trim();
    const verificationCode = String(body.verificationCode || req.bingo!.womGroupVerificationCode || "").trim();
    res.json(await checkWomGroup(groupId, verificationCode));
  }),
);

// Every catalogue Achievement's current switch state, for the settings form's "Achievements" section — see
// achievementService.getAchievementSettings. The master switch is on the bingo shell (achievementsEnabled).
router.get(
  "/achievements",
  asyncHandler(async (req, res) => {
    res.json({ achievements: achievementService.getAchievementSettings(db, req.bingo!.id) });
  }),
);

// The portable board+settings document (issue #36) — see bingoExportService.ts.
router.get(
  "/export",
  asyncHandler(async (req, res) => {
    // Tile images are embedded unless the caller opts out (?images=0): the file is much bigger with them.
    res.json(bingoExportService.exportBingo(db, req.bingo!.id, req.query.images === "0" ? {} : { uploadsDir: UPLOADS_DIR }));
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
// Staff (CONTEXT.md "Staff"): granted next to the Moderators. Removing someone tells them with access_changed
// (broadcastAccessChanges), so an open Buy-ins page sends them away.
// ---------------------------------------------------------------------------

router.get(
  "/staff",
  asyncHandler(async (req, res) => {
    res.json({ staff: bingoService.getStaff(db, req.bingo!.id) });
  }),
);
router.post(
  "/staff",
  asyncHandler(async (req, res) => {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new ServiceError(400, "userId is required");
    const staff = bingoService.addStaff(db, { bingoId: req.bingo!.id, userId });
    res.status(201).json({ staff });
  }),
);
router.delete(
  "/staff/:userId",
  asyncHandler(async (req, res) => {
    bingoService.removeStaff(db, { bingoId: req.bingo!.id, userId: req.params.userId as string });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// The Draft board (CONTEXT.md "Draft board", "Publish"). Every edit to the Board below (its Categories, Tiles, Tasks
// and Lines) is made to the Draft board, which nobody but Admins sees, and reaches Players only when an Admin
// publishes it: nothing is rescored until then. An edit is audited by the Publish it goes out with, not on its own.
// ---------------------------------------------------------------------------

const DRAFT_EDIT = "Draft board edit: audited when it's published (board.published)";

/** Runs a board edit on the Draft board, for the Admin making the request. */
function editDraft<T>(req: Request, edit: (t: boardDraftService.BoardTablesArg) => T): T {
  bingoService.assertBoardEditable(req.bingo!);
  return boardDraftService.editDraft(db, req.bingo!.id, req.user!.id, edit);
}

// The board the editor shows: the Draft board while there are unpublished changes, else the Published board.
router.get(
  "/board-draft",
  asyncHandler(async (req, res) => {
    res.json(boardDraftService.getEditorBoard(db, req.bingo!.id));
  }),
);
router.get(
  "/board-draft/status",
  asyncHandler(async (req, res) => {
    res.json({ status: boardDraftService.getDraftStatus(db, req.bingo!.id) });
  }),
);
// What publishing would change: the diff, Claims it stops counting, and each Team's points before and after.
router.get(
  "/board-draft/preview",
  asyncHandler(async (req, res) => {
    res.json({ preview: boardDraftService.getPublishPreview(db, req.bingo!.id) });
  }),
);
// The Exclusive Item rules and the Rules text, which go through the draft with the Board.
router.patch(
  "/board-draft/rules",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { rulesMarkdown?: unknown; exclusivityRules?: unknown };
    bingoService.assertBoardEditable(req.bingo!);
    boardDraftService.updateDraftRules(db, req.bingo!.id, req.user!.id, {
      ...("rulesMarkdown" in body ? { rulesMarkdown: body.rulesMarkdown as string | null } : {}),
      ...("exclusivityRules" in body ? { exclusivityRules: body.exclusivityRules } : {}),
    });
    res.json({ status: boardDraftService.getDraftStatus(db, req.bingo!.id) });
  }),
);
// Publish exactly the draft the Admin previewed (its `revision`), then rescore every Team.
router.post(
  "/board-draft/publish",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { revision } = (req.body ?? {}) as { revision?: unknown };
    const { preview, files } = boardDraftService.publishDraft(db, req.bingo!, revision, req.user!.id);
    removeUploads(UPLOADS_DIR, files);
    res.json({ preview });
  }),
);
router.post(
  "/board-draft/discard",
  asyncHandler(async (req, res) => {
    const { files } = boardDraftService.discardDraft(db, req.bingo!, req.user!.id);
    removeUploads(UPLOADS_DIR, files);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

router.get(
  "/categories",
  asyncHandler(async (req, res) => {
    res.json({ categories: boardService.getCategories(db, req.bingo!.id, boardDraftService.editorTables(db, req.bingo!.id)) });
  }),
);
router.post(
  "/categories",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const { label, colorHex, sortOrder } = req.body as { label?: string; colorHex?: string; sortOrder?: number };
    if (!label) throw new ServiceError(400, "label is required");
    const category = editDraft(req, (t) => boardService.createCategory(db, { bingoId: req.bingo!.id, label, colorHex, sortOrder }, t));
    res.status(201).json({ category });
  }),
);
router.patch(
  "/categories/:id",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const category = editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "category", id);
      return boardService.updateCategory(db, id, req.body, t);
    });
    res.json({ category });
  }),
);
router.delete(
  "/categories/:id",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "category", id);
      boardService.deleteCategory(db, id, t);
    });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

router.post(
  "/tiles",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const { name, boardRow, boardCol, categoryId, hasFreezePeriod, freezeDurationMinutes, notes } = req.body as {
      name?: string; boardRow?: number; boardCol?: number; categoryId?: string | null;
      hasFreezePeriod?: boolean; freezeDurationMinutes?: number; notes?: string | null;
    };
    if (!name || boardRow === undefined || boardCol === undefined) throw new ServiceError(400, "name, boardRow, and boardCol are required");
    const tile = editDraft(req, (t) => boardService.createTile(db, { bingoId: req.bingo!.id, name, boardRow, boardCol, categoryId, hasFreezePeriod, freezeDurationMinutes, notes }, t));
    res.status(201).json({ tile });
  }),
);
router.patch(
  "/tiles/:id",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const tile = editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "tile", id);
      return boardService.updateTile(db, id, req.body, t);
    });
    res.json({ tile });
  }),
);
router.delete(
  "/tiles/:id",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "tile", id, { allowMissing: true });
      boardService.deleteTile(db, id, t);
    });
    res.status(204).end();
  }),
);
router.patch(
  "/tiles/:id/bonus-points",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const { points } = req.body as { points?: number };
    if (points === undefined) throw new ServiceError(400, "points is required");
    const id = req.params.id as string;
    const tile = editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "tile", id);
      return boardService.updateTileBonusPoints(db, id, points, t);
    });
    res.json({ tile });
  }),
);

// The picture is stored at once, but only the Draft board points at it: Players see it once it's published.
const tileImageUpload = imageUpload(path.join(UPLOADS_DIR, "tiles"), { variants: true });
router.post(
  "/tiles/:id/image",
  auditSkip(DRAFT_EDIT),
  tileImageUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ServiceError(400, "image is required");
    const id = req.params.id as string;
    const imageUrl = `/uploads/tiles/${req.file.filename}`;
    const tile = editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "tile", id);
      return boardService.updateTile(db, id, { imageUrl }, t);
    });
    res.json({ tile });
  }),
);

// ---------------------------------------------------------------------------
// Wrapped art (#262): cut-outs in groups (a section's Category images, the side pool or the Player card art), each a
// transparent PNG or a screenshot on one solid colour (keyed out on the server), drawn as a sticker. Not tied to the
// stage: it's only shown once the Bingo is Finished.
// ---------------------------------------------------------------------------

const wrappedArtUpload = imageUpload();
router.get(
  "/wrapped-art",
  asyncHandler(async (req, res) => {
    res.json({ art: wrappedArtService.listArt(db, req.bingo!.id), additionalCredits: wrappedArtService.additionalCredits(db, req.bingo!.id) });
  }),
);
router.post(
  "/wrapped-art/:group",
  wrappedArtUpload.single("image"),
  asyncHandler(async (req, res) => {
    const group = wrappedArtService.parseGroup(req.params.group);
    if (!req.file) throw new ServiceError(400, "image is required");
    const keying = wrappedArtService.parseKeying(req.body ?? {});
    res.status(201).json({ art: await wrappedArtService.addArt(db, UPLOADS_DIR, req.bingo!, group, req.file.buffer, keying) });
  }),
);
router.put(
  "/wrapped-art/:group/order",
  asyncHandler(async (req, res) => {
    const group = wrappedArtService.parseGroup(req.params.group);
    res.json({ art: wrappedArtService.reorderArt(db, req.bingo!, group, (req.body as { ids?: unknown })?.ids) });
  }),
);
// Credits (CONTEXT.md): a category's additional credits (no image), replaced as a whole list.
router.put(
  "/wrapped-art/:group/credits",
  asyncHandler(async (req, res) => {
    const section = wrappedArtService.parseSection(req.params.group);
    res.json({ additionalCredits: wrappedArtService.setAdditionalCredits(db, req.bingo!, section, (req.body as { credits?: unknown })?.credits) });
  }),
);
router.post(
  "/wrapped-art/images/:id",
  wrappedArtUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ServiceError(400, "image is required");
    const keying = wrappedArtService.parseKeying(req.body ?? {});
    res.json({ art: await wrappedArtService.replaceArt(db, UPLOADS_DIR, req.bingo!, req.params.id as string, req.file.buffer, keying) });
  }),
);
router.post(
  "/wrapped-art/images/:id/recut",
  asyncHandler(async (req, res) => {
    const keying = wrappedArtService.parseKeying(req.body ?? {});
    res.json({ art: await wrappedArtService.recutArt(db, UPLOADS_DIR, req.bingo!, req.params.id as string, keying) });
  }),
);
// Credits (CONTEXT.md): one image's credit; null (or a blank name) clears it.
router.put(
  "/wrapped-art/images/:id/credit",
  asyncHandler(async (req, res) => {
    res.json({ art: wrappedArtService.setArtCredit(db, req.bingo!, req.params.id as string, (req.body as { credit?: unknown })?.credit ?? null) });
  }),
);
router.delete(
  "/wrapped-art/images/:id",
  asyncHandler(async (req, res) => {
    wrappedArtService.removeArt(db, req.bingo!, req.params.id as string);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Tasks (on the Draft board, like the rest of the Board above)
// ---------------------------------------------------------------------------

router.post(
  "/tiles/:tileId/tasks",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const { sortOrder, ...input } = req.body as GraphNodeInput & { sortOrder?: number };
    if (!input.kind) throw new ServiceError(400, "kind is required");
    const tileId = req.params.tileId as string;
    const task = editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "tile", tileId);
      return boardService.createTask(db, tileId, input, sortOrder, t);
    });
    res.status(201).json({ task });
  }),
);
router.patch(
  "/tasks/:id",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const task = editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "node", id);
      return boardService.updateNode(db, id, req.body as GraphNodeInput, t);
    });
    res.json({ task });
  }),
);
// Changing a Task's Valued as mid-bingo: how many submissions already have a Drop value from it, and re-pricing them
// (from the Published board's Valued as: a draft's isn't anyone's yet).
router.get(
  "/nodes/:nodeId/priced-submissions",
  asyncHandler(async (req, res) => {
    res.json({ count: countPricedSubmissions(db, req.bingo!.id, req.params.nodeId as string) });
  }),
);
router.post(
  "/nodes/:nodeId/reprice",
  asyncHandler(async (req, res) => {
    res.json({ repriced: await repriceNodeClaims(db, req.bingo!.id, req.params.nodeId as string) });
  }),
);

router.delete(
  "/tasks/:id",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "node", id, { allowMissing: true });
      boardService.deleteTask(db, id, t);
    });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Lines (on the Draft board too)
// ---------------------------------------------------------------------------

router.get(
  "/lines",
  asyncHandler(async (req, res) => {
    res.json({ lines: boardService.getBoardLines(db, req.bingo!.id, boardDraftService.editorTables(db, req.bingo!.id)) });
  }),
);
router.post(
  "/lines/generate",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const { pointsPerLine } = req.body as { pointsPerLine?: number };
    const lines = editDraft(req, (t) => boardService.generateLines(db, req.bingo!, pointsPerLine, t));
    res.status(201).json({ lines });
  }),
);
router.patch(
  "/lines/:id",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const { points } = req.body as { points?: number };
    if (points === undefined) throw new ServiceError(400, "points is required");
    const id = req.params.id as string;
    const line = editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "line", id);
      return boardService.updateLinePoints(db, id, points, t);
    });
    res.json({ line });
  }),
);
router.delete(
  "/lines/:id",
  auditSkip(DRAFT_EDIT),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    editDraft(req, (t) => {
      boardDraftService.assertOnBoard(db, t, req.bingo!.id, "line", id, { allowMissing: true });
      boardService.deleteLine(db, id, t);
    });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Signup questions
// ---------------------------------------------------------------------------

// The signup form's questions, and (with form "feedback") the Feedback form's, built the same way (CONTEXT.md "Feedback
// question"). Signup questions are locked once play starts; Feedback questions can be edited at any stage.

/** The form a request is about: `value` ("signup" when absent), refused if it isn't one. */
function formOf(value: unknown): QuestionForm {
  if (value === undefined) return "signup";
  if (!(QUESTION_FORMS as readonly unknown[]).includes(value)) throw new ServiceError(400, `form must be one of ${QUESTION_FORMS.join(", ")}`);
  return value as QuestionForm;
}

/** Whether this question's form may be edited now: Feedback questions always (by whoever may manage them), signup questions until play starts. */
function assertQuestionsOpen(req: Request, form: QuestionForm): void {
  if (form === "feedback") assertUserCan(db, req.bingo!, req.user!, "manage_feedback_questions", { role: new ServiceError(403, "Admin access required") });
  else bingoService.assertQuestionsEditable(req.bingo!);
}

router.get(
  "/questions",
  asyncHandler(async (req, res) => {
    const form = formOf(req.query.form);
    if (form === "feedback") assertQuestionsOpen(req, form);
    res.json({ questions: signupService.getQuestions(db, req.bingo!.id, form), answerCounts: signupService.getAnswerCounts(db, req.bingo!.id) });
  }),
);
router.post(
  "/questions",
  asyncHandler(async (req, res) => {
    const form = formOf((req.body as { form?: unknown }).form);
    assertQuestionsOpen(req, form);
    const { prompt, type } = req.body as { prompt?: string; type?: string };
    if (!prompt || !type) throw new ServiceError(400, "prompt and type are required");
    const question = signupService.createQuestion(db, { bingoId: req.bingo!.id, ...req.body, form });
    res.status(201).json({ question });
  }),
);
router.patch(
  "/questions/:id",
  asyncHandler(async (req, res) => {
    const existing = signupService.getQuestionById(db, req.params.id as string);
    if (!existing || existing.bingoId !== req.bingo!.id) throw new ServiceError(404, "Question not found");
    assertQuestionsOpen(req, existing.form);
    const question = signupService.updateQuestion(db, existing.id, req.body);
    res.json({ question });
  }),
);
router.delete(
  "/questions/:id",
  asyncHandler(async (req, res) => {
    const existing = signupService.getQuestionById(db, req.params.id as string);
    if (existing && existing.bingoId !== req.bingo!.id) throw new ServiceError(404, "Question not found");
    assertQuestionsOpen(req, existing?.form ?? "signup");
    signupService.deleteQuestion(db, req.params.id as string);
    res.status(204).end();
  }),
);
router.post(
  "/questions/reorder",
  asyncHandler(async (req, res) => {
    const form = formOf((req.body as { form?: unknown }).form);
    assertQuestionsOpen(req, form);
    const { orderedIds } = req.body as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds)) throw new ServiceError(400, "orderedIds must be an array");
    signupService.reorderQuestions(db, req.bingo!.id, orderedIds, form);
    res.json({ questions: signupService.getQuestions(db, req.bingo!.id, form) });
  }),
);

// ---------------------------------------------------------------------------
// Superlative categories (CONTEXT.md "Superlative") — not locked to any stage
// ---------------------------------------------------------------------------

router.get(
  "/superlatives",
  asyncHandler(async (req, res) => {
    res.json({ categories: superlativeService.getCategories(db, req.bingo!.id) });
  }),
);
router.post(
  "/superlatives",
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    if (!name) throw new ServiceError(400, "name is required");
    const category = superlativeService.createCategory(db, { bingoId: req.bingo!.id, name });
    res.status(201).json({ category });
  }),
);
router.patch(
  "/superlatives/:id",
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    if (!name) throw new ServiceError(400, "name is required");
    const category = superlativeService.renameCategory(db, req.params.id as string, name);
    res.json({ category });
  }),
);
router.delete(
  "/superlatives/:id",
  asyncHandler(async (req, res) => {
    superlativeService.deleteCategory(db, req.params.id as string);
    res.status(204).end();
  }),
);
router.post(
  "/superlatives/reorder",
  asyncHandler(async (req, res) => {
    const { orderedIds } = req.body as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds)) throw new ServiceError(400, "orderedIds must be an array");
    superlativeService.reorderCategories(db, req.bingo!.id, orderedIds);
    res.json({ categories: superlativeService.getCategories(db, req.bingo!.id) });
  }),
);

// ---------------------------------------------------------------------------
// Teams (manual creation — stopgap until the Phase 7 draft flow exists)
// ---------------------------------------------------------------------------

router.get(
  "/captain-candidates",
  asyncHandler(async (req, res) => {
    res.json({
      candidates: teamService.getCaptainCandidates(db, req.bingo!.id),
      teamsNotLedByPairs: teamService.teamsNotLedByPairs(db, req.bingo!.id).map((t) => t.teamId),
    });
  }),
);
router.post(
  "/teams",
  asyncHandler(async (req, res) => {
    const { captainUserId, coCaptainUserId, name } = req.body as { captainUserId?: string; coCaptainUserId?: string | null; name?: string };
    if (!captainUserId) throw new ServiceError(400, "captainUserId is required");
    const team = teamService.createTeam(db, { bingoId: req.bingo!.id, captainUserId, coCaptainUserId, name });
    void syncWomCompetition(db, req.bingo!.id);
    res.status(201).json({ team });
  }),
);
router.patch(
  "/teams/:id",
  asyncHandler(async (req, res) => {
    const { name, color, codeword } = req.body as teamService.UpdateTeamParams;
    const team = teamService.updateTeam(db, req.params.id as string, { name, color, codeword });
    // Keep the WOM competition's team names in sync with renames made
    // from the admin panel too, not just the captain self-service route.
    if (name !== undefined) void syncWomCompetition(db, req.bingo!.id);
    res.json({ team });
  }),
);
router.post(
  "/teams/:id/members",
  asyncHandler(async (req, res) => {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new ServiceError(400, "userId is required");
    const member = teamService.addTeamMember(db, req.params.id as string, userId, req.bingo!.id);
    void syncWomCompetition(db, req.bingo!.id);
    res.status(201).json({ member });
  }),
);
router.delete(
  "/teams/:id",
  asyncHandler(async (req, res) => {
    teamService.deleteTeam(db, req.params.id as string);
    void syncWomCompetition(db, req.bingo!.id);
    res.status(204).end();
  }),
);
// From Board revealed on this is Remove from Team (CONTEXT.md "Team"): an optional reason, and for a Captain or
// co-captain the member who takes over their role. It also withdraws their Signup, so the roster changes too.
router.delete(
  "/teams/:id/members/:userId",
  asyncHandler(async (req, res) => {
    const { reason, replacementUserId } = (req.body ?? {}) as { reason?: unknown; replacementUserId?: unknown };
    if (reason !== undefined && reason !== null && typeof reason !== "string") throw new ServiceError(400, "reason must be a string");
    if (replacementUserId !== undefined && replacementUserId !== null && typeof replacementUserId !== "string") throw new ServiceError(400, "replacementUserId must be a string");
    teamService.removeTeamMember(db, req.params.id as string, req.params.userId as string, { bingoId: req.bingo!.id, reason, replacementUserId });
    void syncWomCompetition(db, req.bingo!.id);
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Late signup (CONTEXT.md "Signup") — an Admin signs a clan member up on their behalf once Signups are closed.
// ---------------------------------------------------------------------------

// Who can be signed up late: every clan member who has logged in, as the Member pick question offers them.
router.get(
  "/late-signup/members",
  asyncHandler(async (_req, res) => {
    res.json({ members: memberPickService.getPickableMembers(db) });
  }),
);

// One member's clan RSNs, for the late signup's RSN (the first is the default).
router.get(
  "/late-signup/rsns/:userId",
  asyncHandler(async (req, res) => {
    const user = userService.getUserById(db, req.params.userId as string);
    if (!user) throw new ServiceError(404, "User not found");
    const { member } = await getTectonicMembership(user.discordId);
    res.json({ rsns: (member?.rsns ?? []).map((r) => r.rsn) });
  }),
);

router.post(
  "/late-signups",
  asyncHandler(async (req, res) => {
    const { userId, rsn, teamId } = req.body as { userId?: unknown; rsn?: unknown; teamId?: unknown };
    if (typeof userId !== "string" || !userId) throw new ServiceError(400, "userId is required");
    if (typeof rsn !== "string" || !rsn.trim()) throw new ServiceError(400, "rsn is required");
    if (teamId !== undefined && teamId !== null && typeof teamId !== "string") throw new ServiceError(400, "teamId must be a string");
    const user = userService.getUserById(db, userId);
    if (!user) throw new ServiceError(404, "User not found");
    const { member } = await getTectonicMembership(user.discordId);
    const signup = signupService.createLateSignup(db, req.bingo!, { userId, rsn, teamId: teamId || null, ...matchRsn(member, rsn) });
    void fetchAndPersistPlayerStats(db, signup.id, signup.rsn, { discordId: user.discordId, linkedRsns: (member?.rsns ?? []).map((r) => r.rsn) });
    if (teamId) void syncWomCompetition(db, req.bingo!.id);
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(201).json({ signup });
  }),
);

// ---------------------------------------------------------------------------
// Cut review (CONTEXT.md "Cut review") — Admin-only: propose/score/apply the plan the Signups tab and the
// move-to-Draft confirmation point to (GET .../mod/draft/cut-review, visible to any mod).
// ---------------------------------------------------------------------------

// Read-only: scores a change list (typically the proposed plan, edited) without touching anything, for the Cut
// review modal's live "This plan leaves N players cut" count.
router.post(
  "/cut-review/score",
  auditSkip("read-only Cut review scoring — no state changes"),
  asyncHandler(async (req, res) => {
    const { changes } = req.body as { changes?: CutChange[] };
    if (!Array.isArray(changes)) throw new ServiceError(400, "changes must be an array");
    res.locals.readOnly = true;
    res.json(cutReviewService.scoreCutChanges(db, req.bingo!, changes));
  }),
);

router.post(
  "/cut-review/apply",
  asyncHandler(async (req, res) => {
    const { changes } = req.body as { changes?: AppliedCutChange[] };
    if (!Array.isArray(changes)) throw new ServiceError(400, "changes must be an array");
    for (const change of changes) {
      if (change.kind === "pair" && (!Array.isArray(change.userIds) || change.userIds.length !== 2)) {
        throw new ServiceError(400, "A pair change needs two userIds");
      }
      if (change.kind === "split" && !change.pairingId) throw new ServiceError(400, "A split change needs a pairingId");
      if (change.kind === "addTeam" && !change.captainUserId) throw new ServiceError(400, "An added Team needs a captainUserId");
      if (change.kind === "removeTeam" && !change.teamId) throw new ServiceError(400, "A removed Team needs a teamId");
    }
    const result = cutReviewService.applyCutReview(db, req.bingo!, changes, req.user!.id);
    void syncWomCompetition(db, req.bingo!.id);
    res.json(result);
  }),
);

export default router;
