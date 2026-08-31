import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  bingoLineTiles, submissionItemClaims, submissions, teamCompletedLines,
  teamTaskProgress, teamWildcardUsage, tileTaskItems, tileTasks, tileWildcards,
} from "../db/schema";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface TaskItemDef {
  itemName: string;
  quantity: number;
  optionsGroup: string | null;
}

export interface ClaimTally {
  itemName: string;
  quantity: number;
}

export interface EvaluateTaskCompletionOpts {
  minSubmissions: number;
  requiresCompleteSet: boolean;
  approvedSubmissionCount: number;
}

// Pure, DB-free completion check — the single source of truth for whether a
// task's requirements are satisfied. Callers gather items/claims from
// whichever submissions should count (approval folds in a prior task's
// claims for allowsPreviouslyAcquired tasks; this function doesn't know or
// care where claims came from).
export function evaluateTaskCompletion(
  items: TaskItemDef[],
  claims: ClaimTally[],
  opts: EvaluateTaskCompletionOpts,
): boolean {
  if (opts.approvedSubmissionCount < opts.minSubmissions) return false;
  if (items.length === 0) return true;

  const claimedQty = (itemName: string) =>
    claims
      .filter((c) => c.itemName.toLowerCase() === itemName.toLowerCase())
      .reduce((sum, c) => sum + c.quantity, 0);

  const ungroupedSatisfied = items
    .filter((i) => i.optionsGroup === null)
    .every((i) => claimedQty(i.itemName) >= i.quantity);

  const groupNames = [...new Set(items.filter((i) => i.optionsGroup !== null).map((i) => i.optionsGroup!))];
  if (groupNames.length === 0) return ungroupedSatisfied;

  const itemsInGroup = (group: string) => items.filter((i) => i.optionsGroup === group);

  if (opts.requiresCompleteSet) {
    const anyGroupFullySatisfied = groupNames.some((group) =>
      itemsInGroup(group).every((i) => claimedQty(i.itemName) >= i.quantity),
    );
    return ungroupedSatisfied && anyGroupFullySatisfied;
  }

  const everyGroupHasOneSatisfiedItem = groupNames.every((group) =>
    itemsInGroup(group).some((i) => claimedQty(i.itemName) >= i.quantity),
  );
  return ungroupedSatisfied && everyGroupHasOneSatisfiedItem;
}

function getTileTasksOrdered(tx: Tx, tileId: string) {
  return tx.select().from(tileTasks).where(eq(tileTasks.tileId, tileId)).orderBy(tileTasks.sortOrder).all();
}

function getTaskItems(tx: Tx, taskId: string): TaskItemDef[] {
  return tx
    .select()
    .from(tileTaskItems)
    .where(eq(tileTaskItems.taskId, taskId))
    .all()
    .map((i) => ({ itemName: i.itemName, quantity: i.quantity, optionsGroup: i.optionsGroup }));
}

function getApprovedSubmissionIds(tx: Tx, teamId: string, taskId: string): string[] {
  return tx
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.teamId, teamId), eq(submissions.taskId, taskId), eq(submissions.status, "approved")))
    .all()
    .map((r) => r.id);
}

function getApprovedClaims(tx: Tx, teamId: string, taskId: string): ClaimTally[] {
  const submissionIds = getApprovedSubmissionIds(tx, teamId, taskId);
  if (submissionIds.length === 0) return [];
  return tx
    .select({ itemName: submissionItemClaims.itemName, quantity: submissionItemClaims.quantity })
    .from(submissionItemClaims)
    .where(inArray(submissionItemClaims.submissionId, submissionIds))
    .all();
}

function getMostRecentApprovedPoints(tx: Tx, teamId: string, taskId: string): number | null {
  const rows = tx
    .select()
    .from(submissions)
    .where(and(eq(submissions.teamId, teamId), eq(submissions.taskId, taskId), eq(submissions.status, "approved")))
    .all();
  if (rows.length === 0) return null;
  const mostRecent = rows.reduce((latest, row) =>
    (row.reviewedAt?.getTime() ?? 0) > (latest.reviewedAt?.getTime() ?? 0) ? row : latest,
  );
  return mostRecent.pointsAwarded ?? null;
}

function getOrCreateProgress(tx: Tx, teamId: string, taskId: string) {
  const existing = tx
    .select()
    .from(teamTaskProgress)
    .where(and(eq(teamTaskProgress.teamId, teamId), eq(teamTaskProgress.taskId, taskId)))
    .get();
  if (existing) return existing;
  return tx.insert(teamTaskProgress).values({ teamId, taskId }).returning().get();
}

function isTileCompleteForTeam(tx: Tx, teamId: string, tileId: string): boolean {
  const taskIds = tx.select({ id: tileTasks.id }).from(tileTasks).where(eq(tileTasks.tileId, tileId)).all().map((r) => r.id);
  if (taskIds.length === 0) return false;
  const completedCount = tx
    .select()
    .from(teamTaskProgress)
    .where(
      and(
        eq(teamTaskProgress.teamId, teamId),
        inArray(teamTaskProgress.taskId, taskIds),
        eq(teamTaskProgress.status, "completed"),
      ),
    )
    .all().length;
  return completedCount === taskIds.length;
}

// A tile completing may complete one or more lines. Returns the ids of lines
// newly recorded as complete (skips lines already recorded for this team).
function recordCompletedLinesForTile(tx: Tx, teamId: string, tileId: string): string[] {
  if (!isTileCompleteForTeam(tx, teamId, tileId)) return [];

  const lineIds = tx
    .select({ id: bingoLineTiles.bingoLineId })
    .from(bingoLineTiles)
    .where(eq(bingoLineTiles.tileId, tileId))
    .all()
    .map((r) => r.id);

  const newlyCompleted: string[] = [];
  for (const lineId of lineIds) {
    const already = tx
      .select()
      .from(teamCompletedLines)
      .where(and(eq(teamCompletedLines.teamId, teamId), eq(teamCompletedLines.bingoLineId, lineId)))
      .get();
    if (already) continue;

    const lineTileIds = tx
      .select({ tileId: bingoLineTiles.tileId })
      .from(bingoLineTiles)
      .where(eq(bingoLineTiles.bingoLineId, lineId))
      .all()
      .map((r) => r.tileId);

    if (lineTileIds.every((tid) => isTileCompleteForTeam(tx, teamId, tid))) {
      tx.insert(teamCompletedLines).values({ teamId, bingoLineId: lineId }).run();
      newlyCompleted.push(lineId);
    }
  }
  return newlyCompleted;
}

// Walks forward from a task that just completed, releasing withheld points on
// a dependent next task and auto-completing a next task whose
// allowsPreviouslyAcquired folds this task's claims in. Continues as long as
// a step actually changes something, so multi-task chains cascade fully.
function cascadeFromCompletedTask(tx: Tx, teamId: string, tileId: string, fromSortOrder: number): string[] {
  const tasksOrdered = getTileTasksOrdered(tx, tileId);
  let idx = tasksOrdered.findIndex((t) => t.sortOrder === fromSortOrder);
  const completedLineIds: string[] = [];

  while (idx >= 0 && idx + 1 < tasksOrdered.length) {
    const prevTask = tasksOrdered[idx];
    const nextTask = tasksOrdered[idx + 1];
    const progress = getOrCreateProgress(tx, teamId, nextTask.id);
    let changed = false;

    if (progress.status === "completed" && nextTask.pointsRequirePrevious && progress.pointsAwarded === 0) {
      const releasedPoints = getMostRecentApprovedPoints(tx, teamId, nextTask.id) ?? nextTask.points;
      tx.update(teamTaskProgress).set({ pointsAwarded: releasedPoints }).where(eq(teamTaskProgress.id, progress.id)).run();
    }

    if (progress.status !== "completed" && nextTask.allowsPreviouslyAcquired) {
      const items = getTaskItems(tx, nextTask.id);
      const claims = [...getApprovedClaims(tx, teamId, prevTask.id), ...getApprovedClaims(tx, teamId, nextTask.id)];
      // Folded submission count too — a task that auto-completes purely via
      // folding (no submission of its own yet) must not be blocked by
      // minSubmissions just because its own count is 0.
      const approvedSubmissionCount =
        getApprovedSubmissionIds(tx, teamId, prevTask.id).length + getApprovedSubmissionIds(tx, teamId, nextTask.id).length;
      const complete = evaluateTaskCompletion(items, claims, {
        minSubmissions: nextTask.minSubmissions,
        requiresCompleteSet: nextTask.requiresCompleteSet,
        approvedSubmissionCount,
      });
      if (complete) {
        tx.update(teamTaskProgress)
          .set({ status: "completed", pointsAwarded: nextTask.points, completedAt: new Date() })
          .where(eq(teamTaskProgress.id, progress.id))
          .run();
        completedLineIds.push(...recordCompletedLinesForTile(tx, teamId, tileId));
        changed = true;
      }
    }

    if (!changed) break;
    idx++;
  }
  return completedLineIds;
}

export interface ApproveSubmissionParams {
  submissionId: string;
  reviewedByUserId: string;
  reviewerNotes?: string;
  pointsAwardedOverride?: number;
  // Required when the task's scoringMode is 'manual' — the mod decides
  // completion directly instead of it being computed from item claims.
  // Ignored for 'automatic' tasks.
  taskCompleted?: boolean;
}

export interface ApproveSubmissionResult {
  submission: typeof submissions.$inferSelect;
  taskCompleted: boolean;
  pointsAwarded: number;
  completedLineIds: string[];
}

export function approveSubmission(db: Db, params: ApproveSubmissionParams): ApproveSubmissionResult {
  return db.transaction((tx): ApproveSubmissionResult => {
    const submission = tx.select().from(submissions).where(eq(submissions.id, params.submissionId)).get();
    if (!submission) throw new ServiceError(404, "Submission not found");
    if (submission.status !== "pending") throw new ServiceError(409, "Submission has already been reviewed");

    const task = tx.select().from(tileTasks).where(eq(tileTasks.id, submission.taskId)).get();
    if (!task) throw new ServiceError(404, "Task not found");
    if (task.scoringMode === "manual" && params.taskCompleted === undefined) {
      throw new ServiceError(400, "taskCompleted is required when approving a manual-scoring task");
    }

    if (submission.isWildcardRedemption) {
      if (!submission.wildcardId) throw new ServiceError(400, "Wildcard redemption is missing a wildcardId");
      const wildcard = tx.select().from(tileWildcards).where(eq(tileWildcards.id, submission.wildcardId)).get();
      if (!wildcard) throw new ServiceError(404, "Wildcard not found");
      const usageCount = tx
        .select()
        .from(teamWildcardUsage)
        .where(and(eq(teamWildcardUsage.teamId, submission.teamId), eq(teamWildcardUsage.tileWildcardId, wildcard.id)))
        .all().length;
      if (usageCount >= wildcard.maxRedemptionsPerTeam) {
        throw new ServiceError(400, `${wildcard.itemName} has already been redeemed the maximum number of times for this team`);
      }
    }

    const pointsAwarded = params.pointsAwardedOverride ?? task.points;
    tx.update(submissions)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: params.reviewedByUserId,
        reviewerNotes: params.reviewerNotes ?? null,
        pointsAwarded,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submission.id))
      .run();

    if (submission.isWildcardRedemption && submission.wildcardId) {
      tx.insert(teamWildcardUsage)
        .values({ teamId: submission.teamId, tileWildcardId: submission.wildcardId, submissionId: submission.id })
        .run();
    }

    const tasksOrdered = getTileTasksOrdered(tx, task.tileId);
    const idx = tasksOrdered.findIndex((t) => t.id === task.id);
    const prevTask = idx > 0 ? tasksOrdered[idx - 1] : null;

    const items = getTaskItems(tx, task.id);
    const ownClaims = getApprovedClaims(tx, submission.teamId, task.id);
    // allowsPreviouslyAcquired folds the previous task's approved claims into
    // this task's tally regardless of when the previous task completed — not
    // just when it completes in this same transaction (that case is handled
    // separately by cascadeFromCompletedTask, for auto-completion with no
    // submission of its own).
    const claims = task.allowsPreviouslyAcquired && prevTask
      ? [...getApprovedClaims(tx, submission.teamId, prevTask.id), ...ownClaims]
      : ownClaims;
    const approvedSubmissionCount =
      task.allowsPreviouslyAcquired && prevTask
        ? getApprovedSubmissionIds(tx, submission.teamId, prevTask.id).length + getApprovedSubmissionIds(tx, submission.teamId, task.id).length
        : getApprovedSubmissionIds(tx, submission.teamId, task.id).length;

    const complete =
      task.scoringMode === "manual"
        ? params.taskCompleted!
        : evaluateTaskCompletion(items, claims, {
            minSubmissions: task.minSubmissions,
            requiresCompleteSet: task.requiresCompleteSet,
            approvedSubmissionCount,
          });

    const progress = getOrCreateProgress(tx, submission.teamId, task.id);
    let completedLineIds: string[] = [];
    let taskPointsAwarded = progress.pointsAwarded;

    if (complete) {
      const prevCompleted = prevTask
        ? tx
            .select()
            .from(teamTaskProgress)
            .where(and(eq(teamTaskProgress.teamId, submission.teamId), eq(teamTaskProgress.taskId, prevTask.id)))
            .get()?.status === "completed"
        : true;

      const withheld = task.pointsRequirePrevious && !prevCompleted;
      taskPointsAwarded = withheld ? 0 : pointsAwarded;

      tx.update(teamTaskProgress)
        .set({ status: "completed", pointsAwarded: taskPointsAwarded, completedAt: new Date() })
        .where(eq(teamTaskProgress.id, progress.id))
        .run();

      completedLineIds = recordCompletedLinesForTile(tx, submission.teamId, task.tileId);
      completedLineIds.push(...cascadeFromCompletedTask(tx, submission.teamId, task.tileId, task.sortOrder));
    } else {
      tx.update(teamTaskProgress).set({ status: "in_progress" }).where(eq(teamTaskProgress.id, progress.id)).run();
    }

    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;
    return { submission: updatedSubmission, taskCompleted: complete, pointsAwarded: taskPointsAwarded, completedLineIds };
  });
}

export interface RejectSubmissionParams {
  submissionId: string;
  reviewedByUserId: string;
  reviewerNotes?: string;
}

export function rejectSubmission(db: Db, params: RejectSubmissionParams): { submission: typeof submissions.$inferSelect } {
  return db.transaction((tx) => {
    const submission = tx.select().from(submissions).where(eq(submissions.id, params.submissionId)).get();
    if (!submission) throw new ServiceError(404, "Submission not found");
    if (submission.status !== "pending") throw new ServiceError(409, "Submission has already been reviewed");

    tx.update(submissions)
      .set({
        status: "rejected",
        reviewedAt: new Date(),
        reviewedByUserId: params.reviewedByUserId,
        reviewerNotes: params.reviewerNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submission.id))
      .run();

    const otherPending = tx
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.teamId, submission.teamId),
          eq(submissions.taskId, submission.taskId),
          eq(submissions.status, "pending"),
        ),
      )
      .all().length;

    if (otherPending === 0) {
      const progress = tx
        .select()
        .from(teamTaskProgress)
        .where(and(eq(teamTaskProgress.teamId, submission.teamId), eq(teamTaskProgress.taskId, submission.taskId)))
        .get();
      if (progress && progress.status === "pending_approval") {
        tx.update(teamTaskProgress).set({ status: "in_progress" }).where(eq(teamTaskProgress.id, progress.id)).run();
      }
    }

    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;
    return { submission: updatedSubmission };
  });
}
