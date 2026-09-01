import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoModerators, bingos, stageTransitions, users } from "../db/schema";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;

export const STAGE_ORDER = ["planning", "signup", "captains", "draft", "reveal", "live", "complete"] as const;
export type Stage = (typeof STAGE_ORDER)[number];

export function listBingos(db: Db) {
  return db.select().from(bingos).all();
}

export function getBingoBySlug(db: Db, slug: string) {
  return db.select().from(bingos).where(eq(bingos.slug, slug)).get();
}

// Board/task/question edits are only allowed before the board is revealed —
// once players can see it, structural changes would be confusing or unfair.
export function assertBoardEditable(bingo: typeof bingos.$inferSelect): void {
  if (bingo.stage !== "planning" && bingo.stage !== "signup") {
    throw new ServiceError(400, `The board can only be edited during planning or signup (current stage: ${bingo.stage})`);
  }
}

export function isBingoMod(db: Db, bingoId: string, userId: string, isSiteAdmin: boolean): boolean {
  if (isSiteAdmin) return true;
  return !!db
    .select()
    .from(bingoModerators)
    .where(and(eq(bingoModerators.bingoId, bingoId), eq(bingoModerators.userId, userId)))
    .get();
}

// Tiles are only visible to non-mods once the board has been revealed —
// stage reveal/live/complete. Mods can always see them (for building/testing
// the board before reveal).
export function canViewTiles(bingo: typeof bingos.$inferSelect, isMod: boolean): boolean {
  if (isMod) return true;
  return bingo.stage === "reveal" || bingo.stage === "live" || bingo.stage === "complete";
}

export interface CreateBingoParams {
  slug: string;
  name: string;
  description?: string;
  theme?: string;
  boardRows: number;
  boardCols: number;
  createdByUserId: string;
}

export function createBingo(db: Db, params: CreateBingoParams) {
  return db.transaction((tx) => {
    const existing = tx.select().from(bingos).where(eq(bingos.slug, params.slug)).get();
    if (existing) throw new ServiceError(409, "A bingo with this slug already exists");
    const bingo = tx.insert(bingos).values(params).returning().get();
    tx.insert(bingoModerators).values({ bingoId: bingo.id, userId: params.createdByUserId }).run();
    return bingo;
  });
}

export interface AdvanceStageParams {
  bingoId: string;
  toStage: Stage;
  changedByUserId: string;
}

// Forward one stage, or back one stage (mods correcting a mistake). No
// skipping — each transition is recorded for the post-bingo timeline.
export function advanceStage(db: Db, params: AdvanceStageParams) {
  return db.transaction((tx) => {
    const bingo = tx.select().from(bingos).where(eq(bingos.id, params.bingoId)).get();
    if (!bingo) throw new ServiceError(404, "Bingo not found");

    const fromIdx = STAGE_ORDER.indexOf(bingo.stage as Stage);
    const toIdx = STAGE_ORDER.indexOf(params.toStage);
    if (Math.abs(toIdx - fromIdx) !== 1) {
      throw new ServiceError(400, `Cannot move from "${bingo.stage}" directly to "${params.toStage}"`);
    }

    tx.update(bingos).set({ stage: params.toStage }).where(eq(bingos.id, bingo.id)).run();
    tx.insert(stageTransitions)
      .values({ bingoId: bingo.id, fromStage: bingo.stage as Stage, toStage: params.toStage, changedByUserId: params.changedByUserId })
      .run();

    return tx.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!;
  });
}

export function addModerator(db: Db, params: { bingoId: string; userId: string }) {
  const existing = db
    .select()
    .from(bingoModerators)
    .where(and(eq(bingoModerators.bingoId, params.bingoId), eq(bingoModerators.userId, params.userId)))
    .get();
  if (existing) return existing;
  return db.insert(bingoModerators).values(params).returning().get();
}

export function removeModerator(db: Db, params: { bingoId: string; userId: string }): void {
  db.delete(bingoModerators)
    .where(and(eq(bingoModerators.bingoId, params.bingoId), eq(bingoModerators.userId, params.userId)))
    .run();
}

export function getModerators(db: Db, bingoId: string) {
  return db
    .select({ id: bingoModerators.id, bingoId: bingoModerators.bingoId, userId: bingoModerators.userId, createdAt: bingoModerators.createdAt, user: users })
    .from(bingoModerators)
    .innerJoin(users, eq(bingoModerators.userId, users.id))
    .where(eq(bingoModerators.bingoId, bingoId))
    .all();
}

export interface UpdateBingoSettingsParams {
  name?: string;
  description?: string | null;
  theme?: string;
  buyinAmount?: number | null;
  bonusPotAmount?: number;
  rulesMarkdown?: string | null;
  signupOpensAt?: Date | null;
  draftScheduledAt?: Date | null;
  revealScheduledAt?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export function updateBingoSettings(db: Db, bingoId: string, params: UpdateBingoSettingsParams) {
  const existing = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!existing) throw new ServiceError(404, "Bingo not found");
  return db.update(bingos).set(params).where(eq(bingos.id, bingoId)).returning().get();
}

// The pot is derived, not stored: what's actually been collected (buy-in x
// paid signups) plus any extra stakes an admin adds on top (sponsorships,
// donations). Recomputed on every read so it's always accurate as people
// sign up and pay.
export function calculatePotTotal(bingo: typeof bingos.$inferSelect, paidSignupCount: number): number {
  return (bingo.buyinAmount ?? 0) * paidSignupCount + bingo.bonusPotAmount;
}
