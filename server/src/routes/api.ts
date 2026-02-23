import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { db } from "../db";
import {
  bingoEvents,
  tiles,
  tileSides,
  tileSideItems,
  tileWildcards,
  teams,
  teamTileProgress,
  teamCompletedLines,
  teamPointAdjustments,
} from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { DiscordUser } from "../types";

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

export default router;
