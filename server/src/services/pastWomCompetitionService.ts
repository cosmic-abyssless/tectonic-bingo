// Stores a snapshot of a Wise Old Man competition's final results (issue
// #128), so a bingo's per-player EHP/EHB gains survive independently of
// WOM's own record of the competition. Two entry points:
//  - addPastCompetition: an admin pastes a WOM competition id in the site
//    admin panel (covers bingos that predate, or never used, this platform).
//  - archiveBingoCompetition: fired fire-and-forget from routes/mod.ts when
//    a bingo with a linked WOM competition (bingos.womCompetitionId) reaches
//    the `complete` stage, same convention as syncWomCompetitionAfterDraft —
//    never throws, swallows and logs failures instead of blocking the stage
//    change that triggered it.
import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PastBingoParticipation, WomPastCompetition } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, signups, womPastCompetitions } from "../db/schema";
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
    const match = (participations as RawParticipation[]).find((p) => typeof p.player?.username === "string" && rsns.has(normalizeRsn(p.player.username)));
    if (!match) continue;
    results.push({
      competitionId: row.id,
      womId: row.womId,
      bingoId: row.bingoId,
      title: row.title,
      metric: row.metric,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      gained: typeof match.progress?.gained === "number" ? match.progress.gained : 0,
    });
  }
  return results;
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
