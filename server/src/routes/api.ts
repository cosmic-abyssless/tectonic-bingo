import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth";
import { requireMod } from "../middleware/requireMod";
import { broadcast } from "../ws";
import { getAIClient } from "../ai";
import { db } from "../db";
import {
  bingoEvents,
  tiles,
  tileSides,
  tileSideItems,
  tileWildcards,
  teamWildcardUsage,
  teams,
  users,
  teamTileProgress,
  teamCompletedLines,
  teamPointAdjustments,
  submissions,
  submissionScreenshots,
  submissionItemClaims,
} from "../db/schema";
import { eq, and, inArray, desc, ne, sql } from "drizzle-orm";
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

// Separate multer instance for analysis — memory only, nothing saved to disk
const analyzeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
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

// GET /api/teams — list all teams for the active event
router.get("/teams", requireAuth, async (_req: Request, res: Response) => {
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
  const allTeams = await db
    .select({ id: teams.id, name: teams.name, color: teams.color })
    .from(teams)
    .where(eq(teams.bingoEventId, activeEvent.id));
  res.json({ teams: allTeams });
});

// GET /api/team/progress — points and per-tile progress for the user's team
// Mods may pass ?viewAsTeam=<name> to inspect any team
router.get("/team/progress", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as DiscordUser | undefined;

  // Resolve which team to look up
  const viewAs = user?.isModerator && typeof req.query.viewAsTeam === "string"
    ? req.query.viewAsTeam
    : user?.team;

  if (!viewAs) {
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
    .where(and(eq(teams.bingoEventId, activeEvent.id), eq(teams.name, viewAs)))
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
// Mods may pass ?viewAsTeam=<name> to inspect any team
router.get("/team/submissions", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as DiscordUser | undefined;

  const viewAs = user?.isModerator && typeof req.query.viewAsTeam === "string"
    ? req.query.viewAsTeam
    : user?.team;

  if (!viewAs) {
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
    .where(and(eq(teams.bingoEventId, activeEvent.id), eq(teams.name, viewAs)))
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
    db.select({
      submissionId: submissionItemClaims.submissionId,
      itemName: submissionItemClaims.itemName,
      quantity: submissionItemClaims.quantity,
      targetQuantity: tileSideItems.quantity,
    }).from(submissionItemClaims)
      .leftJoin(tileSideItems, eq(submissionItemClaims.tileSideItemId, tileSideItems.id))
      .where(inArray(submissionItemClaims.submissionId, subIds)),
    db.select().from(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, subIds)),
    db.select({
      id: users.id,
      username: users.discordUsername,
      globalName: users.discordGlobalName,
      guildNick: users.discordGuildNick,
    }).from(users).where(inArray(users.id, submitterIds)),
  ]);

  const tileIds = [...new Set(sidesData.map((s) => s.tileId))];
  const wildcardIds = [...new Set(teamSubs.map((s) => s.wildcardId).filter(Boolean))] as string[];

  const [tilesData, wildcardData] = await Promise.all([
    tileIds.length ? db.select().from(tiles).where(inArray(tiles.id, tileIds)) : [],
    wildcardIds.length
      ? db.select({ id: tileWildcards.id, itemName: tileWildcards.itemName })
          .from(tileWildcards).where(inArray(tileWildcards.id, wildcardIds))
      : [],
  ]);

  const submitterById = new Map(
    submittersData.map((u) => [u.id, u.guildNick ?? u.globalName ?? u.username])
  );
  const sideById = new Map(sidesData.map((s) => [s.id, s]));
  const tileById = new Map(tilesData.map((t) => [t.id, t]));
  const wildcardById = new Map(wildcardData.map((w) => [w.id, w.itemName]));

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
      isWildcardRedemption: sub.isWildcardRedemption,
      wildcardItemName: sub.wildcardId ? (wildcardById.get(sub.wildcardId) ?? null) : null,
      items: (claimsBySubId.get(sub.id) ?? []).map((c) => ({
        itemName: c.itemName,
        quantity: c.quantity,
        targetQuantity: c.targetQuantity ?? 1,
      })),
      screenshots: (screenshotsBySubId.get(sub.id) ?? []).map((ss) => ({
        url: ss.storageUrl,
        type: ss.screenshotType,
      })),
    };
  });

  res.json({ submissions: result });
});

// POST /api/submissions/analyze — AI screenshot analysis (codeword check + item detection)
router.post(
  "/submissions/analyze",
  requireAuth,
  analyzeUpload.single("screenshot"),
  async (req: Request, res: Response) => {
    const user = req.user as DiscordUser | undefined;
    if (!user?.team) {
      res.status(403).json({ error: "You are not on a team" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Screenshot is required" });
      return;
    }

    const ai = getAIClient();
    if (!ai) {
      res.status(503).json({ error: "AI analysis is not configured on this server" });
      return;
    }

    // Look up the team's codeword
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
      .select({ codeword: teams.codeword })
      .from(teams)
      .where(and(eq(teams.bingoEventId, activeEvent.id), eq(teams.name, user.team)))
      .limit(1);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const base64 = req.file.buffer.toString("base64");
    const mediaType = (req.file.mimetype || "image/png") as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";

    try {
      // Step 1 — ask Claude to extract visible text and check for the codeword
      const message = await ai.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: `This is an Old School RuneScape screenshot submitted for a bingo competition.

The player's team codeword is: "${team.codeword}"

Do two things:
1. Look for the exact text "${team.codeword}" literally visible anywhere in the image (e.g. in the chatbox). Only return true if those exact characters are present — do not guess or infer.
2. Extract every piece of text you can read from the image. Focus on: drop notifications, collection log pop-ups, item names in chat, loot beam labels, NPC drop messages, and item tooltips.

Respond ONLY with a JSON object, no markdown:
{
  "codewordFound": <true | false>,
  "extractedText": ["<every string of text you can read from the image>"]
}`,
              },
            ],
          },
        ],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
      const json = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(json);

      const codewordFound = !!parsed.codewordFound;
      const extractedText: string[] = Array.isArray(parsed.extractedText) ? parsed.extractedText : [];

      // Step 2 — match extracted strings against every tile side item and wildcard in the DB
      const [allItems, allWildcards] = await Promise.all([
        db
          .select({
            id: tileSideItems.id,
            itemName: tileSideItems.itemName,
            side: tileSides.side,
            tileId: tiles.id,
            tileName: tiles.name,
          })
          .from(tileSideItems)
          .innerJoin(tileSides, eq(tileSideItems.tileSideId, tileSides.id))
          .innerJoin(tiles, eq(tileSides.tileId, tiles.id))
          .where(eq(tiles.bingoEventId, activeEvent.id)),
        db
          .select({
            id: tileWildcards.id,
            itemName: tileWildcards.itemName,
            applicableToSide: tileWildcards.applicableToSide,
            tileId: tiles.id,
            tileName: tiles.name,
          })
          .from(tileWildcards)
          .innerJoin(tiles, eq(tileWildcards.tileId, tiles.id))
          .where(eq(tiles.bingoEventId, activeEvent.id)),
      ]);

      let detectedMatch: {
        tileId: string; tileName: string; tileSideItemId: string;
        side: "A" | "B"; itemName: string;
      } | null = null;

      outer: for (const item of allItems) {
        const needle = item.itemName.toLowerCase();
        for (const text of extractedText) {
          if (text.toLowerCase().includes(needle)) {
            detectedMatch = {
              tileId: item.tileId,
              tileName: item.tileName,
              tileSideItemId: item.id,
              side: item.side as "A" | "B",
              itemName: item.itemName,
            };
            break outer;
          }
        }
      }

      // Only check wildcards if no regular item was matched
      let detectedWildcard: {
        tileId: string; tileName: string; wildcardId: string;
        itemName: string; applicableToSide: "A" | "B" | null;
      } | null = null;

      if (!detectedMatch) {
        outerWc: for (const wc of allWildcards) {
          const needle = wc.itemName.toLowerCase();
          for (const text of extractedText) {
            if (text.toLowerCase().includes(needle)) {
              detectedWildcard = {
                tileId: wc.tileId,
                tileName: wc.tileName,
                wildcardId: wc.id,
                itemName: wc.itemName,
                applicableToSide: wc.applicableToSide as "A" | "B" | null,
              };
              break outerWc;
            }
          }
        }
      }

      const warnings: string[] = [];
      if (!codewordFound) {
        warnings.push(
          `Codeword '${team.codeword}' was not found in your screenshot. Make sure it's visible on screen before submitting.`
        );
      }

      res.json({ codewordFound, codeword: team.codeword, detectedMatch, detectedWildcard, warnings });
    } catch (err) {
      console.error("[AI analyze] failed:", err);
      res.status(500).json({ error: "Analysis failed" });
    }
  }
);

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

    const {
      tileId, side, itemId, wildcardId,
      isWildcardRedemption: isWildcardRaw,
      quantity: quantityRaw, codewordFound,
    } = req.body as {
      tileId?: string;
      side?: string;
      itemId?: string;
      wildcardId?: string;
      isWildcardRedemption?: string; // "true" | "false"
      quantity?: string;
      codewordFound?: string; // "true" | "false" | undefined (if no analysis was run)
    };
    const isWildcard = isWildcardRaw === "true";
    const quantity = Math.max(1, parseInt(quantityRaw ?? "1") || 1);

    if (!tileId || !side || !itemId) {
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Missing required fields: tileId, side, itemId" });
      return;
    }

    if (isWildcard && !wildcardId) {
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "wildcardId is required for wildcard redemptions" });
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

    // Verify the item belongs to this tile side (required in both regular and wildcard paths)
    const [item] = await db
      .select()
      .from(tileSideItems)
      .where(eq(tileSideItems.id, itemId!))
      .limit(1);
    if (!item || item.tileSideId !== ts.tileSideId) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Item does not belong to this tile side" });
      return;
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const submissionId = crypto.randomUUID();
    const analysisRan = codewordFound !== undefined;

    if (isWildcard) {
      // --- Wildcard redemption path ---
      const [wc] = await db
        .select()
        .from(tileWildcards)
        .where(eq(tileWildcards.id, wildcardId!))
        .limit(1);
      if (!wc || wc.tileId !== tileId) {
        fs.unlinkSync(req.file.path);
        res.status(400).json({ error: "Wildcard not found or does not belong to this tile" });
        return;
      }

      // Enforce usage cap
      const usages = await db
        .select()
        .from(teamWildcardUsage)
        .where(and(
          eq(teamWildcardUsage.teamId, team.id),
          eq(teamWildcardUsage.tileWildcardId, wc.id),
        ));
      if (usages.length >= wc.maxRedemptionsPerTeam) {
        fs.unlinkSync(req.file.path);
        res.status(400).json({ error: `Your team has already used the "${wc.itemName}" wildcard the maximum number of times` });
        return;
      }

      await db.insert(submissions).values({
        id: submissionId,
        teamId: team.id,
        tileSideId: ts.tileSideId,
        submittedByUserId: dbUser.id,
        status: "pending",
        isWildcardRedemption: true,
        wildcardId: wc.id,
      });

      await db.insert(submissionScreenshots).values({
        submissionId,
        screenshotType: "main",
        storageUrl: fileUrl,
        scrapeStatus: analysisRan ? "completed" : "pending",
        codewordVerified: analysisRan ? codewordFound === "true" : null,
        scrapedAt: analysisRan ? new Date() : null,
      });

      await db.insert(submissionItemClaims).values({
        submissionId,
        itemName: item.itemName,
        quantity: 1,
        tileSideItemId: item.id,
      });

      await db.insert(teamWildcardUsage).values({
        teamId: team.id,
        tileWildcardId: wc.id,
        submissionId,
      });
    } else {
      // --- Regular item path ---
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
        scrapeStatus: analysisRan ? "completed" : "pending",
        codewordVerified: analysisRan ? codewordFound === "true" : null,
        scrapedAt: analysisRan ? new Date() : null,
      });

      await db.insert(submissionItemClaims).values({
        submissionId,
        itemName: item.itemName,
        quantity,
        tileSideItemId: item.id,
      });
    }

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

    broadcast({ type: "submission_created", teamName: team.name });
    res.json({ success: true, submissionId });
  }
);

// ---------------------------------------------------------------------------
// MOD ROUTES
// ---------------------------------------------------------------------------

// GET /api/mod/pending-count — lightweight count of pending submissions
router.get("/mod/pending-count", requireAuth, requireMod, async (_req: Request, res: Response) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(submissions)
    .where(eq(submissions.status, "pending"));
  res.json({ count: Number(row?.count ?? 0) });
});

// GET /api/mod/submissions — all submissions across all teams
router.get("/mod/submissions", requireAuth, requireMod, async (_req: Request, res: Response) => {
  const allSubs = await db
    .select()
    .from(submissions)
    .orderBy(desc(submissions.submittedAt));

  if (!allSubs.length) {
    res.json({ submissions: [] });
    return;
  }

  const subIds = allSubs.map((s) => s.id);
  const tileSideIds = [...new Set(allSubs.map((s) => s.tileSideId))];
  const teamIds = [...new Set(allSubs.map((s) => s.teamId))];
  const submitterIds = [...new Set(allSubs.map((s) => s.submittedByUserId))];

  const [sidesData, claimsData, screenshotsData, teamsData, submittersData] = await Promise.all([
    db.select().from(tileSides).where(inArray(tileSides.id, tileSideIds)),
    db.select({
      submissionId: submissionItemClaims.submissionId,
      itemName: submissionItemClaims.itemName,
      quantity: submissionItemClaims.quantity,
      targetQuantity: tileSideItems.quantity,
    }).from(submissionItemClaims)
      .leftJoin(tileSideItems, eq(submissionItemClaims.tileSideItemId, tileSideItems.id))
      .where(inArray(submissionItemClaims.submissionId, subIds)),
    db.select().from(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, subIds)),
    db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds)),
    db.select({
      id: users.id,
      username: users.discordUsername,
      globalName: users.discordGlobalName,
      guildNick: users.discordGuildNick,
    }).from(users).where(inArray(users.id, submitterIds)),
  ]);

  const tileIds = [...new Set(sidesData.map((s) => s.tileId))];
  const wildcardIds = [...new Set(allSubs.map((s) => s.wildcardId).filter(Boolean))] as string[];

  const [tilesData, wildcardData] = await Promise.all([
    tileIds.length ? db.select().from(tiles).where(inArray(tiles.id, tileIds)) : [],
    wildcardIds.length
      ? db.select({ id: tileWildcards.id, itemName: tileWildcards.itemName })
          .from(tileWildcards).where(inArray(tileWildcards.id, wildcardIds))
      : [],
  ]);

  const sideById = new Map(sidesData.map((s) => [s.id, s]));
  const tileById = new Map(tilesData.map((t) => [t.id, t]));
  const teamById = new Map(teamsData.map((t) => [t.id, t.name]));
  const submitterById = new Map(
    submittersData.map((u) => [u.id, u.guildNick ?? u.globalName ?? u.username])
  );
  const wildcardById = new Map(wildcardData.map((w) => [w.id, w.itemName]));

  const claimsBySubId = new Map<string, typeof claimsData>();
  for (const c of claimsData) {
    const list = claimsBySubId.get(c.submissionId) ?? [];
    list.push(c);
    claimsBySubId.set(c.submissionId, list);
  }
  const screenshotsBySubId = new Map<string, typeof screenshotsData>();
  for (const ss of screenshotsData) {
    const list = screenshotsBySubId.get(ss.submissionId) ?? [];
    list.push(ss);
    screenshotsBySubId.set(ss.submissionId, list);
  }

  const result = allSubs.map((sub) => {
    const ts = sideById.get(sub.tileSideId)!;
    const tile = tileById.get(ts.tileId)!;
    const subScreenshots = screenshotsBySubId.get(sub.id) ?? [];
    const mainScreenshot = subScreenshots.find((ss) => ss.screenshotType === "main");
    return {
      id: sub.id,
      status: sub.status,
      submittedAt: sub.submittedAt instanceof Date
        ? sub.submittedAt.toISOString()
        : new Date((sub.submittedAt as unknown as number) * 1000).toISOString(),
      reviewerNotes: sub.reviewerNotes,
      pointsAwarded: sub.pointsAwarded,
      teamId: sub.teamId,
      teamName: teamById.get(sub.teamId) ?? "Unknown",
      tileId: tile.id,
      tileName: tile.name,
      badgeCategory: tile.badgeCategory,
      side: ts.side,
      sidePoints: ts.points,
      submittedBy: submitterById.get(sub.submittedByUserId) ?? "Unknown",
      codewordVerified: mainScreenshot?.codewordVerified ?? null,
      isWildcardRedemption: sub.isWildcardRedemption,
      wildcardItemName: sub.wildcardId ? (wildcardById.get(sub.wildcardId) ?? null) : null,
      items: (claimsBySubId.get(sub.id) ?? []).map((c) => ({
        itemName: c.itemName,
        quantity: c.quantity,
        targetQuantity: c.targetQuantity ?? 1,
      })),
      screenshots: subScreenshots.map((ss) => ({
        url: ss.storageUrl,
        type: ss.screenshotType,
      })),
    };
  });

  res.json({ submissions: result });
});

// PATCH /api/mod/submissions/:id — review a submission
router.patch("/mod/submissions/:id", requireAuth, requireMod, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { action, reviewerNotes } = req.body as {
    action?: string;
    reviewerNotes?: string;
  };

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be approve or reject" });
    return;
  }

  const [sub] = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
  if (!sub) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  const mod = req.user as DiscordUser;
  const [modUser] = await db.select().from(users).where(eq(users.discordId, mod.id)).limit(1);
  if (!modUser) {
    res.status(404).json({ error: "Moderator user record not found" });
    return;
  }

  // Get the tile side to determine which side (A/B) and its points
  const [ts] = await db.select().from(tileSides).where(eq(tileSides.id, sub.tileSideId)).limit(1);
  if (!ts) {
    res.json({ success: true });
    return;
  }

  const now = new Date();
  const newStatus = action === "approve" ? "approved" : "rejected";

  await db.update(submissions).set({
    status: newStatus,
    pointsAwarded: action === "approve" ? ts.points : null,
    reviewedByUserId: modUser.id,
    reviewedAt: now,
    reviewerNotes: reviewerNotes ?? null,
    updatedAt: now,
  }).where(eq(submissions.id, id));

  // Fetch or prepare teamTileProgress upsert
  const [existing] = await db
    .select()
    .from(teamTileProgress)
    .where(and(eq(teamTileProgress.teamId, sub.teamId), eq(teamTileProgress.tileId, ts.tileId)))
    .limit(1);

  if (action === "approve") {
    const pts = ts.points;

    // ---- Check if approving this submission completes the side ----
    // Rules (all must pass):
    //   1. Each required item (no optionsGroup, qty=1): must have >= 1 approved submission.
    //   2. Each required item (no optionsGroup, qty>1): cumulative approved qty >= target.
    //   3. Each options group: >= 1 item from the group must have an approved submission.
    //   4. minSubmissions: total approved submission count >= ts.minSubmissions.
    //      (Covers "need N different drops from options groups" like K'ril Part A.)
    let sideIsComplete = true;

    // Fetch all items for this tile side and all approved submissions (including the one just approved).
    const [sideItems, approvedSubRows] = await Promise.all([
      db.select().from(tileSideItems).where(eq(tileSideItems.tileSideId, sub.tileSideId)),
      db.select({ id: submissions.id })
        .from(submissions)
        .where(and(
          eq(submissions.teamId, sub.teamId),
          eq(submissions.tileSideId, sub.tileSideId),
          eq(submissions.status, "approved"),
        )),
    ]);
    const approvedSubIds = approvedSubRows.map((s) => s.id);

    // Fetch all claims for those approved submissions.
    const approvedClaims = approvedSubIds.length
      ? await db.select().from(submissionItemClaims)
          .where(inArray(submissionItemClaims.submissionId, approvedSubIds))
      : [];

    // Build approved qty map: tileSideItemId → cumulative approved quantity
    const approvedQtyById = new Map<string, number>();
    for (const claim of approvedClaims) {
      if (!claim.tileSideItemId) continue;
      approvedQtyById.set(
        claim.tileSideItemId,
        (approvedQtyById.get(claim.tileSideItemId) ?? 0) + claim.quantity,
      );
    }

    // If this side allows previously acquired items (Part B where Part A drops count),
    // also fold in approved Part A claims matched to Part B items by itemName.
    if (ts.allowsPreviouslyAcquired && ts.side === "B") {
      const [partASide] = await db
        .select({ id: tileSides.id })
        .from(tileSides)
        .where(and(eq(tileSides.tileId, ts.tileId), eq(tileSides.side, "A")))
        .limit(1);

      if (partASide) {
        const partAApprovedSubIds = (await db
          .select({ id: submissions.id })
          .from(submissions)
          .where(and(
            eq(submissions.teamId, sub.teamId),
            eq(submissions.tileSideId, partASide.id),
            eq(submissions.status, "approved"),
          ))
        ).map((s) => s.id);

        if (partAApprovedSubIds.length > 0) {
          const partAClaims = await db
            .select()
            .from(submissionItemClaims)
            .where(inArray(submissionItemClaims.submissionId, partAApprovedSubIds));

          // Map Part B items by lowercase name so we can match by name across sides
          const partBItemIdByName = new Map(
            sideItems.map((i) => [i.itemName.toLowerCase(), i.id]),
          );

          for (const claim of partAClaims) {
            const partBItemId = partBItemIdByName.get(claim.itemName.toLowerCase());
            if (partBItemId) {
              approvedQtyById.set(
                partBItemId,
                (approvedQtyById.get(partBItemId) ?? 0) + claim.quantity,
              );
            }
          }
        }
      }
    }

    // Check 1 & 2: every required item (no optionsGroup) must meet its quantity target.
    for (const item of sideItems.filter((i) => !i.optionsGroup)) {
      if ((approvedQtyById.get(item.id) ?? 0) < item.quantity) {
        sideIsComplete = false;
        break;
      }
    }

    // Check 3: options group completion.
    // Default: every group must have at least one item approved ("pick any one from each group").
    // requiresCompleteSet: at least ONE group must have ALL its items approved (e.g. Barrows Part B).
    if (sideIsComplete) {
      const groups = new Map<string, string[]>();
      for (const item of sideItems) {
        if (!item.optionsGroup) continue;
        const list = groups.get(item.optionsGroup) ?? [];
        list.push(item.id);
        groups.set(item.optionsGroup, list);
      }
      if (groups.size > 0) {
        if (ts.requiresCompleteSet) {
          // At least one group must be fully complete
          const anyGroupComplete = [...groups.values()].some((itemIds) =>
            itemIds.every((itemId) => (approvedQtyById.get(itemId) ?? 0) > 0),
          );
          if (!anyGroupComplete) sideIsComplete = false;
        } else {
          // Every group must have at least one item approved
          for (const itemIds of groups.values()) {
            if (!itemIds.some((itemId) => (approvedQtyById.get(itemId) ?? 0) > 0)) {
              sideIsComplete = false;
              break;
            }
          }
        }
      }
    }

    // Check 4: minSubmissions (e.g. K'ril needs 2 different drops from the options group).
    if (sideIsComplete && ts.minSubmissions > 1) {
      sideIsComplete = approvedSubIds.length >= ts.minSubmissions;
    }
    // ----------------------------------------------------------------

    if (!sideIsComplete) {
      // Partial progress — check for any other pending subs to determine new status
      const [{ remaining }] = await db
        .select({ remaining: sql<number>`count(*)` })
        .from(submissions)
        .where(and(
          eq(submissions.teamId, sub.teamId),
          eq(submissions.tileSideId, sub.tileSideId),
          eq(submissions.status, "pending"),
        ));
      const partialStatus = remaining > 0 ? ("pending_approval" as const) : ("in_progress" as const);
      const sideField = ts.side === "A" ? ("sideAStatus" as const) : ("sideBStatus" as const);

      if (!existing) {
        await db.insert(teamTileProgress).values({ teamId: sub.teamId, tileId: ts.tileId, [sideField]: partialStatus });
      } else {
        await db.update(teamTileProgress).set({ [sideField]: partialStatus }).where(eq(teamTileProgress.id, existing.id));
      }
    } else if (ts.side === "A") {
      let sideBPoints: number | undefined;
      let sideBAutoComplete: { points: number } | undefined;

      // If Part B is already completed but points were withheld, release them now
      if (existing?.sideBStatus === "completed" && existing.sideBPointsAwarded === 0) {
        // Find the approved Part B submission to get its awarded points
        const bSideIds = await db
          .select({ id: tileSides.id })
          .from(tileSides)
          .where(and(eq(tileSides.tileId, ts.tileId), eq(tileSides.side, "B")));

        if (bSideIds.length) {
          const [approvedB] = await db
            .select()
            .from(submissions)
            .where(and(
              eq(submissions.teamId, sub.teamId),
              inArray(submissions.tileSideId, bSideIds.map((s) => s.id)),
              eq(submissions.status, "approved"),
            ))
            .orderBy(desc(submissions.reviewedAt))
            .limit(1);
          sideBPoints = approvedB?.pointsAwarded ?? 0;
        }
      } else if (existing?.sideBStatus !== "completed") {
        // Part B not yet completed — check if Part A completion now satisfies Part B conditions.
        // This applies when Part B has allowsPreviouslyAcquired = true (e.g. Cerberus, where
        // all 4 uniques from Part A automatically satisfy Part B once Part A is done).
        const [partBSide] = await db
          .select()
          .from(tileSides)
          .where(and(eq(tileSides.tileId, ts.tileId), eq(tileSides.side, "B")))
          .limit(1);

        if (partBSide?.allowsPreviouslyAcquired) {
          const partBItems = await db
            .select()
            .from(tileSideItems)
            .where(eq(tileSideItems.tileSideId, partBSide.id));

          // Fetch any explicit Part B approved submissions
          const partBApprovedSubIds = (await db
            .select({ id: submissions.id })
            .from(submissions)
            .where(and(
              eq(submissions.teamId, sub.teamId),
              eq(submissions.tileSideId, partBSide.id),
              eq(submissions.status, "approved"),
            ))
          ).map((s) => s.id);

          const partBClaims = partBApprovedSubIds.length
            ? await db.select().from(submissionItemClaims)
                .where(inArray(submissionItemClaims.submissionId, partBApprovedSubIds))
            : [];

          // Build approved qty map from explicit Part B submissions
          const bApprovedQtyById = new Map<string, number>();
          for (const claim of partBClaims) {
            if (!claim.tileSideItemId) continue;
            bApprovedQtyById.set(
              claim.tileSideItemId,
              (bApprovedQtyById.get(claim.tileSideItemId) ?? 0) + claim.quantity,
            );
          }

          // Fold in Part A approved claims (approvedClaims already fetched above)
          // matched to Part B items by item name
          const partBItemIdByName = new Map(
            partBItems.map((i) => [i.itemName.toLowerCase(), i.id]),
          );
          for (const claim of approvedClaims) {
            const partBItemId = partBItemIdByName.get(claim.itemName.toLowerCase());
            if (partBItemId) {
              bApprovedQtyById.set(
                partBItemId,
                (bApprovedQtyById.get(partBItemId) ?? 0) + claim.quantity,
              );
            }
          }

          // Run the same completion checks as for a normal Part B submission
          let partBIsComplete = true;

          // Check 1 & 2: every required item must meet its quantity target
          for (const item of partBItems.filter((i) => !i.optionsGroup)) {
            if ((bApprovedQtyById.get(item.id) ?? 0) < item.quantity) {
              partBIsComplete = false;
              break;
            }
          }

          // Check 3: options group completion
          if (partBIsComplete) {
            const bGroups = new Map<string, string[]>();
            for (const item of partBItems) {
              if (!item.optionsGroup) continue;
              const list = bGroups.get(item.optionsGroup) ?? [];
              list.push(item.id);
              bGroups.set(item.optionsGroup, list);
            }
            if (bGroups.size > 0) {
              if (partBSide.requiresCompleteSet) {
                const anyGroupComplete = [...bGroups.values()].some((itemIds) =>
                  itemIds.every((itemId) => (bApprovedQtyById.get(itemId) ?? 0) > 0),
                );
                if (!anyGroupComplete) partBIsComplete = false;
              } else {
                for (const itemIds of bGroups.values()) {
                  if (!itemIds.some((itemId) => (bApprovedQtyById.get(itemId) ?? 0) > 0)) {
                    partBIsComplete = false;
                    break;
                  }
                }
              }
            }
          }

          // Check 4: minSubmissions — count explicit Part B submissions
          if (partBIsComplete && partBSide.minSubmissions > 1) {
            if (partBApprovedSubIds.length < partBSide.minSubmissions) {
              partBIsComplete = false;
            }
          }

          if (partBIsComplete) {
            sideBAutoComplete = { points: partBSide.points };
          }
        }
      }

      const updateFields = {
        sideAStatus: "completed" as const,
        sideAPointsAwarded: pts,
        sideACompletedAt: now,
        ...(sideBPoints != null ? { sideBPointsAwarded: sideBPoints } : {}),
        ...(sideBAutoComplete != null ? {
          sideBStatus: "completed" as const,
          sideBPointsAwarded: sideBAutoComplete.points,
          sideBCompletedAt: now,
        } : {}),
      };

      if (!existing) {
        await db.insert(teamTileProgress).values({ teamId: sub.teamId, tileId: ts.tileId, ...updateFields });
      } else {
        await db.update(teamTileProgress).set(updateFields).where(eq(teamTileProgress.id, existing.id));
      }
    } else {
      // Part B complete — only award points if Part A is already complete
      const aComplete = existing?.sideAStatus === "completed";
      const updateFields = {
        sideBStatus: "completed" as const,
        sideBPointsAwarded: aComplete ? pts : 0,
        sideBCompletedAt: now,
      };

      if (!existing) {
        await db.insert(teamTileProgress).values({ teamId: sub.teamId, tileId: ts.tileId, ...updateFields });
      } else {
        await db.update(teamTileProgress).set(updateFields).where(eq(teamTileProgress.id, existing.id));
      }
    }
  } else {
    // Reject — revert side status if no other pending subs remain
    const [{ remaining }] = await db
      .select({ remaining: sql<number>`count(*)` })
      .from(submissions)
      .where(and(
        eq(submissions.teamId, sub.teamId),
        eq(submissions.tileSideId, sub.tileSideId),
        eq(submissions.status, "pending"),
        ne(submissions.id, id),
      ));

    if (remaining === 0 && existing) {
      const sideField = ts.side === "A" ? ("sideAStatus" as const) : ("sideBStatus" as const);
      if (existing[sideField] === "pending_approval") {
        await db
          .update(teamTileProgress)
          .set({ [sideField]: "in_progress" })
          .where(eq(teamTileProgress.id, existing.id));
      }
    }
  }

  // Broadcast the review so clients can update in real-time
  const [reviewedTeam] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, sub.teamId))
    .limit(1);
  broadcast({ type: "submission_reviewed", teamName: reviewedTeam?.name ?? null });

  res.json({ success: true });
});

export default router;
