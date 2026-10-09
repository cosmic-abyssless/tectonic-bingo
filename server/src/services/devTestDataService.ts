// Dev-only helpers behind /api/dev (routes/dev.ts): make the throwaway users the test data generator
// signs up, list the bingos it made, and tear one down. Everything here is fenced to the "testdata-"
// prefix so it can never touch a real bingo or user. See docs/generate-bingo-plan.md.
import { and, eq, inArray, like, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { auditLog, bingoModerators, bingoStaff, bingos, signups, teamMembers, teams, users, womPastCompetitions } from "../db/schema";
import { now as clockNow } from "../clock";
import { ServiceError } from "./errors";
import { deleteBingo } from "./bingoService";
import { fakePlayerStats } from "./fakePlayerStats";

type Db = BetterSQLite3Database<typeof schema>;

export const TESTDATA_PREFIX = "testdata-";

export interface CreateTestUserParams {
  discordId: string;
  discordUsername: string;
  discordGlobalName?: string | null;
  discordAvatar?: string | null;
}

export function createTestUser(db: Db, params: CreateTestUserParams) {
  if (!params.discordId?.startsWith(TESTDATA_PREFIX)) throw new ServiceError(400, `discordId must start with "${TESTDATA_PREFIX}"`);
  if (!params.discordUsername?.trim()) throw new ServiceError(400, "discordUsername is required");
  if (db.select({ id: users.id }).from(users).where(eq(users.discordId, params.discordId)).get()) {
    throw new ServiceError(409, "A user with that discordId already exists");
  }
  const at = clockNow();
  return db
    .insert(users)
    .values({
      discordId: params.discordId,
      discordUsername: params.discordUsername.trim(),
      discordGlobalName: params.discordGlobalName ?? null,
      discordAvatar: params.discordAvatar ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
    .get();
}

export function listTestDataBingos(db: Db) {
  return db
    .select({ id: bingos.id, slug: bingos.slug, name: bingos.name, stage: bingos.stage, createdAt: bingos.createdAt })
    .from(bingos)
    .where(like(bingos.slug, `${TESTDATA_PREFIX}%`))
    .all();
}

/**
 * Gives every signup of a generated bingo made-up WOM, RuneProfile and combat achievement stats (the ones the signup
 * seed tool uses), so the roster's stats columns have something to show. Signups made through the real endpoint with
 * the integrations off have none. Random, not seeded.
 */
export function fillFakeStats(db: Db, slug: string): { signups: number } {
  if (!slug.startsWith(TESTDATA_PREFIX)) throw new ServiceError(400, `Only "${TESTDATA_PREFIX}" bingos can be filled with fake stats`);
  const bingo = db.select({ id: bingos.id }).from(bingos).where(eq(bingos.slug, slug)).get();
  if (!bingo) throw new ServiceError(404, "Bingo not found");
  const rows = db.select({ id: signups.id, rsn: signups.rsn }).from(signups).where(eq(signups.bingoId, bingo.id)).all();
  const at = clockNow();
  for (const row of rows) {
    const { womDataJson, runeProfileDataJson, caCurrentJson, caPeakJson } = fakePlayerStats(row.rsn);
    db.update(signups).set({ womDataJson, runeProfileDataJson, caCurrentJson, caPeakJson, statsFetchedAt: at }).where(eq(signups.id, row.id)).run();
  }
  return { signups: rows.length };
}

export interface TeardownResult {
  /** The /uploads/... URLs only this bingo used (deleteBingo), for the caller to unlink. */
  urls: string[];
  /** Test users removed because nothing else uses them. */
  usersDeleted: number;
  /** The deleted bingo's id, for cleaning up what it left in Discord (its discord_resources rows outlive it). */
  bingoId: string;
}

/**
 * Deletes a generated bingo completely: the bingo and everything hanging off it (bingoService.deleteBingo),
 * its audit rows (which deleteBingo keeps on purpose, as an append-only log), and any testdata- user that no
 * longer belongs to any bingo. Returns the upload URLs to remove from disk.
 */
export function teardownTestBingo(db: Db, slug: string): TeardownResult {
  if (!slug.startsWith(TESTDATA_PREFIX)) throw new ServiceError(400, `Only bingos whose slug starts with "${TESTDATA_PREFIX}" can be torn down here`);
  const bingo = db.select().from(bingos).where(eq(bingos.slug, slug)).get();
  if (!bingo) throw new ServiceError(404, "Bingo not found");

  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingo.id)).all().map((t) => t.id);

  const candidateIds = new Set<string>();
  for (const s of db.select({ id: signups.userId }).from(signups).where(eq(signups.bingoId, bingo.id)).all()) candidateIds.add(s.id);
  if (teamIds.length > 0) for (const m of db.select({ id: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all()) candidateIds.add(m.id);
  // Staff need not sign up, so they may be in the bingo only as Staff.
  for (const s of db.select({ id: bingoStaff.userId }).from(bingoStaff).where(eq(bingoStaff.bingoId, bingo.id)).all()) candidateIds.add(s.id);
  // deleteBingo only detaches these (bingoService.ts — a real archived competition outlives its bingo on
  // purpose), so a mocked one (issue #133) needs deleting here or it lingers as an orphan forever.
  const pastCompetitionIds = db.select({ id: womPastCompetitions.id }).from(womPastCompetitions).where(eq(womPastCompetitions.bingoId, bingo.id)).all().map((c) => c.id);

  const { files } = deleteBingo(db, bingo.id);
  db.delete(auditLog).where(eq(auditLog.bingoId, bingo.id)).run();
  if (pastCompetitionIds.length > 0) db.delete(womPastCompetitions).where(inArray(womPastCompetitions.id, pastCompetitionIds)).run();

  const testUserIds = candidateIds.size
    ? db.select({ id: users.id }).from(users).where(and(inArray(users.id, [...candidateIds]), like(users.discordId, `${TESTDATA_PREFIX}%`))).all().map((u) => u.id)
    : [];
  let usersDeleted = 0;
  for (const id of testUserIds) {
    const stillUsed =
      db.select({ id: signups.id }).from(signups).where(eq(signups.userId, id)).get() ||
      db.select({ id: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.userId, id)).get() ||
      db.select({ id: bingoModerators.userId }).from(bingoModerators).where(eq(bingoModerators.userId, id)).get() ||
      db.select({ id: bingoStaff.userId }).from(bingoStaff).where(eq(bingoStaff.userId, id)).get() ||
      db.select({ id: auditLog.id }).from(auditLog).where(or(eq(auditLog.actorUserId, id), eq(auditLog.onBehalfOfUserId, id))).get();
    if (stillUsed) continue;
    try {
      db.delete(users).where(eq(users.id, id)).run();
      usersDeleted++;
    } catch {
      // Something we didn't think of still points at this user; leaving one throwaway row is harmless.
    }
  }
  return { urls: files, usersDeleted, bingoId: bingo.id };
}
