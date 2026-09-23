import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { isAdminDiscordId, UPLOADS_DIR } from "../config";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as bingoExportService from "../services/bingoExportService";
import * as itemGroupService from "../services/itemGroupService";
import * as bugReportService from "../services/bugReportService";
import * as pastWomCompetitionService from "../services/pastWomCompetitionService";
import * as userService from "../services/userService";
import { ServiceError } from "../services/errors";
import { queryAuditLog } from "../audit/query";
import type { AuditAction, AuditCategory, AuditEntityType, AuditLogFilters, AuditVisibility, BingoExportDocument } from "@bingo/shared";

const router = Router();
router.use(requireAuth, requireAdmin);

router.post(
  "/bingos",
  asyncHandler(async (req, res) => {
    const { slug, name, description, theme, boardRows, boardCols } = req.body as {
      slug?: string;
      name?: string;
      description?: string;
      theme?: string;
      boardRows?: number;
      boardCols?: number;
    };
    if (!slug || !name || !boardRows || !boardCols) {
      throw new ServiceError(400, "slug, name, boardRows, and boardCols are required");
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new ServiceError(400, "slug must be lowercase letters, numbers, and hyphens only");
    }
    const bingo = bingoService.createBingo(db, {
      slug,
      name,
      description,
      theme,
      boardRows,
      boardCols,
      createdByUserId: req.user!.id,
    });
    res.status(201).json({ bingo: bingoService.toPublicBingo(bingo) });
  }),
);

// Always creates a brand-new bingo from a previously exported document
// (GET /:slug/admin/export) — never overwrites an existing one.
router.post(
  "/bingos/import",
  asyncHandler(async (req, res) => {
    const { slug, name, document } = req.body as { slug?: string; name?: string; document?: BingoExportDocument };
    if (!slug || !document) throw new ServiceError(400, "slug and document are required");
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new ServiceError(400, "slug must be lowercase letters, numbers, and hyphens only");
    }
    const bingo = await bingoExportService.importBingoWithImages(db, document, { slug, name, createdByUserId: req.user!.id }, UPLOADS_DIR);
    res.status(201).json({ bingo: bingoService.toPublicBingo(bingo) });
  }),
);

router.delete(
  "/bingos/:id",
  asyncHandler(async (req, res) => {
    bingoService.deleteBingo(db, req.params.id as string);
    res.status(204).end();
  }),
);

// Only the admins listed in ADMIN_DISCORD_IDS may hand out site admin, so a
// granted admin can't fan the role out further.
router.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    if (!isAdminDiscordId(req.user!.discordId)) throw new ServiceError(403, "Only admins listed in ADMIN_DISCORD_IDS can grant site admin");
    const { isAdmin } = req.body as { isAdmin?: boolean };
    if (typeof isAdmin !== "boolean") throw new ServiceError(400, "isAdmin must be a boolean");
    const user = userService.setUserAdmin(db, req.params.id as string, isAdmin);
    res.json({ user });
  }),
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) ?? "";
    res.json({ users: q ? userService.searchUsers(db, q) : [] });
  }),
);

router.get(
  "/audit-log",
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string | undefined>;
    const filters: AuditLogFilters = {
      action: query.action ? (query.action.split(",") as AuditAction[]) : undefined,
      category: query.category ? (query.category.split(",") as AuditCategory[]) : undefined,
      actorUserId: query.actorUserId ? query.actorUserId.split(",") : undefined,
      teamId: query.teamId ? query.teamId.split(",") : undefined,
      entityType: query.entityType as AuditEntityType | undefined,
      entityId: query.entityId,
      visibility: query.visibility as AuditVisibility | undefined,
      since: query.since,
      until: query.until,
      q: query.q,
    };
    const page = { cursor: query.cursor ? Number(query.cursor) : undefined, limit: query.limit ? Number(query.limit) : undefined, condensed: query.condensed === "1" || query.condensed === "true" };
    // bingoId=<id> scopes to one bingo; "null" scopes to site-level entries; omitted means every bingo.
    const bingoId = query.bingoId === undefined ? "all" : query.bingoId === "null" ? null : query.bingoId;
    res.json(queryAuditLog(db, { bingoId }, filters, page));
  }),
);

// ---------------------------------------------------------------------------
// Item groups — global, reusable across bingos
// ---------------------------------------------------------------------------

router.get(
  "/item-groups",
  asyncHandler(async (_req, res) => {
    res.json({ itemGroups: itemGroupService.getItemGroups(db) });
  }),
);
router.post(
  "/item-groups",
  asyncHandler(async (req, res) => {
    const { name, description, itemNames } = req.body as Partial<itemGroupService.ItemGroupInput>;
    if (!name || !Array.isArray(itemNames)) throw new ServiceError(400, "name and itemNames are required");
    const itemGroup = itemGroupService.createItemGroup(db, { name, description, itemNames });
    res.status(201).json({ itemGroup });
  }),
);
router.patch(
  "/item-groups/:id",
  asyncHandler(async (req, res) => {
    const itemGroup = itemGroupService.updateItemGroup(db, req.params.id as string, req.body);
    res.json({ itemGroup });
  }),
);
router.delete(
  "/item-groups/:id",
  asyncHandler(async (req, res) => {
    itemGroupService.deleteItemGroup(db, req.params.id as string);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Past WOM competitions — global, one snapshot per (guild, WOM competition)
// ---------------------------------------------------------------------------

router.get(
  "/wom-competitions",
  asyncHandler(async (_req, res) => {
    res.json({ competitions: pastWomCompetitionService.listPastCompetitions(db) });
  }),
);
router.post(
  "/wom-competitions",
  asyncHandler(async (req, res) => {
    const { womId } = req.body as { womId?: number | string };
    const parsedWomId = Number(womId);
    if (!womId || !Number.isInteger(parsedWomId) || parsedWomId <= 0) throw new ServiceError(400, "womId must be a positive integer");
    const competition = await pastWomCompetitionService.addPastCompetition(db, { womId: parsedWomId, addedByUserId: req.user!.id });
    res.status(201).json({ competition });
  }),
);
router.delete(
  "/wom-competitions/:id",
  asyncHandler(async (req, res) => {
    pastWomCompetitionService.deletePastCompetition(db, req.params.id as string);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Bug reports — site-wide, submitted from the header button on any page
// ---------------------------------------------------------------------------

router.get(
  "/bug-reports",
  asyncHandler(async (_req, res) => {
    res.json({ bugReports: bugReportService.getBugReports(db) });
  }),
);
const BUG_REPORT_STATUSES = ["open", "resolved", "closed"] as const;

router.patch(
  "/bug-reports/:id",
  asyncHandler(async (req, res) => {
    const { status, resolutionMessage } = req.body as { status?: string; resolutionMessage?: string };
    if (!BUG_REPORT_STATUSES.includes(status as (typeof BUG_REPORT_STATUSES)[number])) {
      throw new ServiceError(400, `status must be one of ${BUG_REPORT_STATUSES.join(", ")}`);
    }
    const bugReport = bugReportService.setBugReportStatus(db, req.params.id as string, {
      status: status as (typeof BUG_REPORT_STATUSES)[number],
      actorUserId: req.user!.id,
      resolutionMessage: typeof resolutionMessage === "string" ? resolutionMessage : null,
    });
    res.json({ bugReport });
  }),
);

export default router;
