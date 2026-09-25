import type { CutMode, ExclusivityRule } from "@bingo/shared";
import { now as clockNow } from "../clock";
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
  submissionReactions,
  tiles,
  users,
  womPastCompetitions,
} from "../db/schema";
import { ServiceError } from "./errors";
import { audit, diffFields, markAuditedNoop } from "../audit/record";
import { userLabelById } from "../audit/describe";
import { rsnsInBingo } from "./playerNames";

type Db = BetterSQLite3Database<typeof schema>;

export const STAGE_ORDER = ["planning", "signup", "captains", "draft", "reveal", "live", "complete"] as const;
export type Stage = (typeof STAGE_ORDER)[number];

// Newest first — the bingo list page redirects non-admins straight to
// bingos[0] as the "default" bingo (issue #3: simpler than an env var,
// since there's realistically only ever one active bingo at a time).
// The list is for picking a bingo, so it never carries the rules text or the exclusive item lists (which need
// the board revealed; see toViewerBingo).
export function listBingos(db: Db) {
  return db.select().from(bingos).orderBy(desc(bingos.createdAt)).all().map((b) => toViewerBingo(b, false));
}

export function getBingoBySlug(db: Db, slug: string) {
  return db.select().from(bingos).where(eq(bingos.slug, slug)).get();
}

// bingos.womGroupVerificationCode authorizes editing/deleting the linked WOM
// group's competitions — it must never reach a client. Every route that
// sends a bingo (or a list of them) to a client goes through this first;
// routes that only need the row server-side (requireBingo, stage/board
// checks, the WOM sync itself) use the raw row from getBingoBySlug instead.
export function toPublicBingo<T extends { womGroupVerificationCode: string | null; exclusivityRulesJson: string; draftOrderLockedUntil?: Date | null }>(
  bingo: T,
): Omit<T, "womGroupVerificationCode" | "exclusivityRulesJson" | "draftOrderLockedUntil"> & { exclusivityRules: ExclusivityRule[] } {
  const { womGroupVerificationCode: _womGroupVerificationCode, draftOrderLockedUntil: _draftOrderLockedUntil, exclusivityRulesJson, ...rest } = bingo;
  return { ...rest, exclusivityRules: parseExclusivityRules(exclusivityRulesJson) };
}

/**
 * A bingo as one viewer may see it. The rules text and the exclusive item lists describe the board (which items
 * are on it), so a player gets neither until the board is revealed, the same point tiles become visible. Mods
 * always see them.
 */
export function toViewerBingo<T extends typeof bingos.$inferSelect>(bingo: T, isMod: boolean) {
  const publicBingo = toPublicBingo(bingo);
  if (isMod || isBoardRevealed(bingo)) return publicBingo;
  return { ...publicBingo, rulesMarkdown: null, exclusivityRules: [] as ExclusivityRule[] };
}

const MAX_EXCLUSIVITY_RULES = 50;
const MAX_ITEM_NAMES_PER_RULE = 1000;

/** The rules a bingo row holds. Tolerant on purpose (a bad column reads as no rules): what is stored was validated on the way in. */
export function parseExclusivityRules(json: string | null | undefined): ExclusivityRule[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? (value as ExclusivityRule[]) : [];
  } catch {
    return [];
  }
}

/** Validates and cleans rules coming from a client or an import: trims, de-duplicates names, mints missing ids. */
export function normalizeExclusivityRules(input: unknown): ExclusivityRule[] {
  if (!Array.isArray(input)) throw new ServiceError(400, "exclusivityRules must be an array");
  if (input.length > MAX_EXCLUSIVITY_RULES) throw new ServiceError(400, `At most ${MAX_EXCLUSIVITY_RULES} exclusivity rules`);
  return input.map((raw: unknown, i) => {
    const rule = (raw ?? {}) as Partial<ExclusivityRule>;
    const label = typeof rule.label === "string" ? rule.label.trim() : "";
    if (!label) throw new ServiceError(400, `Exclusivity rule ${i + 1} needs a label`);
    if (rule.scope !== "part" && rule.scope !== "tile") throw new ServiceError(400, `Exclusivity rule "${label}": scope must be "part" or "tile"`);
    if (!Array.isArray(rule.itemNames)) throw new ServiceError(400, `Exclusivity rule "${label}": itemNames must be an array`);
    const seen = new Set<string>();
    const itemNames: string[] = [];
    for (const name of rule.itemNames) {
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (trimmed && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        itemNames.push(trimmed);
      }
    }
    if (itemNames.length === 0) throw new ServiceError(400, `Exclusivity rule "${label}" has no items`);
    if (itemNames.length > MAX_ITEM_NAMES_PER_RULE) throw new ServiceError(400, `Exclusivity rule "${label}" has too many items`);
    const id = typeof rule.id === "string" && rule.id.trim() ? rule.id.trim() : crypto.randomUUID();
    return { id, label, itemNames, scope: rule.scope };
  });
}

// "Play has started": what team names and player ratings lock on. Mirrors isBoardLocked
// in @bingo/shared (server can't runtime-import it).
export function isBoardLocked(bingo: typeof bingos.$inferSelect): boolean {
  return bingo.stage === "live" || bingo.stage === "complete";
}

// The board (tiles, tasks, requirements, points, lines, categories) can be edited right up to
// the end, live included, so a mistake can be fixed mid-event; what a live edit does to teams
// that already have progress is handled where it is made (edits re-score every team, and what
// teams have submitted proof for can't be removed). Once the bingo is complete the results are
// final. Mirrors isBoardEditingLocked in @bingo/shared.
export function assertBoardEditable(bingo: typeof bingos.$inferSelect): void {
  if (bingo.stage === "complete") {
    throw new ServiceError(400, "The board can't be edited once the bingo is complete");
  }
}

// Signup questions only matter while people are signing up: locked once play starts, as before.
export function assertQuestionsEditable(bingo: typeof bingos.$inferSelect): void {
  if (isBoardLocked(bingo)) {
    throw new ServiceError(400, `Signup questions are locked once the game is live (current stage: ${bingo.stage})`);
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
    const bingo = tx.insert(bingos).values({ ...row, createdAt: clockNow() }).returning().get();
    tx.insert(bingoModerators).values({ bingoId: bingo.id, userId: row.createdByUserId, createdAt: clockNow() }).run();
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
    const now = params.now ?? clockNow();

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
    tx.delete(submissionReactions).where(inArray(submissionReactions.submissionId, submissionIds)).run();
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
    // Detach, don't delete: a past WOM competition snapshot is deliberately
    // independent of the bingo it came from (issue #128) — it should outlive
    // the bingo the same way the audit log does, not get swept up with it.
    tx.update(womPastCompetitions).set({ bingoId: null }).where(eq(womPastCompetitions.bingoId, bingoId)).run();
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
    const mod = tx.insert(bingoModerators).values({ ...params, createdAt: clockNow() }).returning().get();
    audit(tx, {
      action: "moderator.added",
      bingoId: params.bingoId,
      entity: { type: "user", id: params.userId, label: userLabelById(tx, params.userId, params.bingoId) },
      details: { userId: params.userId, displayName: userLabelById(tx, params.userId, params.bingoId) ?? "Unknown user" },
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
      entity: { type: "user", id: params.userId, label: userLabelById(tx, params.userId, params.bingoId) },
      details: { userId: params.userId, displayName: userLabelById(tx, params.userId, params.bingoId) ?? "Unknown user" },
    });
  });
}

export function getModerators(db: Db, bingoId: string) {
  const rows = db
    .select({ id: bingoModerators.id, bingoId: bingoModerators.bingoId, userId: bingoModerators.userId, createdAt: bingoModerators.createdAt, user: users })
    .from(bingoModerators)
    .innerJoin(users, eq(bingoModerators.userId, users.id))
    .where(eq(bingoModerators.bingoId, bingoId))
    .all();
  const rsns = rsnsInBingo(db, bingoId, rows.map((r) => r.userId));
  return rows.map((r) => ({ ...r, user: { ...r.user, rsn: rsns.get(r.userId) ?? null } }));
}

export interface UpdateBingoSettingsParams {
  name?: string;
  description?: string | null;
  theme?: string;
  signupMode?: "solo" | "duo";
  cutMode?: CutMode;
  warnLeftovers?: boolean;
  buyinAmount?: number | null;
  bonusPotAmount?: number;
  rulesMarkdown?: string | null;
  exclusivityRules?: ExclusivityRule[];
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
    // Pairs only means nothing without pairs; a bingo switched to solo drops back to splitting its singles evenly.
    const signupMode = params.signupMode ?? existing.signupMode;
    if (params.cutMode === "pairs_only" && signupMode !== "duo") throw new ServiceError(400, "Pairs only is for duo bingos");
    if (params.cutMode === undefined && signupMode !== "duo" && existing.cutMode === "pairs_only") params.cutMode = "even";
    if (params.womGroupId != null && !/^\d+$/.test(params.womGroupId)) {
      throw new ServiceError(400, "WOM group ID must be a number");
    }
    const { exclusivityRules, ...columns } = params;
    const set: Partial<typeof bingos.$inferInsert> = { ...columns };
    if (exclusivityRules !== undefined) set.exclusivityRulesJson = JSON.stringify(normalizeExclusivityRules(exclusivityRules));
    const updated = tx.update(bingos).set(set).where(eq(bingos.id, bingoId)).returning().get();

    const changes = diffFields(existing, updated, { only: Object.keys(set) as (keyof typeof existing)[], redact: ["womGroupVerificationCode"] });
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
