import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  bingoLineTiles, claims, requirementNodes, submissions, teamCompletedLines, teamTaskProgress, tileTasks, tileWildcards,
} from "../db/schema";
import { ServiceError } from "./errors";
import { evaluateNode, getApprovedClaimsForTask, getRequirementTree } from "./requirementService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function getTileTasksOrdered(tx: Tx, tileId: string) {
  return tx.select().from(tileTasks).where(eq(tileTasks.tileId, tileId)).orderBy(tileTasks.sortOrder).all();
}

// Distinct tasks a submission's claims touch (via their leaves).
export function getSubmissionTaskIds(tx: Tx, submissionId: string): string[] {
  const rows = tx
    .select({ taskId: requirementNodes.taskId })
    .from(claims)
    .innerJoin(requirementNodes, eq(claims.nodeId, requirementNodes.id))
    .where(eq(claims.submissionId, submissionId))
    .all();
  return [...new Set(rows.map((r) => r.taskId))];
}

// Submissions of a team with the given status that touch a task.
function getTeamSubmissionsForTask(tx: Tx, teamId: string, taskId: string, status: "pending" | "approved") {
  return tx
    .selectDistinct({ id: submissions.id, reviewedAt: submissions.reviewedAt, pointsAwarded: submissions.pointsAwarded })
    .from(submissions)
    .innerJoin(claims, eq(claims.submissionId, submissions.id))
    .innerJoin(requirementNodes, eq(claims.nodeId, requirementNodes.id))
    .where(and(eq(submissions.teamId, teamId), eq(submissions.status, status), eq(requirementNodes.taskId, taskId)))
    .all();
}

function getMostRecentApprovedPoints(tx: Tx, teamId: string, taskId: string): number | null {
  const rows = getTeamSubmissionsForTask(tx, teamId, taskId, "approved");
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

// Recompute a not-yet-completed task's status from the team's remaining
// submissions. Completed tasks are never downgraded.
export function refreshTaskProgressStatus(tx: Tx, teamId: string, taskId: string): void {
  const progress = getOrCreateProgress(tx, teamId, taskId);
  if (progress.status === "completed") return;
  const status = getTeamSubmissionsForTask(tx, teamId, taskId, "pending").length > 0
    ? "pending_approval"
    : getTeamSubmissionsForTask(tx, teamId, taskId, "approved").length > 0
      ? "in_progress"
      : "not_started";
  tx.update(teamTaskProgress).set({ status }).where(eq(teamTaskProgress.id, progress.id)).run();
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

// When a task completes, release withheld points on an already-completed next
// task that had pointsRequirePrevious.
function releaseWithheldPointsOnNext(tx: Tx, teamId: string, tileId: string, fromSortOrder: number): void {
  const tasksOrdered = getTileTasksOrdered(tx, tileId);
  const idx = tasksOrdered.findIndex((t) => t.sortOrder === fromSortOrder);
  if (idx < 0 || idx + 1 >= tasksOrdered.length) return;
  const nextTask = tasksOrdered[idx + 1];
  const progress = getOrCreateProgress(tx, teamId, nextTask.id);
  if (progress.status === "completed" && nextTask.pointsRequirePrevious && progress.pointsAwarded === 0) {
    const releasedPoints = getMostRecentApprovedPoints(tx, teamId, nextTask.id) ?? nextTask.points;
    tx.update(teamTaskProgress).set({ pointsAwarded: releasedPoints }).where(eq(teamTaskProgress.id, progress.id)).run();
  }
}

export interface ApproveSubmissionParams {
  submissionId: string;
  reviewedByUserId: string;
  reviewerNotes?: string;
  // Replaces task.points for every task this approval completes.
  pointsAwardedOverride?: number;
  // Required when the submission claims a MANUAL leaf — the mod decides
  // completion directly instead of it being computed from item claims.
  // Ignored otherwise.
  taskCompleted?: boolean;
}

export interface ApproveSubmissionResult {
  submission: typeof submissions.$inferSelect;
  // Every task touched by the submission's claims.
  taskIds: string[];
  completedTaskIds: string[];
  pointsAwarded: number;
  completedLineIds: string[];
}

function assertWildcardCapsNotExceeded(tx: Tx, teamId: string, submissionId: string): void {
  const wildcardIds = tx
    .select({ wildcardId: claims.wildcardId })
    .from(claims)
    .where(eq(claims.submissionId, submissionId))
    .all()
    .map((r) => r.wildcardId)
    .filter((id): id is string => id !== null);
  for (const wildcardId of new Set(wildcardIds)) {
    const wildcard = tx.select().from(tileWildcards).where(eq(tileWildcards.id, wildcardId)).get();
    if (!wildcard) throw new ServiceError(404, "Wildcard not found");
    const approvedUses = tx
      .select({ id: claims.id })
      .from(claims)
      .innerJoin(submissions, eq(claims.submissionId, submissions.id))
      .where(and(eq(submissions.teamId, teamId), eq(submissions.status, "approved"), eq(claims.wildcardId, wildcardId)))
      .all().length;
    const thisUses = wildcardIds.filter((id) => id === wildcardId).length;
    if (approvedUses + thisUses > wildcard.maxRedemptionsPerTeam) {
      throw new ServiceError(400, `${wildcard.itemName} has already been redeemed the maximum number of times for this team`);
    }
  }
}

export function approveSubmission(db: Db, params: ApproveSubmissionParams): ApproveSubmissionResult {
  return db.transaction((tx): ApproveSubmissionResult => {
    const submission = tx.select().from(submissions).where(eq(submissions.id, params.submissionId)).get();
    if (!submission) throw new ServiceError(404, "Submission not found");
    if (submission.status !== "pending") throw new ServiceError(409, "Submission has already been reviewed");

    const taskIds = getSubmissionTaskIds(tx, submission.id);
    const tasks = tx.select().from(tileTasks).where(inArray(tileTasks.id, taskIds)).all();
    if (tasks.some((t) => t.scoringMode === "manual") && params.taskCompleted === undefined) {
      throw new ServiceError(400, "taskCompleted is required when approving a manual-scoring task");
    }

    assertWildcardCapsNotExceeded(tx, submission.teamId, submission.id);

    tx.update(submissions)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: params.reviewedByUserId,
        reviewerNotes: params.reviewerNotes ?? null,
        pointsAwarded: params.pointsAwardedOverride ?? null,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submission.id))
      .run();

    const completedTaskIds: string[] = [];
    const completedLineIds: string[] = [];
    let pointsAwarded = 0;

    for (const task of tasks) {
      const progress = getOrCreateProgress(tx, submission.teamId, task.id);
      if (progress.status === "completed") continue;

      const root = getRequirementTree(tx, task.id);
      if (!root) throw new ServiceError(500, `Task ${task.id} has no requirement tree`);
      const complete = evaluateNode(
        root,
        getApprovedClaimsForTask(tx, submission.teamId, task.id),
        params.taskCompleted ?? false,
      );
      if (!complete) {
        refreshTaskProgressStatus(tx, submission.teamId, task.id);
        continue;
      }

      const tasksOrdered = getTileTasksOrdered(tx, task.tileId);
      const idx = tasksOrdered.findIndex((t) => t.id === task.id);
      const prevTask = idx > 0 ? tasksOrdered[idx - 1] : null;
      const prevCompleted = prevTask
        ? tx
            .select()
            .from(teamTaskProgress)
            .where(and(eq(teamTaskProgress.teamId, submission.teamId), eq(teamTaskProgress.taskId, prevTask.id)))
            .get()?.status === "completed"
        : true;
      const withheld = task.pointsRequirePrevious && !prevCompleted;
      const taskPoints = withheld ? 0 : (params.pointsAwardedOverride ?? task.points);

      tx.update(teamTaskProgress)
        .set({ status: "completed", pointsAwarded: taskPoints, completedAt: new Date() })
        .where(eq(teamTaskProgress.id, progress.id))
        .run();
      completedTaskIds.push(task.id);
      pointsAwarded += taskPoints;

      releaseWithheldPointsOnNext(tx, submission.teamId, task.tileId, task.sortOrder);
      completedLineIds.push(...recordCompletedLinesForTile(tx, submission.teamId, task.tileId));
    }

    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;
    return { submission: updatedSubmission, taskIds, completedTaskIds, pointsAwarded, completedLineIds };
  });
}

export interface RejectSubmissionParams {
  submissionId: string;
  reviewedByUserId: string;
  reviewerNotes?: string;
}

export function rejectSubmission(db: Db, params: RejectSubmissionParams): { submission: typeof submissions.$inferSelect; taskIds: string[] } {
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

    const taskIds = getSubmissionTaskIds(tx, submission.id);
    for (const taskId of taskIds) refreshTaskProgressStatus(tx, submission.teamId, taskId);

    const updatedSubmission = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;
    return { submission: updatedSubmission, taskIds };
  });
}
