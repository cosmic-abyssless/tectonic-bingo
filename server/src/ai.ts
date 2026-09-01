import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./db/schema";
import { tileTaskItems, tileTasks, tileWildcards, tiles } from "./db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;
type Team = typeof schema.teams.$inferSelect;

let _client: Anthropic | null = null;

/** Returns the Anthropic client, or null if ANTHROPIC_API_KEY is not set. */
export function getAIClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

export interface ScreenshotFile {
  buffer: Buffer;
  mimetype: string;
}

export interface AnalyzeResult {
  codewordFound: boolean;
  codeword: string;
  extractedText: string[];
  detectedMatch: { tileId: string; tileName: string; taskId: string; taskItemId: string; itemName: string } | null;
  detectedWildcard: { tileId: string; tileName: string; wildcardId: string; itemName: string; applicableTaskId: string | null } | null;
  warnings: string[];
}

// Hardcoded for now — every bingo on this platform is an OSRS event. If we
// ever host a non-OSRS bingo this'll need to move back to a per-bingo field.
const AI_HINT =
  "This screenshot is from Old School RuneScape (OSRS), a fantasy MMORPG. Look for chat box messages, kill count trackers, loot/drop notifications, and inventory or bank interfaces.\n\n";

// Two steps: (1) ask Claude what's visible in the screenshot and whether the
// team's codeword appears, (2) match the extracted text against every item
// and wildcard on this bingo's board.
export async function analyzeSubmissionScreenshot(
  client: Anthropic,
  db: Db,
  bingo: Bingo,
  team: Team,
  file: ScreenshotFile,
): Promise<AnalyzeResult> {
  const base64 = file.buffer.toString("base64");
  const mediaType = (file.mimetype || "image/png") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: `${AI_HINT}This screenshot was submitted as proof for a bingo competition.

The player's team codeword is: "${team.codeword}"

Do two things:
1. Look for the exact text "${team.codeword}" literally visible anywhere in the image. Only return true if those exact characters are present — do not guess or infer.
2. Extract every piece of text you can read from the image that's relevant to the achievement being claimed (item names, notifications, counters, labels).

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

  const items = db
    .select({ id: tileTaskItems.id, itemName: tileTaskItems.itemName, taskId: tileTasks.id, tileId: tiles.id, tileName: tiles.name })
    .from(tileTaskItems)
    .innerJoin(tileTasks, eq(tileTaskItems.taskId, tileTasks.id))
    .innerJoin(tiles, eq(tileTasks.tileId, tiles.id))
    .where(eq(tiles.bingoId, bingo.id))
    .all();

  const wildcards = db
    .select({ id: tileWildcards.id, itemName: tileWildcards.itemName, applicableTaskId: tileWildcards.applicableTaskId, tileId: tiles.id, tileName: tiles.name })
    .from(tileWildcards)
    .innerJoin(tiles, eq(tileWildcards.tileId, tiles.id))
    .where(eq(tiles.bingoId, bingo.id))
    .all();

  let detectedMatch: AnalyzeResult["detectedMatch"] = null;
  outer: for (const item of items) {
    const needle = item.itemName.toLowerCase();
    for (const text of extractedText) {
      if (text.toLowerCase().includes(needle)) {
        detectedMatch = { tileId: item.tileId, tileName: item.tileName, taskId: item.taskId, taskItemId: item.id, itemName: item.itemName };
        break outer;
      }
    }
  }

  // Only check wildcards if no regular item was matched.
  let detectedWildcard: AnalyzeResult["detectedWildcard"] = null;
  if (!detectedMatch) {
    outerWc: for (const wc of wildcards) {
      const needle = wc.itemName.toLowerCase();
      for (const text of extractedText) {
        if (text.toLowerCase().includes(needle)) {
          detectedWildcard = { tileId: wc.tileId, tileName: wc.tileName, wildcardId: wc.id, itemName: wc.itemName, applicableTaskId: wc.applicableTaskId };
          break outerWc;
        }
      }
    }
  }

  const warnings: string[] = [];
  if (!codewordFound) {
    warnings.push(`Codeword '${team.codeword}' was not found in your screenshot. Make sure it's visible on screen before submitting.`);
  }

  return { codewordFound, codeword: team.codeword, extractedText, detectedMatch, detectedWildcard, warnings };
}
