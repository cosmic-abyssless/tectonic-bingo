import { Router } from "express";
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
import * as wrappedArtService from "../services/wrappedArtService";
import { rescoreBingo } from "../services/scoringService";
import * as signupService from "../services/signupService";
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
    for (const key of ["name", "description", "theme", "buyinAmount", "bonusPotAmount", "rulesMarkdown"] as const) {
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
    // Validated and cleaned by the service (label, scope, names).
    if ("exclusivityRules" in body) params.exclusivityRules = body.exclusivityRules as never;
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
    const bingo = bingoService.updateBingoSettings(db, req.bingo!.id, params);
    // Rules decide which claims count, so a change re-scores every team (a rule added mid-event takes effect now).
    if (params.exclusivityRules !== undefined) rescoreBingo(db, req.bingo!.id);
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
    rescoreBingo(db, req.bingo!.id);
    res.status(201).json({ tile });
  }),
);
router.patch(
  "/tiles/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const tile = boardService.updateTile(db, req.params.id as string, req.body);
    rescoreBingo(db, req.bingo!.id);
    res.json({ tile });
  }),
);
router.delete(
  "/tiles/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteTile(db, req.params.id as string);
    rescoreBingo(db, req.bingo!.id);
    res.status(204).end();
  }),
);
router.patch(
  "/tiles/:id/bonus-points",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { points } = req.body as { points?: number };
    if (points === undefined) throw new ServiceError(400, "points is required");
    const tile = boardService.updateTileBonusPoints(db, req.params.id as string, points);
    rescoreBingo(db, req.bingo!.id);
    res.json({ tile });
  }),
);

const tileImageUpload = imageUpload(path.join(UPLOADS_DIR, "tiles"), { variants: true });
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
// Wrapped art (#262): cut-outs in groups (a section's Category images, or the side pool), each a transparent PNG or a
// screenshot on one solid colour (keyed out on the server), drawn as a sticker. Not tied to the stage: it's only
// shown once the Bingo is Finished.
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
// Tasks
// ---------------------------------------------------------------------------

router.post(
  "/tiles/:tileId/tasks",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const { sortOrder, ...input } = req.body as GraphNodeInput & { sortOrder?: number };
    if (!input.kind) throw new ServiceError(400, "kind is required");
    const task = boardService.createTask(db, req.params.tileId as string, input, sortOrder);
    rescoreBingo(db, req.bingo!.id);
    res.status(201).json({ task });
  }),
);
router.patch(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    const task = boardService.updateNode(db, req.params.id as string, req.body as GraphNodeInput);
    rescoreBingo(db, req.bingo!.id);
    res.json({ task });
  }),
);
// Changing a Task's Valued as mid-bingo: how many submissions already have a Drop value from it, and re-pricing them.
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
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteTask(db, req.params.id as string);
    rescoreBingo(db, req.bingo!.id);
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
    rescoreBingo(db, req.bingo!.id);
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
    rescoreBingo(db, req.bingo!.id);
    res.json({ line });
  }),
);
router.delete(
  "/lines/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertBoardEditable(req.bingo!);
    boardService.deleteLine(db, req.params.id as string);
    rescoreBingo(db, req.bingo!.id);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Signup questions
// ---------------------------------------------------------------------------

router.get(
  "/questions",
  asyncHandler(async (req, res) => {
    res.json({ questions: signupService.getQuestions(db, req.bingo!.id), answerCounts: signupService.getAnswerCounts(db, req.bingo!.id) });
  }),
);
router.post(
  "/questions",
  asyncHandler(async (req, res) => {
    bingoService.assertQuestionsEditable(req.bingo!);
    const { prompt, type } = req.body as { prompt?: string; type?: string };
    if (!prompt || !type) throw new ServiceError(400, "prompt and type are required");
    const question = signupService.createQuestion(db, { bingoId: req.bingo!.id, ...req.body });
    res.status(201).json({ question });
  }),
);
router.patch(
  "/questions/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertQuestionsEditable(req.bingo!);
    const question = signupService.updateQuestion(db, req.params.id as string, req.body);
    res.json({ question });
  }),
);
router.delete(
  "/questions/:id",
  asyncHandler(async (req, res) => {
    bingoService.assertQuestionsEditable(req.bingo!);
    signupService.deleteQuestion(db, req.params.id as string);
    res.status(204).end();
  }),
);
router.post(
  "/questions/reorder",
  asyncHandler(async (req, res) => {
    bingoService.assertQuestionsEditable(req.bingo!);
    const { orderedIds } = req.body as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds)) throw new ServiceError(400, "orderedIds must be an array");
    signupService.reorderQuestions(db, req.bingo!.id, orderedIds);
    res.json({ questions: signupService.getQuestions(db, req.bingo!.id) });
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
