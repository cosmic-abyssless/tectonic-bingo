// Site admin → Import historical Bingo (#311): a bundle (shared/src/historicalBundle.ts) in, a whole Historical Bingo
// (CONTEXT.md) out, in one transaction: users, Signups, Teams, Tiles, images, standings and the Wise Old Man competition.
// See docs/historical-bingos-plan.md → Identity and Process. Not the Bingo export and import (bingoExportService),
// which only copies board templates.
//
// Everything is checked before anything is written, and every problem is reported at once. Files can't be part of the
// transaction, so the Tile images are written first and deleted again if the import fails.
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { validateHistoricalBundle, type HistoricalBundle } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, historicalStandings, nodes, signups, teamMembers, teams, tiles, users, womPastCompetitions } from "../db/schema";
import { audit } from "../audit/record";
import { now as clockNow } from "../clock";
import { isDevModeActive } from "../devMode";
import { ServiceError } from "./errors";
import { decodeExportImage, removeFiles, storeTileImage, type DecodedImage } from "./exportImages";
import { parseCompetitionSummary } from "./pastWomCompetitionService";
import { generateCodeword, nextTeamColor } from "./teamService";

type Db = BetterSQLite3Database<typeof schema>;

export interface HistoricalImportResult {
  bingo: typeof bingos.$inferSelect;
  /** Players who had no user yet, so one was made for them. */
  usersCreated: number;
}

/** A bundle that failed its checks: every problem, one per line, so the Site Admin can fix them all in one go. */
export class HistoricalBundleError extends ServiceError {
  problems: string[];
  constructor(problems: string[]) {
    super(400, `The bundle has ${problems.length === 1 ? "a problem" : `${problems.length} problems`}:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.problems = problems;
  }
}

function currentGuildId(): string {
  return process.env.DISCORD_GUILD_ID ?? "";
}

/**
 * The bundle, checked in full: its own shape (validateHistoricalBundle), then what only this server knows (the slug,
 * the WOM competition, whether each image really is one). Throws a HistoricalBundleError listing every problem.
 */
export async function checkHistoricalBundle(db: Db, input: unknown): Promise<{ bundle: HistoricalBundle; images: Map<string, DecodedImage> }> {
  // The test data generator's made-up Discord ids are only for dev servers (it imports its own bundles there).
  const check = validateHistoricalBundle(input, { devDiscordIds: isDevModeActive() });
  const problems = [...check.problems];
  const bundle = check.ok ? check.bundle : null;
  const raw = (typeof input === "object" && input !== null ? input : {}) as Partial<HistoricalBundle>;

  const slug = raw.bingo?.slug;
  if (typeof slug === "string" && db.select({ id: bingos.id }).from(bingos).where(eq(bingos.slug, slug)).get()) {
    problems.push(`bingo.slug: "${slug}" is taken. To import it again, delete that Bingo first`);
  }
  const womId = raw.wom?.competitionId;
  if (typeof womId === "number") {
    const linked = db
      .select({ name: bingos.name })
      .from(womPastCompetitions)
      .innerJoin(bingos, eq(womPastCompetitions.bingoId, bingos.id))
      .where(and(eq(womPastCompetitions.guildId, currentGuildId()), eq(womPastCompetitions.womId, womId)))
      .get();
    if (linked) problems.push(`wom.competitionId: Wise Old Man competition ${womId} already belongs to the Bingo "${linked.name}"`);
  }

  // Only the images a Tile uses are decoded (and later stored).
  const images = new Map<string, DecodedImage>();
  const used = new Set((Array.isArray(raw.tiles) ? raw.tiles : []).map((t) => t?.image).filter((name): name is string => typeof name === "string"));
  for (const name of used) {
    const image = raw.images && typeof raw.images === "object" ? (raw.images as Record<string, unknown>)[name] : undefined;
    if (image === undefined) continue; // already reported by the validator
    try {
      images.set(name, await decodeExportImage(image, `"${name}"`));
    } catch (err) {
      if (!(err instanceof ServiceError)) throw err;
      problems.push(`images["${name}"]: ${err.message.replace(/^Malformed import file: the image for "[^"]*" /, "")}`);
    }
  }

  if (problems.length > 0 || !bundle) throw new HistoricalBundleError(problems);
  return { bundle, images };
}

/** Checks a bundle and imports it as a new Historical Bingo, all or nothing. */
export async function importHistoricalBundle(db: Db, input: unknown, params: { createdByUserId: string; uploadsDir: string }): Promise<HistoricalImportResult> {
  const { bundle, images } = await checkHistoricalBundle(db, input);
  const written: string[] = [];
  try {
    const imageUrls = new Map<string, string>();
    for (const [name, image] of images) {
      const stored = await storeTileImage(params.uploadsDir, image);
      written.push(...stored.files);
      imageUrls.set(name, stored.url);
    }
    return writeHistoricalBingo(db, bundle, imageUrls, params.createdByUserId);
  } catch (err) {
    removeFiles(written);
    throw err;
  }
}

/** The import's one transaction, over a checked bundle whose images are already stored (`imageUrls`, by file name). */
export function writeHistoricalBingo(db: Db, bundle: HistoricalBundle, imageUrls: ReadonlyMap<string, string>, createdByUserId: string): HistoricalImportResult {
  return db.transaction((tx) => {
    const at = clockNow();
    const startsAt = new Date(bundle.bingo.startsAt);
    const endsAt = new Date(bundle.bingo.endsAt);

    // Users: found by Discord id. An existing user is left as they are; a new one is named from the clan's records,
    // or by the RSN they played under when they've left the clan (and then locked out like any non-member).
    let usersCreated = 0;
    const userIdByDiscordId = new Map<string, string>();
    for (const p of bundle.players) {
      const existing = tx.select({ id: users.id }).from(users).where(eq(users.discordId, p.discordId)).get();
      if (existing) {
        userIdByDiscordId.set(p.discordId, existing.id);
        continue;
      }
      const created = tx
        .insert(users)
        .values({ discordId: p.discordId, discordUsername: p.clan ? p.clan.name.trim() : p.rsn.trim(), inGuild: p.clan !== null, createdAt: at, updatedAt: at })
        .returning({ id: users.id })
        .get();
      userIdByDiscordId.set(p.discordId, created.id);
      usersCreated++;
    }

    const bingo = tx
      .insert(bingos)
      .values({
        slug: bundle.bingo.slug,
        name: bundle.bingo.name.trim(),
        description: bundle.bingo.description?.trim() || null,
        stage: "complete",
        historical: true,
        achievementsEnabled: false,
        boardRows: bundle.bingo.boardRows,
        boardCols: bundle.bingo.boardCols,
        rulesMarkdown: bundle.bingo.rulesMarkdown?.trim() || null,
        startsAt,
        endsAt,
        createdByUserId,
        createdAt: at,
      })
      .returning()
      .get();

    // A Signup per Player, under the RSN they played this Bingo with.
    for (const p of bundle.players) {
      tx.insert(signups).values({ bingoId: bingo.id, userId: userIdByDiscordId.get(p.discordId)!, rsn: p.rsn.trim(), createdAt: startsAt }).run();
    }

    // Teams: the Captain and co-captain lead, the rest are members.
    const teamIdByName = new Map<string, string>();
    const codewords = new Set<string>();
    for (const t of bundle.teams) {
      let codeword = generateCodeword();
      for (let n = 2; codewords.has(codeword); n++) codeword = `${generateCodeword()}-${n}`;
      codewords.add(codeword);
      const team = tx
        .insert(teams)
        .values({ bingoId: bingo.id, captainUserId: userIdByDiscordId.get(t.captain)!, name: t.name.trim(), codeword, color: t.color ?? nextTeamColor(tx, bingo.id), createdAt: at, updatedAt: at })
        .returning({ id: teams.id })
        .get();
      teamIdByName.set(t.name.trim().toLowerCase(), team.id);
      for (const discordId of t.players) {
        tx.insert(teamMembers)
          .values({ teamId: team.id, userId: userIdByDiscordId.get(discordId)!, isCaptain: discordId === t.captain, isCoCaptain: discordId === t.coCaptain, joinedAt: startsAt })
          .run();
      }
    }

    // Tiles: a picture each, no Tasks. Its points, when known, are its own node's.
    for (const t of bundle.tiles) {
      const node = tx.insert(nodes).values({ bingoId: bingo.id, kind: "ALL", points: t.points ?? 0 }).returning({ id: nodes.id }).get();
      tx.insert(tiles)
        .values({ bingoId: bingo.id, nodeId: node.id, name: t.name.trim(), imageUrl: imageUrls.get(t.image) ?? null, boardRow: t.boardRow, boardCol: t.boardCol, rulesText: t.rules?.trim() || null, createdAt: at })
        .run();
    }

    for (const s of bundle.standings) {
      tx.insert(historicalStandings).values({ bingoId: bingo.id, teamId: teamIdByName.get(s.team.trim().toLowerCase())!, place: s.place, points: s.points ?? null }).run();
    }

    // The WOM competition. Its row may already be here (added by hand, or left detached when an earlier import of
    // this Bingo was deleted): then it's refreshed and linked, since there's one row per competition.
    if (bundle.wom) {
      const summary = parseCompetitionSummary(bundle.wom.data);
      const values = { ...summary, bingoId: bingo.id, dataJson: JSON.stringify(bundle.wom.data), fetchedAt: at };
      const existing = tx
        .select({ id: womPastCompetitions.id })
        .from(womPastCompetitions)
        .where(and(eq(womPastCompetitions.guildId, currentGuildId()), eq(womPastCompetitions.womId, bundle.wom.competitionId)))
        .get();
      if (existing) tx.update(womPastCompetitions).set(values).where(eq(womPastCompetitions.id, existing.id)).run();
      else tx.insert(womPastCompetitions).values({ ...values, guildId: currentGuildId(), womId: bundle.wom.competitionId, addedByUserId: createdByUserId, createdAt: at }).run();
    }

    audit(tx, {
      action: "bingo.historical_imported",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: {
        slug: bingo.slug,
        name: bingo.name,
        source: bundle.source,
        counts: {
          tiles: bundle.tiles.length,
          teams: bundle.teams.length,
          players: bundle.players.length,
          usersCreated,
          unknownPlayers: bundle.unknownPlayers.length,
          standings: bundle.standings.length,
          womCompetition: bundle.wom !== null,
        },
      },
    });

    return { bingo, usersCreated };
  });
}
