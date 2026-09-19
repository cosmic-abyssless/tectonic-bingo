// Dev-only helpers behind /api/dev (routes/dev.ts): make the throwaway users the test data generator
// signs up, list the bingos it made, and tear one down. Everything here is fenced to the "testdata-"
// prefix so it can never touch a real bingo or user. See docs/test-data-generator-plan.md.
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, like, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { auditLog, bingoModerators, bingos, signups, submissionScreenshots, submissions, teamMembers, teams, tiles, users } from "../db/schema";
import { now as clockNow } from "../clock";
import { ServiceError } from "./errors";
import { deleteBingo } from "./bingoService";
import { removeFiles } from "./exportImages";
import { FULL_SUFFIX, THUMB_SUFFIX, VARIANT_EXT } from "./imageService";

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

export interface TeardownResult {
  /** The /uploads/... URLs of the tile images and submission screenshots the bingo owned, for the caller to unlink. */
  urls: string[];
  /** Test users removed because nothing else uses them. */
  usersDeleted: number;
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
  const urls = new Set<string>();
  for (const t of db.select({ url: tiles.imageUrl }).from(tiles).where(eq(tiles.bingoId, bingo.id)).all()) if (t.url) urls.add(t.url);
  if (teamIds.length > 0) {
    const submissionIds = db.select({ id: submissions.id }).from(submissions).where(inArray(submissions.teamId, teamIds)).all().map((s) => s.id);
    if (submissionIds.length > 0) {
      for (const s of db.select({ url: submissionScreenshots.storageUrl }).from(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, submissionIds)).all()) urls.add(s.url);
    }
  }

  const candidateIds = new Set<string>();
  for (const s of db.select({ id: signups.userId }).from(signups).where(eq(signups.bingoId, bingo.id)).all()) candidateIds.add(s.id);
  if (teamIds.length > 0) for (const m of db.select({ id: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all()) candidateIds.add(m.id);

  deleteBingo(db, bingo.id);
  db.delete(auditLog).where(eq(auditLog.bingoId, bingo.id)).run();

  const testUserIds = candidateIds.size
    ? db.select({ id: users.id }).from(users).where(and(inArray(users.id, [...candidateIds]), like(users.discordId, `${TESTDATA_PREFIX}%`))).all().map((u) => u.id)
    : [];
  let usersDeleted = 0;
  for (const id of testUserIds) {
    const stillUsed =
      db.select({ id: signups.id }).from(signups).where(eq(signups.userId, id)).get() ||
      db.select({ id: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.userId, id)).get() ||
      db.select({ id: bingoModerators.userId }).from(bingoModerators).where(eq(bingoModerators.userId, id)).get() ||
      db.select({ id: auditLog.id }).from(auditLog).where(or(eq(auditLog.actorUserId, id), eq(auditLog.onBehalfOfUserId, id))).get();
    if (stillUsed) continue;
    try {
      db.delete(users).where(eq(users.id, id)).run();
      usersDeleted++;
    } catch {
      // Something we didn't think of still points at this user; leaving one throwaway row is harmless.
    }
  }
  return { urls: [...urls], usersDeleted };
}

/** The files on disk behind /uploads/... URLs: each original plus its thumb/full variants. Anything outside uploadsDir is ignored. */
export function uploadFilePaths(uploadsDir: string, urls: string[]): string[] {
  const root = path.resolve(uploadsDir);
  const files: string[] = [];
  for (const url of urls) {
    if (!url.startsWith("/uploads/")) continue;
    const original = path.resolve(root, `.${path.posix.normalize(url.slice("/uploads".length))}`);
    if (!original.startsWith(root + path.sep)) continue;
    const ext = path.extname(original);
    const base = original.slice(0, original.length - ext.length);
    files.push(original, `${base}${THUMB_SUFFIX}${VARIANT_EXT}`, `${base}${FULL_SUFFIX}${VARIANT_EXT}`);
  }
  return files;
}

/** Removes the files behind the given upload URLs; missing files are fine. Returns how many were actually present. */
export function removeUploads(uploadsDir: string, urls: string[]): number {
  const files = uploadFilePaths(uploadsDir, urls);
  const present = files.filter((f) => fs.existsSync(f)).length;
  removeFiles(files);
  return present;
}
