// Site admin → Import historical Bingo (#311): a bundle (shared/src/historicalBundle.ts) in, a whole Historical Bingo
// (CONTEXT.md) out, in one transaction: users, Signups, Teams, Tiles, images, standings and the Wise Old Man competition.
// See docs/historical-bingos-plan.md → Identity and Process. Not the Bingo export and import (bingoExportService),
// which only copies board templates.
//
// Everything is checked before anything is written, and every problem is reported at once. Files can't be part of the
// transaction, so the Tile images are written first and deleted again if the import fails.
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { validateHistoricalBundle, type GraphNodeInput, type HistoricalBundle, type HistoricalBundleNode, type HistoricalBundleTask, type HistoricalImportScoring } from "@bingo/shared";
import * as schema from "../db/schema";
import {
  bingoLines, bingos, claims, draftPicks, historicalStandings, nodeEdges, nodes, signupAnswers, signupQuestions, signups, submissionScreenshots, submissions, teamMembers, teamNodeState, teams, tiles, users, womPastCompetitions,
} from "../db/schema";
import { audit } from "../audit/record";
import { now as clockNow } from "../clock";
import { isDevModeActive } from "../devMode";
import { ServiceError } from "./errors";
import { decodeExportImage, removeFiles, storeTileImage, type DecodedImage } from "./exportImages";
import { parseCompetitionSummary } from "./pastWomCompetitionService";
import { generateCodeword, nextTeamColor } from "./teamService";
import { insertSubtree } from "./graphService";
import { rebuildTeamState } from "./scoringService";

type Db = BetterSQLite3Database<typeof schema>;

export interface HistoricalImportResult {
  bingo: typeof bingos.$inferSelect;
  /** Players who had no user yet, so one was made for them. */
  usersCreated: number;
  /** A rich Bingo's scoring, recomputed by the engine from its Submissions; null for a sparse one. */
  scoring: HistoricalImportScoring | null;
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
    const cutSignups = (bundle.signups?.entries ?? []).filter((e) => e.cut);

    // Users: found by Discord id. An existing user is left as they are; a new one is named from the clan's records,
    // or by the RSN they played under when they've left the clan (and then locked out like any non-member). Cut
    // signups bring their own RSN and clan name.
    let usersCreated = 0;
    const userIdByDiscordId = new Map<string, string>();
    for (const p of [...bundle.players, ...cutSignups.map((e) => ({ discordId: e.discordId, rsn: e.rsn!, clan: e.clan ?? null }))]) {
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
    const userOf = (discordId: string) => userIdByDiscordId.get(discordId)!;

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

    writeSignups(tx, bingo.id, bundle, userOf, startsAt);

    // Teams: the Captain and co-captain lead, the rest are members.
    const teamIdByName = new Map<string, string>();
    const captainOf = new Map<string, string>(); // Team id → Captain's user id
    const codewords = new Set<string>();
    const draftOrder = (bundle.draft?.order ?? []).map((n) => n.trim().toLowerCase());
    for (const t of bundle.teams) {
      let codeword = generateCodeword();
      for (let n = 2; codewords.has(codeword); n++) codeword = `${generateCodeword()}-${n}`;
      codewords.add(codeword);
      const position = draftOrder.indexOf(t.name.trim().toLowerCase());
      const team = tx
        .insert(teams)
        .values({
          bingoId: bingo.id, captainUserId: userOf(t.captain), name: t.name.trim(), codeword, color: t.color ?? nextTeamColor(tx, bingo.id),
          draftOrder: position >= 0 ? position + 1 : null, createdAt: at, updatedAt: at,
        })
        .returning({ id: teams.id })
        .get();
      teamIdByName.set(t.name.trim().toLowerCase(), team.id);
      captainOf.set(team.id, userOf(t.captain));
      for (const discordId of t.players) {
        tx.insert(teamMembers).values({ teamId: team.id, userId: userOf(discordId), isCaptain: discordId === t.captain, isCoCaptain: discordId === t.coCaptain, joinedAt: startsAt }).run();
      }
    }
    const teamId = (name: string) => teamIdByName.get(name.trim().toLowerCase())!;

    // Tiles: a picture each; its points, when known, are its own node's (with Tasks, the bonus for all of them).
    const nodeIdByKey = new Map<string, string>();
    const tileIdAt = new Map<string, { id: string; nodeId: string }>();
    const manualCompletions: { nodeId: string; completions: NonNullable<HistoricalBundleTask["completions"]> }[] = [];
    let hasTasks = false;
    for (const t of bundle.tiles) {
      const node = tx.insert(nodes).values({ bingoId: bingo.id, kind: "ALL", points: t.points ?? 0 }).returning({ id: nodes.id }).get();
      const tile = tx
        .insert(tiles)
        .values({
          bingoId: bingo.id, nodeId: node.id, name: t.name.trim(), imageUrl: imageUrls.get(t.image) ?? null, boardRow: t.boardRow, boardCol: t.boardCol, rulesText: t.rules?.trim() || null,
          hasFreezePeriod: !!t.freezeMinutes, freezeDurationMinutes: t.freezeMinutes ?? 0, requiresProof: t.requiresProof === true, proofNote: t.requiresProof ? t.proofNote?.trim() || null : null, createdAt: at,
        })
        .returning({ id: tiles.id })
        .get();
      tileIdAt.set(`${t.boardRow},${t.boardCol}`, { id: tile.id, nodeId: node.id });
      let previous: string | null = null;
      for (const [i, task] of (t.tasks ?? []).entries()) {
        hasTasks = true;
        const settings = { description: task.description ?? null, pointsGateNodeId: task.withholdUntilPrevious ? previous : null, requiresProof: task.requiresProof === true, proofNote: task.proofNote ?? null };
        const taskNodeId = insertBundleNode(tx, bingo.id, task, nodeIdByKey, settings);
        tx.insert(nodeEdges).values({ parentId: node.id, childId: taskNodeId, sortOrder: i }).run();
        if (task.kind === "MANUAL" && task.completions?.length) manualCompletions.push({ nodeId: taskNodeId, completions: task.completions });
        previous = taskNodeId;
      }
    }

    // Lines: an ALL over their Tiles' nodes, whose points are the Line bonus.
    for (const l of bundle.lines ?? []) {
      const nodeId = insertSubtree(tx, bingo.id, { kind: "ALL", points: l.points });
      lineCells(l, bundle.bingo.boardRows, bundle.bingo.boardCols).forEach((c, i) => {
        const tile = tileIdAt.get(`${c.boardRow},${c.boardCol}`);
        if (tile) tx.insert(nodeEdges).values({ parentId: nodeId, childId: tile.nodeId, sortOrder: i }).run();
      });
      tx.insert(bingoLines).values({ bingoId: bingo.id, nodeId, lineType: l.type, lineIndex: l.index }).run();
    }

    // Submissions, reviewed when they were, by nobody recorded. Screenshots wait for their upload (#320).
    for (const sub of bundle.submissions ?? []) {
      const kind = sub.kind ?? "drop";
      const proofTile = kind === "proof" && sub.proof ? tileIdAt.get(`${sub.proof.boardRow},${sub.proof.boardCol}`) : undefined;
      const submittedAt = new Date(sub.submittedAt);
      const row = tx
        .insert(submissions)
        .values({
          teamId: teamId(sub.team), submittedByUserId: userOf(sub.player), kind, proofTileId: proofTile?.id ?? null, proofTaskId: kind === "proof" && sub.proof?.task ? nodeIdByKey.get(sub.proof.task)! : null,
          status: sub.status, submittedAt, reviewedAt: new Date(sub.reviewedAt), reviewedByUserId: null, createdAt: submittedAt, updatedAt: new Date(sub.reviewedAt),
        })
        .returning({ id: submissions.id })
        .get();
      if (sub.screenshot) {
        tx.insert(submissionScreenshots).values({ submissionId: row.id, screenshotType: kind === "proof" ? "proof" : "main", storageUrl: "", historicalKey: sub.screenshot, uploadedAt: submittedAt }).run();
      }
      for (const c of kind === "drop" ? (sub.claims ?? []) : []) {
        tx.insert(claims).values({ submissionId: row.id, nodeId: nodeIdByKey.get(c.leaf)!, itemName: c.item?.trim() || null, quantity: c.quantity, gpValue: c.value ?? null }).run();
      }
    }
    // A MANUAL Task given to a Team: an approved claim on it, credited to the Team's Captain, with no screenshot.
    for (const { nodeId, completions } of manualCompletions) {
      for (const c of completions) {
        const when = new Date(c.at);
        const team = teamId(c.team);
        const row = tx
          .insert(submissions)
          .values({ teamId: team, submittedByUserId: captainOf.get(team)!, status: "approved", submittedAt: when, reviewedAt: when, createdAt: when, updatedAt: when })
          .returning({ id: submissions.id })
          .get();
        tx.insert(claims).values({ submissionId: row.id, nodeId, itemName: null, quantity: 1 }).run();
      }
    }

    // The Draft: every pick, made by its Team's Captain.
    if (bundle.draft) {
      const draftAt = new Date(bundle.draft.at);
      for (const p of bundle.draft.picks) {
        const team = teamId(p.team);
        tx.insert(draftPicks).values({ bingoId: bingo.id, pickNumber: p.pick, teamId: team, userId: userOf(p.player), pickedByUserId: captainOf.get(team)!, createdAt: draftAt }).run();
      }
    }

    for (const s of bundle.standings) {
      tx.insert(historicalStandings).values({ bingoId: bingo.id, teamId: teamId(s.team), place: s.place, points: s.points ?? null }).run();
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

    // Scoring, recomputed by the same engine a live Bingo uses, from the approved Claims: never taken from the old site.
    let scoring: HistoricalImportScoring | null = null;
    if (hasTasks) {
      for (const id of teamIdByName.values()) rebuildTeamState(tx, id);
      scoring = scoringOf(tx, bundle, bingo.id, teamId, startsAt, endsAt);
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
          ...(hasTasks || bundle.submissions || bundle.signups || bundle.draft
            ? {
                tasks: bundle.tiles.reduce((n, t) => n + (t.tasks?.length ?? 0), 0),
                lines: bundle.lines?.length ?? 0,
                submissions: bundle.submissions?.length ?? 0,
                signups: bundle.signups?.entries.length ?? 0,
                cutSignups: cutSignups.length,
                draftPicks: bundle.draft?.picks.length ?? 0,
              }
            : {}),
        },
      },
    });

    return { bingo, usersCreated, scoring };
  });
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Creates a bundle node and its subtree, recording each node's id by its key (for Claims, Proof screenshots and the
 * stubs that reuse a leaf). A stub isn't created: the leaf written earlier is linked in again, so a Claim on it counts
 * toward both of its Tasks. `settings`: a Task's own, on its root.
 */
function insertBundleNode(tx: Tx, bingoId: string, n: HistoricalBundleNode, idByKey: Map<string, string>, settings: Partial<GraphNodeInput> = {}): string {
  if ("reuse" in n) return idByKey.get(n.key)!;
  const base = { ...settings, label: n.label?.trim() || null, points: n.points ?? 0 };
  const input: GraphNodeInput =
    n.kind === "ITEM"
      ? { ...base, kind: "ITEM", itemName: n.item.trim(), countsAs: n.countsAs ?? 1, valuedAs: n.valuedAs ? { itemName: n.valuedAs.itemName.trim(), divisor: n.valuedAs.divisor, source: n.valuedAs.source?.trim() || null } : null }
      : n.kind === "MANUAL"
        ? { ...base, kind: "MANUAL" }
        : n.kind === "COUNT"
          ? { ...base, kind: "COUNT", minCount: n.min }
          : n.kind === "SUM"
            ? { ...base, kind: "SUM", quantity: n.quantity }
            : { ...base, kind: n.kind };
  const id = insertSubtree(tx, bingoId, input);
  if (n.key) idByKey.set(n.key, id);
  ("children" in n ? n.children : []).forEach((c, i) => {
    tx.insert(nodeEdges).values({ parentId: id, childId: insertBundleNode(tx, bingoId, c, idByKey), sortOrder: i }).run();
  });
  return id;
}

/** A Line's Tiles, by position: given for a custom Line, worked out for the rest. */
function lineCells(l: NonNullable<HistoricalBundle["lines"]>[number], rows: number, cols: number): { boardRow: number; boardCol: number }[] {
  if (l.type === "custom") return l.cells ?? [];
  if (l.type === "row") return Array.from({ length: cols }, (_, c) => ({ boardRow: l.index, boardCol: c }));
  if (l.type === "column") return Array.from({ length: rows }, (_, r) => ({ boardRow: r, boardCol: l.index }));
  return Array.from({ length: rows }, (_, i) => ({ boardRow: i, boardCol: l.index === 0 ? i : cols - 1 - i }));
}

/**
 * Signups: with a rich bundle's `signups`, its questions (as text, seen by Captains and up) and every entry at its
 * time with its answers, Cut signups included; otherwise one per Player at the start. A Player's Signup carries the RSN
 * they played under (`players`); a Cut signup's own.
 */
function writeSignups(tx: Tx, bingoId: string, bundle: HistoricalBundle, userOf: (discordId: string) => string, startsAt: Date): void {
  const rsnOf = new Map(bundle.players.map((p) => [p.discordId, p.rsn.trim()]));
  // The Wise Old Man account they played on, kept as text like a live signup's, for the leaderboard to find them by.
  const womIdOf = (p: HistoricalBundle["players"][number]) => (p.womId ? String(p.womId) : null);
  const womIdOfDiscord = new Map(bundle.players.map((p) => [p.discordId, womIdOf(p)]));
  if (!bundle.signups) {
    for (const p of bundle.players) tx.insert(signups).values({ bingoId, userId: userOf(p.discordId), rsn: p.rsn.trim(), womId: womIdOf(p), createdAt: startsAt }).run();
    return;
  }
  const questionId = new Map<string, string>();
  bundle.signups.questions.forEach((q, i) => {
    const row = tx.insert(signupQuestions).values({ bingoId, prompt: q.prompt.trim(), type: q.type, sortOrder: i, visibility: "captains" }).returning({ id: signupQuestions.id }).get();
    questionId.set(q.key, row.id);
  });
  for (const e of bundle.signups.entries) {
    const signup = tx
      .insert(signups)
      .values({ bingoId, userId: userOf(e.discordId), rsn: e.cut ? e.rsn!.trim() : rsnOf.get(e.discordId)!, womId: e.cut ? null : (womIdOfDiscord.get(e.discordId) ?? null), timezone: e.timezone, createdAt: new Date(e.signedUpAt) })
      .returning({ id: signups.id })
      .get();
    for (const [key, value] of Object.entries(e.answers)) {
      if (value.trim()) tx.insert(signupAnswers).values({ signupId: signup.id, questionId: questionId.get(key)!, value }).run();
    }
  }
}

/**
 * Each Team's recomputed total and its points by day (UTC), start to end, for the converter to check against the old
 * site's. Points a Task withheld until the one before it count on the day that one completed, as Rewind has them.
 */
function scoringOf(tx: Tx, bundle: HistoricalBundle, bingoId: string, teamId: (name: string) => string, startsAt: Date, endsAt: Date): HistoricalImportScoring {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const days: string[] = [];
  for (let d = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate())); d <= endsAt; d = new Date(d.getTime() + 86_400_000)) days.push(day(d));
  const gateOf = new Map(
    tx.select({ id: nodes.id, gate: nodes.pointsGateNodeId }).from(nodes).where(eq(nodes.bingoId, bingoId)).all().filter((n) => n.gate).map((n) => [n.id, n.gate!]),
  );
  return {
    teams: bundle.teams.map((t) => {
      const rows = tx.select({ nodeId: teamNodeState.nodeId, completedAt: teamNodeState.completedAt, points: teamNodeState.pointsAwarded }).from(teamNodeState).where(eq(teamNodeState.teamId, teamId(t.name))).all();
      const completedAt = new Map(rows.map((r) => [r.nodeId, r.completedAt]));
      const byDay = new Map<string, number>();
      for (const r of rows) {
        if (!r.points) continue;
        const gate = gateOf.has(r.nodeId) ? completedAt.get(gateOf.get(r.nodeId)!) : undefined;
        const when = day(gate && gate > r.completedAt ? gate : r.completedAt);
        byDay.set(when, (byDay.get(when) ?? 0) + r.points);
      }
      const allDays = [...new Set([...days, ...byDay.keys()])].sort();
      return { team: t.name, total: rows.reduce((n, r) => n + r.points, 0), perDay: allDays.map((date) => ({ date, points: byDay.get(date) ?? 0 })) };
    }),
  };
}
