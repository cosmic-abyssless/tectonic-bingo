// Historical Bingos (CONTEXT.md "Historical Bingo", docs/historical-bingos-plan.md): what one shows besides its board,
// and what it recorded. A Historical Bingo is always Finished and read-only: requireBingo refuses every write to one,
// and advanceStage refuses to move it. What it never recorded is decided per feature by whether the data is there
// (getRecorded), so a rich import (Tier 2) that has Submissions or a Draft shows them without any change here.
import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { NOT_RECORDED_HISTORICAL, type HistoricalBingoResponse, type HistoricalRecorded, type HistoricalStanding, type WomLeaderboard, type WomLeaderboardPlayer, type WomLeaderboardTeam } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, draftPicks, historicalStandings, nodeEdges, signupQuestions, signups, submissions, teamMembers, teams, tiles, users, womPastCompetitions, womSnapshots } from "../db/schema";
import { ServiceError } from "./errors";
import { PUBLIC_USER_COLS } from "./userService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type BingoRow = typeof bingos.$inferSelect;

/** Whether the Bingo has any rows behind each feature. Cheap: one EXISTS-style lookup each. */
export function getRecorded(db: Db | Tx, bingoId: string): HistoricalRecorded {
  const tileNodeIds = db.select({ id: tiles.nodeId }).from(tiles).where(eq(tiles.bingoId, bingoId));
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId));
  return {
    tasks: !!db.select({ id: nodeEdges.id }).from(nodeEdges).where(inArray(nodeEdges.parentId, tileNodeIds)).limit(1).get(),
    submissions: !!db.select({ id: submissions.id }).from(submissions).where(inArray(submissions.teamId, teamIds)).limit(1).get(),
    signupRoster: !!db.select({ id: signupQuestions.id }).from(signupQuestions).where(and(eq(signupQuestions.bingoId, bingoId), eq(signupQuestions.form, "signup"))).limit(1).get(),
    draft: !!db.select({ id: draftPicks.id }).from(draftPicks).where(eq(draftPicks.bingoId, bingoId)).limit(1).get(),
    womSnapshots: !!db.select({ id: womSnapshots.id }).from(womSnapshots).where(eq(womSnapshots.bingoId, bingoId)).limit(1).get(),
  };
}

/** The shell's `historical`: the recorded features of a Historical Bingo, null for any other. */
export function recordedFor(db: Db, bingo: BingoRow): HistoricalRecorded | null {
  return bingo.historical ? getRecorded(db, bingo.id) : null;
}

/**
 * Throws "Not recorded for historical Bingos" (404) when the Bingo is historical and the feature's data isn't there.
 * `feature` null: a feature every Historical Bingo leaves off (Wrapped, the audit log, Achievements).
 */
export function assertRecorded(db: Db, bingo: BingoRow, feature: keyof HistoricalRecorded | null): void {
  if (!bingo.historical) return;
  if (feature && getRecorded(db, bingo.id)[feature]) return;
  throw new ServiceError(404, NOT_RECORDED_HISTORICAL);
}

export function getStandings(db: Db | Tx, bingoId: string): HistoricalStanding[] {
  return db
    .select({ teamId: teams.id, teamName: teams.name, teamColor: teams.color, place: historicalStandings.place, points: historicalStandings.points })
    .from(historicalStandings)
    .innerJoin(teams, eq(historicalStandings.teamId, teams.id))
    .where(eq(historicalStandings.bingoId, bingoId))
    .all()
    .sort((a, b) => a.place - b.place || a.teamName.localeCompare(b.teamName));
}

// WOM normalizes usernames to lowercase with runs of whitespace/underscores collapsed to one underscore (see
// pastWomCompetitionService.normalizeRsn); team names are matched the same forgiving way.
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, "_");
}

interface RawParticipation {
  player?: { id?: unknown; username?: unknown; displayName?: unknown };
  teamName?: unknown;
  progress?: { gained?: unknown };
}

/**
 * The Bingo's Wise Old Man gains leaderboard, per Team and per Player, from the competition stored for it
 * (wom_past_competitions.bingoId). A participant maps to a Player by the Wise Old Man account on their Signup (which
 * holds even if the account's been renamed since), else by their Signup's RSN, and so to that Player's Team; one who maps to nobody (an `unknown` Player) keeps the team WOM gave them and shows by RSN only.
 */
export function getWomLeaderboard(db: Db, bingoId: string): WomLeaderboard | null {
  const row = db.select().from(womPastCompetitions).where(eq(womPastCompetitions.bingoId, bingoId)).get();
  if (!row) return null;
  let raw: { participations?: unknown[] } | null;
  try {
    raw = JSON.parse(row.dataJson) as { participations?: unknown[] } | null;
  } catch {
    raw = null;
  }
  const participations = (Array.isArray(raw?.participations) ? raw.participations : []) as RawParticipation[];

  const teamRows = db.select({ id: teams.id, name: teams.name, color: teams.color }).from(teams).where(eq(teams.bingoId, bingoId)).all();
  const teamByName = new Map(teamRows.map((t) => [normalize(t.name), t]));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));
  const signupRows = db
    .select({ rsn: signups.rsn, womId: signups.womId, user: PUBLIC_USER_COLS })
    .from(signups)
    .innerJoin(users, eq(signups.userId, users.id))
    .where(eq(signups.bingoId, bingoId))
    .all();
  const signupByRsn = new Map(signupRows.map((s) => [normalize(s.rsn), s]));
  const signupByWomId = new Map(signupRows.filter((s) => s.womId).map((s) => [s.womId!, s]));
  const teamOfUser = new Map(
    db
      .select({ userId: teamMembers.userId, teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, teamRows.map((t) => t.id)))
      .all()
      .map((m) => [m.userId, m.teamId]),
  );

  const players: WomLeaderboardPlayer[] = [];
  for (const p of participations) {
    const username = typeof p.player?.username === "string" ? p.player.username : null;
    if (!username) continue;
    const displayName = typeof p.player?.displayName === "string" && p.player.displayName ? p.player.displayName : username;
    const gained = typeof p.progress?.gained === "number" ? p.progress.gained : 0;
    const womId = typeof p.player?.id === "number" ? String(p.player.id) : null;
    const signup = (womId ? signupByWomId.get(womId) : undefined) ?? signupByRsn.get(normalize(username)) ?? signupByRsn.get(normalize(displayName));
    const womTeamName = typeof p.teamName === "string" && p.teamName ? p.teamName : null;
    const team = (signup && teamById.get(teamOfUser.get(signup.user.id) ?? "")) || (womTeamName ? teamByName.get(normalize(womTeamName)) : undefined);
    players.push({
      rsn: signup?.rsn ?? displayName,
      user: signup ? { ...signup.user, rsn: signup.rsn } : null,
      teamId: team?.id ?? null,
      teamName: team?.name ?? womTeamName,
      gained,
    });
  }
  players.sort((a, b) => b.gained - a.gained || a.rsn.localeCompare(b.rsn));

  const totals = new Map<string, WomLeaderboardTeam>();
  for (const p of players) {
    if (!p.teamName) continue;
    const key = p.teamId ?? `wom:${normalize(p.teamName)}`;
    const entry = totals.get(key) ?? { teamId: p.teamId, name: p.teamName, color: p.teamId ? (teamById.get(p.teamId)?.color ?? null) : null, gained: 0, players: 0 };
    entry.gained += p.gained;
    entry.players += 1;
    totals.set(key, entry);
  }
  const teamsOut = [...totals.values()].map((t) => ({ ...t, gained: Math.round(t.gained * 100) / 100 })).sort((a, b) => b.gained - a.gained || a.name.localeCompare(b.name));

  return {
    womId: row.womId,
    title: row.title,
    metric: row.metric,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    teams: teamsOut,
    players,
  };
}

export function getHistoricalBingo(db: Db, bingo: BingoRow): HistoricalBingoResponse {
  if (!bingo.historical) throw new ServiceError(404, "This isn't a historical Bingo");
  return { recorded: getRecorded(db, bingo.id), standings: getStandings(db, bingo.id), wom: getWomLeaderboard(db, bingo.id) };
}

/** Removes a Historical Bingo's own rows; called from bingoService.deleteBingo before its Teams go. */
export function deleteHistoricalRows(tx: Tx, bingoId: string): void {
  tx.delete(historicalStandings).where(eq(historicalStandings.bingoId, bingoId)).run();
}

/** Used by the Stage guard: a Historical Bingo's Stage never changes. */
export function assertNotHistorical(bingo: Pick<BingoRow, "historical">, what: string): void {
  if (bingo.historical) throw new ServiceError(409, `Historical Bingos are read-only: ${what}`);
}
