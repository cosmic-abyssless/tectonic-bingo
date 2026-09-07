import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as bingoService from "../services/bingoService";
import * as itemGroupService from "../services/itemGroupService";
import * as userService from "../services/userService";
import { ServiceError } from "../services/errors";

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
    res.status(201).json({ bingo });
  }),
);

router.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
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

export default router;
