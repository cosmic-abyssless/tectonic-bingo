// Stores a snapshot of a Wise Old Man competition's final results (issue
// #128), so a bingo's per-player EHP/EHB gains survive independently of
// WOM's own record of the competition. Entry points:
//  - addPastCompetition: an admin pastes a WOM competition id in the site
//    admin panel (covers bingos that predate, or never used, this platform).
//  - archiveBingoCompetition: fired fire-and-forget from routes/mod.ts when
//    a bingo with a linked WOM competition (bingos.womCompetitionId) reaches
//    the `complete` stage, same convention as syncWomCompetitionAfterDraft —
//    never throws, swallows and logs failures instead of blocking the stage
//    change that triggered it.
//  - mockPastCompetition: dev-only (issue #133), routes/dev.ts — fabricates
//    one, no network call, for local testing.
import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PastBingoParticipation, WomPastCompetition } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, signups, teamMembers, teams, womPastCompetitions } from "../db/schema";
import { ServiceError } from "./errors";
import { audit } from "../audit/record";
import { log } from "../log";
import { WomCompetitionClient, getWomCompetitionClient } from "./womCompetitionService";

type Db = BetterSQLite3Database<typeof schema>;

type Row = typeof womPastCompetitions.$inferSelect;

function toPublic(row: Row): WomPastCompetition {
  return {
    id: row.id,
    guildId: row.guildId,
    womId: row.womId,
    bingoId: row.bingoId,
    title: row.title,
    metric: row.metric,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    participantCount: row.participantCount,
    fetchedAt: row.fetchedAt.toISOString(),
    addedByUserId: row.addedByUserId,
  };
}

function currentGuildId(): string {
  return process.env.DISCORD_GUILD_ID ?? "";
}

interface RawCompetition {
  title?: unknown;
  metric?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  participations?: unknown[];
}

function parseCompetitionSummary(raw: unknown): { title: string; metric: string; startsAt: Date; endsAt: Date; participantCount: number } {
  const c = (raw ?? {}) as RawCompetition;
  const startsAt = typeof c.startsAt === "string" ? new Date(c.startsAt) : new Date();
  const endsAt = typeof c.endsAt === "string" ? new Date(c.endsAt) : new Date();
  return {
    title: typeof c.title === "string" && c.title ? c.title : "Untitled competition",
    metric: typeof c.metric === "string" && c.metric ? c.metric : "overall",
    startsAt: Number.isNaN(startsAt.getTime()) ? new Date() : startsAt,
    endsAt: Number.isNaN(endsAt.getTime()) ? new Date() : endsAt,
    participantCount: Array.isArray(c.participations) ? c.participations.length : 0,
  };
}

export function listPastCompetitions(db: Db): WomPastCompetition[] {
  return db.select().from(womPastCompetitions).where(eq(womPastCompetitions.guildId, currentGuildId())).orderBy(desc(womPastCompetitions.startsAt)).all().map(toPublic);
}

// WOM normalizes usernames to lowercase with runs of whitespace/underscores
// collapsed to a single underscore — match RSNs the same way so "Cosmic
// Abyss" (a signup RSN) lines up with WOM's "cosmic_abyss".
function normalizeRsn(rsn: string): string {
  return rsn.trim().toLowerCase().replace(/[\s_]+/g, "_");
}

interface RawParticipation {
  player?: { username?: unknown };
  progress?: { gained?: unknown };
}

/** Normalized signup RSNs of everyone on the user's team in that bingo, or null if there's no bingo or they had no team. */
function teamRsnsForBingo(db: Db, bingoId: string | null, userId: string): Set<string> | null {
  if (!bingoId) return null;
  const mine = db
    .select({ teamId: teams.id })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.bingoId, bingoId), eq(teamMembers.userId, userId)))
    .get();
  if (!mine) return null;
  const rows = db
    .select({ rsn: signups.rsn })
    .from(teamMembers)
    .innerJoin(signups, and(eq(signups.userId, teamMembers.userId), eq(signups.bingoId, bingoId)))
    .where(eq(teamMembers.teamId, mine.teamId))
    .all();
  return new Set(rows.map((r) => normalizeRsn(r.rsn)));
}

/**
 * Every stored past competition where one of this user's signup RSNs (any
 * bingo, past or present — a player's RSN can differ bingo to bingo) turns
 * up in the roster. Best-effort, RSN-matched only: there's no other shared
 * key between a platform user and an arbitrary WOM competition.
 */
export function getPastParticipationsForUser(db: Db, userId: string): PastBingoParticipation[] {
  const rsnRows = db.select({ rsn: signups.rsn }).from(signups).where(eq(signups.userId, userId)).all();
  const rsns = new Set(rsnRows.map((r) => normalizeRsn(r.rsn)));
  if (rsns.size === 0) return [];

  const rows = db.select().from(womPastCompetitions).where(eq(womPastCompetitions.guildId, currentGuildId())).orderBy(desc(womPastCompetitions.startsAt)).all();

  const results: PastBingoParticipation[] = [];
  for (const row of rows) {
    let raw: unknown;
    try {
      raw = JSON.parse(row.dataJson);
    } catch {
      continue;
    }
    const participations = (raw as { participations?: unknown[] } | null)?.participations;
    if (!Array.isArray(participations)) continue;
    const all = participations as RawParticipation[];
    const match = all.find((p) => typeof p.player?.username === "string" && rsns.has(normalizeRsn(p.player.username)));
    if (!match) continue;
    const gainedOf = (p: RawParticipation) => (typeof p.progress?.gained === "number" ? p.progress.gained : 0);
    const gained = gainedOf(match);
    // Ties share the better place.
    const rankAmong = (pool: RawParticipation[]) => 1 + pool.filter((p) => gainedOf(p) > gained).length;
    const team = teamRsnsForBingo(db, row.bingoId, userId);
    const teammates = team ? all.filter((p) => p === match || (typeof p.player?.username === "string" && team.has(normalizeRsn(p.player.username)))) : null;
    results.push({
      competitionId: row.id,
      womId: row.womId,
      bingoId: row.bingoId,
      title: row.title,
      metric: row.metric,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      gained,
      totalRank: rankAmong(all),
      totalParticipants: all.length,
      teamRank: teammates ? rankAmong(teammates) : null,
      teamSize: teammates ? teammates.length : null,
    });
  }
  return results;
}

export interface MockPastCompetitionParams {
  title?: string;
  metric?: string;
  gainedMin?: number;
  gainedMax?: number;
}

/**
 * Dev-only (issue #133): fabricates a WOM-shaped competition for an existing
 * bingo's current signups, no network call — one participation per RSN, each
 * given a random `gained` value. `womId` is negative so a mock can never
 * collide with, or be mistaken for, a real fetched competition.
 *
 * Unlike devTestDataService's helpers this isn't fenced to `testdata-`
 * bingos: it only adds one row (never touches users/teams/submissions), so
 * running it against the plain `db:seed:dev` bingo is fine — the dev-mode +
 * site-admin gate on its route is enough. Same exception generate-bingo's
 * "real HTTP only" rule already makes for fake signup WOM/CA stats: this
 * isn't simulating a player action, it's faking third-party data.
 */
export function mockPastCompetition(db: Db, bingoId: string, params: MockPastCompetitionParams = {}): WomPastCompetition {
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo) throw new ServiceError(404, "Bingo not found");
  const rsnRows = db.select({ rsn: signups.rsn }).from(signups).where(eq(signups.bingoId, bingoId)).all();
  if (rsnRows.length === 0) throw new ServiceError(400, "This bingo has no signups to mock a roster from");

  const guildId = currentGuildId();
  const metric = params.metric?.trim() || "ehp";
  const title = params.title?.trim() || `${bingo.name} (mock)`;
  const gainedMin = params.gainedMin ?? 5;
  const gainedMax = params.gainedMax ?? 500;
  const startsAt = bingo.startsAt ?? new Date();
  const endsAt = bingo.endsAt && bingo.endsAt > startsAt ? bingo.endsAt : new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const participations = rsnRows.map((r) => ({
    player: { username: normalizeRsn(r.rsn), displayName: r.rsn },
    progress: { start: 0, end: 0, gained: Math.round((gainedMin + Math.random() * (gainedMax - gainedMin)) * 100) / 100 },
  }));
  const dataJson = JSON.stringify({ title, metric, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), participations });

  // Negative, unique per guild — retry on the rare clash.
  let womId = -Math.floor(Math.random() * 1_000_000) - 1;
  while (db.select().from(womPastCompetitions).where(and(eq(womPastCompetitions.guildId, guildId), eq(womPastCompetitions.womId, womId))).get()) {
    womId -= 1;
  }

  const row = db
    .insert(womPastCompetitions)
    .values({ guildId, womId, bingoId, title, metric, startsAt, endsAt, participantCount: participations.length, dataJson, addedByUserId: null })
    .returning()
    .get();
  return toPublic(row);
}

/** Admin-triggered: fetch one WOM competition by id and store it. Throws ServiceError on a bad id, a duplicate, or a WOM API failure — the admin panel surfaces it directly. */
export async function addPastCompetition(db: Db, params: { womId: number; addedByUserId: string }, client: WomCompetitionClient = getWomCompetitionClient()): Promise<WomPastCompetition> {
  const guildId = currentGuildId();
  const existing = db.select().from(womPastCompetitions).where(and(eq(womPastCompetitions.guildId, guildId), eq(womPastCompetitions.womId, params.womId))).get();
  if (existing) throw new ServiceError(409, `Competition ${params.womId} has already been added`);

  let raw: unknown;
  try {
    raw = await client.getCompetition(params.womId);
  } catch (err) {
    throw new ServiceError(502, err instanceof Error ? err.message : String(err));
  }
  const summary = parseCompetitionSummary(raw);

  const row = db
    .insert(womPastCompetitions)
    .values({
      guildId,
      womId: params.womId,
      bingoId: null,
      title: summary.title,
      metric: summary.metric,
      startsAt: summary.startsAt,
      endsAt: summary.endsAt,
      participantCount: summary.participantCount,
      dataJson: JSON.stringify(raw),
      addedByUserId: params.addedByUserId,
    })
    .returning()
    .get();

  audit(db, {
    action: "wom_past_competition.added",
    bingoId: null,
    entity: { type: "wom_past_competition", id: row.id, label: row.title },
    details: { womId: row.womId, title: row.title, participantCount: row.participantCount, source: "manual" },
    actor: { userId: params.addedByUserId },
  });

  return toPublic(row);
}

export function renamePastCompetition(db: Db, id: string, title: string): WomPastCompetition {
  const trimmed = title.trim();
  if (!trimmed) throw new ServiceError(400, "title must not be empty");
  const existing = db.select().from(womPastCompetitions).where(eq(womPastCompetitions.id, id)).get();
  if (!existing) throw new ServiceError(404, "Past competition not found");
  const row = db.update(womPastCompetitions).set({ title: trimmed }).where(eq(womPastCompetitions.id, id)).returning().get();
  audit(db, {
    action: "wom_past_competition.renamed",
    bingoId: existing.bingoId,
    entity: { type: "wom_past_competition", id, label: row.title },
    details: { womId: existing.womId, from: existing.title, to: row.title },
  });
  return toPublic(row);
}

export function deletePastCompetition(db: Db, id: string): void {
  const existing = db.select().from(womPastCompetitions).where(eq(womPastCompetitions.id, id)).get();
  if (!existing) throw new ServiceError(404, "Past competition not found");
  db.delete(womPastCompetitions).where(eq(womPastCompetitions.id, id)).run();
  audit(db, {
    action: "wom_past_competition.deleted",
    bingoId: existing.bingoId,
    entity: { type: "wom_past_competition", id, label: existing.title },
    details: { womId: existing.womId, title: existing.title },
  });
}

/**
 * Fired once a bingo reaches `complete`. No-ops when the bingo never created
 * a WOM competition, or that competition was already archived.
 */
export async function archiveBingoCompetition(db: Db, bingoId: string, client: WomCompetitionClient = getWomCompetitionClient()): Promise<void> {
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo || !bingo.womCompetitionId) return;
  const guildId = currentGuildId();
  const existing = db.select().from(womPastCompetitions).where(and(eq(womPastCompetitions.guildId, guildId), eq(womPastCompetitions.womId, bingo.womCompetitionId))).get();
  if (existing) return;

  try {
    const raw = await client.getCompetition(bingo.womCompetitionId);
    const summary = parseCompetitionSummary(raw);
    const row = db
      .insert(womPastCompetitions)
      .values({
        guildId,
        womId: bingo.womCompetitionId,
        bingoId,
        title: summary.title,
        metric: summary.metric,
        startsAt: summary.startsAt,
        endsAt: summary.endsAt,
        participantCount: summary.participantCount,
        dataJson: JSON.stringify(raw),
        addedByUserId: null,
      })
      .returning()
      .get();
    audit(db, {
      action: "wom_past_competition.added",
      bingoId,
      entity: { type: "wom_past_competition", id: row.id, label: row.title },
      details: { womId: row.womId, title: row.title, participantCount: row.participantCount, source: "auto" },
      actor: "system",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("wom past competition archive failed", { bingoId, womId: bingo.womCompetitionId, err: message });
  }
}
