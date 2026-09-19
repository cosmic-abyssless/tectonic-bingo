import { and, desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  bingoLines,
  bingoModerators,
  bingos,
  claims,
  draftPicks,
  pickRatings,
  nodeEdges,
  nodes,
  signupAnswers,
  signupPairings,
  signupQuestions,
  signups,
  stageTransitions,
  submissionScreenshots,
  submissions,
  teamMembers,
  teamNodeState,
  teamPointAdjustments,
  teams,
  tileCategories,
  tileInterests,
  tiles,
  users,
} from "../db/schema";
import { ServiceError } from "./errors";
import { audit, diffFields, markAuditedNoop } from "../audit/record";
import { userLabelById } from "../audit/describe";

type Db = BetterSQLite3Database<typeof schema>;

export const STAGE_ORDER = ["planning", "signup", "captains", "draft", "reveal", "live", "complete"] as const;
export type Stage = (typeof STAGE_ORDER)[number];

// Newest first — the bingo list page redirects non-admins straight to
// bingos[0] as the "default" bingo (issue #3: simpler than an env var,
// since there's realistically only ever one active bingo at a time).
export function listBingos(db: Db) {
  return db.select().from(bingos).orderBy(desc(bingos.createdAt)).all().map(toPublicBingo);
}

export function getBingoBySlug(db: Db, slug: string) {
  return db.select().from(bingos).where(eq(bingos.slug, slug)).get();
}

// bingos.womGroupVerificationCode authorizes editing/deleting the linked WOM
// group's competitions — it must never reach a client. Every route that
// sends a bingo (or a list of them) to a client goes through this first;
// routes that only need the row server-side (requireBingo, stage/board
// checks, the WOM sync itself) use the raw row from getBingoBySlug instead.
export function toPublicBingo<T extends { womGroupVerificationCode: string | null }>(bingo: T): Omit<T, "womGroupVerificationCode"> {
  const { womGroupVerificationCode: _womGroupVerificationCode, ...rest } = bingo;
  return rest;
}

// Board/task/question edits are allowed until the game goes live (including
// during reveal) — once play has started, structural changes would be unfair.
// Mirrors isBoardLocked in @bingo/shared (server can't runtime-import it).
export function isBoardLocked(bingo: typeof bingos.$inferSelect): boolean {
  return bingo.stage === "live" || bingo.stage === "complete";
}

export function assertBoardEditable(bingo: typeof bingos.$inferSelect): void {
  if (isBoardLocked(bingo)) {
    throw new ServiceError(400, `The board is locked once the game is live (current stage: ${bingo.stage})`);
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

// The board is revealed to players from stage reveal onward (reveal/live/complete).
export function isBoardRevealed(bingo: typeof bingos.$inferSelect): boolean {
  return bingo.stage === "reveal" || bingo.stage === "live" || bingo.stage === "complete";
}

// Tiles are only visible to non-mods once the board has been revealed. Mods
// can always see them (for building/testing the board before reveal).
export function canViewTiles(bingo: typeof bingos.$inferSelect, isMod: boolean): boolean {
  return isMod || isBoardRevealed(bingo);
}

export interface CreateBingoParams {
  slug: string;
  name: string;
  description?: string;
  theme?: string;
  boardRows: number;
  boardCols: number;
  createdByUserId: string;
  // Purely for the audit trail — doesn't touch the bingos row itself.
  source?: "form" | "import";
}

export function createBingo(db: Db, params: CreateBingoParams) {
  return db.transaction((tx) => {
    const { source, ...row } = params;
    const existing = tx.select().from(bingos).where(eq(bingos.slug, row.slug)).get();
    if (existing) throw new ServiceError(409, "A bingo with this slug already exists");
    const bingo = tx.insert(bingos).values(row).returning().get();
    tx.insert(bingoModerators).values({ bingoId: bingo.id, userId: row.createdByUserId }).run();
    audit(tx, {
      action: "bingo.created",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: { slug: bingo.slug, name: bingo.name, theme: bingo.theme, boardRows: bingo.boardRows, boardCols: bingo.boardCols, source: source ?? "form" },
    });
    return bingo;
  });
}

export interface AdvanceStageParams {
  bingoId: string;
  toStage: Stage;
  changedByUserId: string;
  now?: Date; // injectable for tests
}

// Move to any other stage, in either direction. Skipping stages is allowed
// (a bingo without a draft goes signup -> reveal); the jump is recorded as a
// single transition for the post-bingo timeline.
export function advanceStage(db: Db, params: AdvanceStageParams) {
  return db.transaction((tx) => {
    const bingo = tx.select().from(bingos).where(eq(bingos.id, params.bingoId)).get();
    if (!bingo) throw new ServiceError(404, "Bingo not found");

    if (params.toStage === bingo.stage) {
      throw new ServiceError(400, `Bingo is already in the "${bingo.stage}" stage`);
    }

    // `startsAt` is only ever what an admin set in the settings; it is not written here. Tile freezes
    // and the submission gate run from the effective start (bingoStart.ts): that date if there is
    // one, otherwise the moment the bingo was last put live, which the transition logged below
    // records. (This used to stamp "now" into startsAt the first time the bingo went live, which
    // pinned the freeze to that first time: moving back to reveal and live again never restarted it.)
    const now = params.now ?? new Date();

    tx.update(bingos).set({ stage: params.toStage }).where(eq(bingos.id, bingo.id)).run();
    tx.insert(stageTransitions)
      .values({ bingoId: bingo.id, fromStage: bingo.stage as Stage, toStage: params.toStage, changedByUserId: params.changedByUserId, createdAt: now })
      .run();
    audit(tx, {
      action: "stage.changed",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: { from: bingo.stage as Stage, to: params.toStage },
      actor: { userId: params.changedByUserId },
      now: params.now,
    });

    return tx.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!;
  });
}

// Removes a bingo and everything hanging off it. The schema has no ON DELETE
// CASCADE, so children are deleted leaf-first in one transaction.
export function deleteBingo(db: Db, bingoId: string): void {
  db.transaction((tx) => {
    const bingo = tx.select().from(bingos).where(eq(bingos.id, bingoId)).get();
    if (!bingo) throw new ServiceError(404, "Bingo not found");

    const teamIds = tx.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId));
    const submissionIds = tx.select({ id: submissions.id }).from(submissions).where(inArray(submissions.teamId, teamIds));
    const signupIds = tx.select({ id: signups.id }).from(signups).where(eq(signups.bingoId, bingoId));
    const nodeIds = tx.select({ id: nodes.id }).from(nodes).where(eq(nodes.bingoId, bingoId));

    audit(tx, {
      action: "bingo.deleted",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: {
        slug: bingo.slug,
        name: bingo.name,
        stage: bingo.stage as Stage,
        counts: {
          teams: teamIds.all().length,
          signups: signupIds.all().length,
          submissions: submissionIds.all().length,
        },
      },
    });

    tx.delete(claims).where(inArray(claims.submissionId, submissionIds)).run();
    tx.delete(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, submissionIds)).run();
    tx.delete(submissions).where(inArray(submissions.teamId, teamIds)).run();
    tx.delete(teamPointAdjustments).where(eq(teamPointAdjustments.bingoId, bingoId)).run();
    tx.delete(teamNodeState).where(inArray(teamNodeState.teamId, teamIds)).run();
    tx.delete(draftPicks).where(eq(draftPicks.bingoId, bingoId)).run();
    tx.delete(pickRatings).where(inArray(pickRatings.teamId, teamIds)).run();
    tx.delete(tileInterests).where(inArray(tileInterests.teamId, teamIds)).run();
    tx.delete(teamMembers).where(inArray(teamMembers.teamId, teamIds)).run();
    tx.delete(teams).where(eq(teams.bingoId, bingoId)).run();
    tx.delete(signupAnswers).where(inArray(signupAnswers.signupId, signupIds)).run();
    tx.delete(signups).where(eq(signups.bingoId, bingoId)).run();
    tx.delete(signupPairings).where(eq(signupPairings.bingoId, bingoId)).run();
    tx.delete(signupQuestions).where(eq(signupQuestions.bingoId, bingoId)).run();
    tx.delete(bingoLines).where(eq(bingoLines.bingoId, bingoId)).run();
    tx.delete(tiles).where(eq(tiles.bingoId, bingoId)).run();
    tx.delete(tileCategories).where(eq(tileCategories.bingoId, bingoId)).run();
    tx.delete(nodeEdges).where(inArray(nodeEdges.parentId, nodeIds)).run();
    tx.delete(nodes).where(eq(nodes.bingoId, bingoId)).run();
    tx.delete(stageTransitions).where(eq(stageTransitions.bingoId, bingoId)).run();
    tx.delete(bingoModerators).where(eq(bingoModerators.bingoId, bingoId)).run();
    tx.delete(bingos).where(eq(bingos.id, bingoId)).run();
  });
}

export function addModerator(db: Db, params: { bingoId: string; userId: string }) {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(bingoModerators)
      .where(and(eq(bingoModerators.bingoId, params.bingoId), eq(bingoModerators.userId, params.userId)))
      .get();
    if (existing) {
      markAuditedNoop();
      return existing;
    }
    const mod = tx.insert(bingoModerators).values(params).returning().get();
    audit(tx, {
      action: "moderator.added",
      bingoId: params.bingoId,
      entity: { type: "user", id: params.userId, label: userLabelById(tx, params.userId) },
      details: { userId: params.userId, displayName: userLabelById(tx, params.userId) ?? "Unknown user" },
    });
    return mod;
  });
}

export function removeModerator(db: Db, params: { bingoId: string; userId: string }): void {
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(bingoModerators)
      .where(and(eq(bingoModerators.bingoId, params.bingoId), eq(bingoModerators.userId, params.userId)))
      .get();
    if (!existing) {
      markAuditedNoop();
      return;
    }
    tx.delete(bingoModerators)
      .where(and(eq(bingoModerators.bingoId, params.bingoId), eq(bingoModerators.userId, params.userId)))
      .run();
    audit(tx, {
      action: "moderator.removed",
      bingoId: params.bingoId,
      entity: { type: "user", id: params.userId, label: userLabelById(tx, params.userId) },
      details: { userId: params.userId, displayName: userLabelById(tx, params.userId) ?? "Unknown user" },
    });
  });
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
  signupMode?: "solo" | "duo";
  leftoverMode?: "cut" | "singles";
  warnLeftovers?: boolean;
  buyinAmount?: number | null;
  bonusPotAmount?: number;
  rulesMarkdown?: string | null;
  signupOpensAt?: Date | null;
  draftScheduledAt?: Date | null;
  revealScheduledAt?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  womEnabled?: boolean;
  womGroupId?: string | null;
  womGroupVerificationCode?: string | null;
}

export function updateBingoSettings(db: Db, bingoId: string, params: UpdateBingoSettingsParams) {
  return db.transaction((tx) => {
    const existing = tx.select().from(bingos).where(eq(bingos.id, bingoId)).get();
    if (!existing) throw new ServiceError(404, "Bingo not found");
    if (params.signupMode !== undefined && params.signupMode !== existing.signupMode) {
      // Existing signups were made under the other mode's rules (pairings only
      // mean something in duo), so the switch is only allowed on a clean slate.
      const hasSignups = tx.select({ id: signups.id }).from(signups).where(eq(signups.bingoId, bingoId)).get();
      if (hasSignups) throw new ServiceError(400, "The signup mode can't change once players have signed up");
    }
    if (params.womGroupId != null && !/^\d+$/.test(params.womGroupId)) {
      throw new ServiceError(400, "WOM group ID must be a number");
    }
    const updated = tx.update(bingos).set(params).where(eq(bingos.id, bingoId)).returning().get();

    const changes = diffFields(existing, updated, { only: Object.keys(params) as (keyof typeof existing)[], redact: ["womGroupVerificationCode"] });
    if (changes) {
      audit(tx, {
        action: "settings.updated",
        bingoId,
        entity: { type: "bingo", id: bingoId, label: updated.name },
        details: { changes: changes as never },
      });
    } else {
      markAuditedNoop();
    }
    return updated;
  });
}

// The pot is derived, not stored: what's actually been collected (buy-in x
// paid signups) plus any extra stakes an admin adds on top (sponsorships,
// donations). Recomputed on every read so it's always accurate as people
// sign up and pay.
export function calculatePotTotal(bingo: typeof bingos.$inferSelect, paidSignupCount: number): number {
  return (bingo.buyinAmount ?? 0) * paidSignupCount + bingo.bonusPotAmount;
}
