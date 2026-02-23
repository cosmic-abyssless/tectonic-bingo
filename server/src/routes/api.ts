import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth";
import { db } from "../db";
import {
  bingoEvents,
  tiles,
  tileSides,
  tileSideItems,
  tileWildcards,
  teams,
  users,
  teamTileProgress,
  teamCompletedLines,
  teamPointAdjustments,
  submissions,
  submissionScreenshots,
  submissionItemClaims,
} from "../db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import type { DiscordUser } from "../types";

// ---------------------------------------------------------------------------
// Multer — store screenshots on local disk
// ---------------------------------------------------------------------------
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 11)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

// Get current authenticated user
router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// Health check (no auth required)
router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// GET /api/board — full board for the active event (no auth required for read)
router.get("/board", async (_req: Request, res: Response) => {
  const [event] = await db
    .select()
    .from(bingoEvents)
    .where(eq(bingoEvents.isActive, true))
    .limit(1);

  // Fall back to the first event if none is marked active yet
  const activeEvent = event ?? (await db.select().from(bingoEvents).limit(1))[0];
  if (!activeEvent) {
    res.status(404).json({ error: "No bingo event found" });
    return;
  }

  const allTiles = await db
    .select()
    .from(tiles)
    .where(eq(tiles.bingoEventId, activeEvent.id));

  const tileIds = allTiles.map(t => t.id);

  const [allSides, allWildcards] = await Promise.all([
    db.select().from(tileSides).where(inArray(tileSides.tileId, tileIds)),
    db.select().from(tileWildcards).where(inArray(tileWildcards.tileId, tileIds)),
  ]);

  const sideIds = allSides.map(s => s.id);
  const allItems = sideIds.length
    ? await db.select().from(tileSideItems).where(inArray(tileSideItems.tileSideId, sideIds))
    : [];

  // Group items by tileSideId
  const itemsBySide = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const list = itemsBySide.get(item.tileSideId) ?? [];
    list.push(item);
    itemsBySide.set(item.tileSideId, list);
  }

  // Group sides by tileId
  const sidesByTile = new Map<string, typeof allSides>();
  for (const side of allSides) {
    const list = sidesByTile.get(side.tileId) ?? [];
    list.push(side);
    sidesByTile.set(side.tileId, list);
  }

  // Group wildcards by tileId
  const wildcardsByTile = new Map<string, typeof allWildcards>();
  for (const wc of allWildcards) {
    const list = wildcardsByTile.get(wc.tileId) ?? [];
    list.push(wc);
    wildcardsByTile.set(wc.tileId, list);
  }

  const tilesWithDetails = allTiles.map(tile => {
    const sides = sidesByTile.get(tile.id) ?? [];
    const sidesMap: Record<string, object> = {};
    for (const side of sides) {
      sidesMap[side.side] = {
        ...side,
        items: (itemsBySide.get(side.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
      };
    }
    return {
      ...tile,
      sides: sidesMap,
      wildcards: wildcardsByTile.get(tile.id) ?? [],
    };
  });

  res.json({ event: activeEvent, tiles: tilesWithDetails });
});

// GET /api/team/progress — points and per-tile progress for the user's team
router.get("/team/progress", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as DiscordUser | undefined;
  const userTeamName = user?.team;

  if (!userTeamName) {
    res.status(403).json({ error: "You are not on a team" });
    return;
  }

  const [event] = await db
    .select()
    .from(bingoEvents)
    .where(eq(bingoEvents.isActive, true))
    .limit(1);
  const activeEvent = event ?? (await db.select().from(bingoEvents).limit(1))[0];
  if (!activeEvent) {
    res.status(404).json({ error: "No bingo event found" });
    return;
  }

  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.bingoEventId, activeEvent.id), eq(teams.name, userTeamName)))
    .limit(1);

  if (!team) {
    res.status(404).json({ error: "Team not found in event" });
    return;
  }

  const [progress, completedLines, adjustments] = await Promise.all([
    db.select().from(teamTileProgress).where(eq(teamTileProgress.teamId, team.id)),
    db.select().from(teamCompletedLines).where(eq(teamCompletedLines.teamId, team.id)),
    db.select().from(teamPointAdjustments).where(eq(teamPointAdjustments.teamId, team.id)),
  ]);

  const tilePoints = progress.reduce(
    (sum, p) => sum + p.sideAPointsAwarded + p.sideBPointsAwarded,
    0
  );
  const lineBonus = completedLines.length * 15;
  const adjustment = adjustments.reduce((sum, a) => sum + a.amount, 0);

  res.json({
    team: { id: team.id, name: team.name, color: team.color },
    totalPoints: tilePoints + lineBonus + adjustment,
    tilePoints,
    lineBonus,
    adjustments: adjustment,
    tileProgress: progress,
  });
});

// GET /api/team/submissions — all submissions for the user's team
router.get("/team/submissions", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as DiscordUser | undefined;
  if (!user?.team) {
    res.status(403).json({ error: "You are not on a team" });
    return;
  }

  const [event] = await db
    .select()
    .from(bingoEvents)
    .where(eq(bingoEvents.isActive, true))
    .limit(1);
  const activeEvent = event ?? (await db.select().from(bingoEvents).limit(1))[0];
  if (!activeEvent) {
    res.status(404).json({ error: "No bingo event found" });
    return;
  }

  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.bingoEventId, activeEvent.id), eq(teams.name, user.team)))
    .limit(1);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  const teamSubs = await db
    .select()
    .from(submissions)
    .where(eq(submissions.teamId, team.id))
    .orderBy(desc(submissions.submittedAt));

  if (!teamSubs.length) {
    res.json({ submissions: [] });
    return;
  }

  const subIds = teamSubs.map((s) => s.id);
  const tileSideIds = [...new Set(teamSubs.map((s) => s.tileSideId))];

  const submitterIds = [...new Set(teamSubs.map((s) => s.submittedByUserId))];

  const [sidesData, claimsData, screenshotsData, submittersData] = await Promise.all([
    db.select().from(tileSides).where(inArray(tileSides.id, tileSideIds)),
    db.select().from(submissionItemClaims).where(inArray(submissionItemClaims.submissionId, subIds)),
    db.select().from(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, subIds)),
    db.select({
      id: users.id,
      username: users.discordUsername,
      globalName: users.discordGlobalName,
      guildNick: users.discordGuildNick,
    }).from(users).where(inArray(users.id, submitterIds)),
  ]);

  const tileIds = [...new Set(sidesData.map((s) => s.tileId))];
  const tilesData = tileIds.length
    ? await db.select().from(tiles).where(inArray(tiles.id, tileIds))
    : [];

  const submitterById = new Map(
    submittersData.map((u) => [u.id, u.guildNick ?? u.globalName ?? u.username])
  );
  const sideById = new Map(sidesData.map((s) => [s.id, s]));
  const tileById = new Map(tilesData.map((t) => [t.id, t]));

  const claimsBySubId = new Map<string, typeof claimsData>();
  for (const claim of claimsData) {
    const list = claimsBySubId.get(claim.submissionId) ?? [];
    list.push(claim);
    claimsBySubId.set(claim.submissionId, list);
  }

  const screenshotsBySubId = new Map<string, typeof screenshotsData>();
  for (const ss of screenshotsData) {
    const list = screenshotsBySubId.get(ss.submissionId) ?? [];
    list.push(ss);
    screenshotsBySubId.set(ss.submissionId, list);
  }

  const result = teamSubs.map((sub) => {
    const ts = sideById.get(sub.tileSideId)!;
    const tile = tileById.get(ts.tileId)!;
    return {
      id: sub.id,
      status: sub.status,
      submittedAt: sub.submittedAt instanceof Date
        ? sub.submittedAt.toISOString()
        : new Date((sub.submittedAt as unknown as number) * 1000).toISOString(),
      reviewerNotes: sub.reviewerNotes,
      tileId: tile.id,
      tileName: tile.name,
      badgeCategory: tile.badgeCategory,
      side: ts.side,
      submittedBy: submitterById.get(sub.submittedByUserId) ?? "Unknown",
      items: (claimsBySubId.get(sub.id) ?? []).map((c) => ({
        itemName: c.itemName,
        quantity: c.quantity,
      })),
      screenshots: (screenshotsBySubId.get(sub.id) ?? []).map((ss) => ({
        url: ss.storageUrl,
        type: ss.screenshotType,
      })),
    };
  });

  res.json({ submissions: result });
});

// POST /api/submissions — submit a screenshot for review
router.post(
  "/submissions",
  requireAuth,
  upload.single("screenshot"),
  async (req: Request, res: Response) => {
    const user = req.user as DiscordUser | undefined;
    if (!user?.team) {
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(403).json({ error: "You are not on a team" });
      return;
    }

    const { tileId, side, itemId } = req.body as {
      tileId?: string;
      side?: string;
      itemId?: string;
    };

    if (!tileId || !side || !itemId) {
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Missing required fields: tileId, side, itemId" });
      return;
    }

    if (side !== "A" && side !== "B") {
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Side must be A or B" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Screenshot is required" });
      return;
    }

    const [event] = await db
      .select()
      .from(bingoEvents)
      .where(eq(bingoEvents.isActive, true))
      .limit(1);
    const activeEvent = event ?? (await db.select().from(bingoEvents).limit(1))[0];
    if (!activeEvent) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: "No bingo event found" });
      return;
    }

    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.bingoEventId, activeEvent.id), eq(teams.name, user.team)))
      .limit(1);
    if (!team) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.discordId, user.id))
      .limit(1);
    if (!dbUser) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: "User record not found" });
      return;
    }

    // Verify tile side exists and belongs to this event
    const [ts] = await db
      .select({ tileSideId: tileSides.id, tileEventId: tiles.bingoEventId })
      .from(tileSides)
      .innerJoin(tiles, eq(tileSides.tileId, tiles.id))
      .where(
        and(
          eq(tileSides.tileId, tileId),
          eq(tileSides.side, side as "A" | "B"),
          eq(tiles.bingoEventId, activeEvent.id)
        )
      )
      .limit(1);
    if (!ts) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Tile side not found" });
      return;
    }

    // Verify the item belongs to this tile side
    const [item] = await db
      .select()
      .from(tileSideItems)
      .where(eq(tileSideItems.id, itemId))
      .limit(1);
    if (!item || item.tileSideId !== ts.tileSideId) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Item does not belong to this tile side" });
      return;
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const submissionId = crypto.randomUUID();

    await db.insert(submissions).values({
      id: submissionId,
      teamId: team.id,
      tileSideId: ts.tileSideId,
      submittedByUserId: dbUser.id,
      status: "pending",
    });

    await db.insert(submissionScreenshots).values({
      submissionId,
      screenshotType: "main",
      storageUrl: fileUrl,
      scrapeStatus: "pending",
    });

    await db.insert(submissionItemClaims).values({
      submissionId,
      itemName: item.itemName,
      quantity: 1,
      tileSideItemId: item.id,
    });

    // Upsert teamTileProgress — set side to pending_approval (don't downgrade completed)
    const sideStatusField = side === "A" ? ("sideAStatus" as const) : ("sideBStatus" as const);
    const [existing] = await db
      .select()
      .from(teamTileProgress)
      .where(and(eq(teamTileProgress.teamId, team.id), eq(teamTileProgress.tileId, tileId)))
      .limit(1);

    if (!existing) {
      await db.insert(teamTileProgress).values({
        teamId: team.id,
        tileId,
        [sideStatusField]: "pending_approval",
      });
    } else if (
      existing[sideStatusField] === "not_started" ||
      existing[sideStatusField] === "in_progress"
    ) {
      await db
        .update(teamTileProgress)
        .set({ [sideStatusField]: "pending_approval" })
        .where(eq(teamTileProgress.id, existing.id));
    }

    res.json({ success: true, submissionId });
  }
);

export default router;
