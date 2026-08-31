import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  submissionItemClaims, submissions, submissionScreenshots, teams, teamTaskProgress,
  tileTasks, tiles, tileWildcards, users,
} from "../db/schema";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

export interface ItemClaimInput {
  itemName: string;
  quantity?: number;
  taskItemId?: string;
}

export interface CreateSubmissionParams {
  teamId: string;
  taskId: string;
  submittedByUserId: string;
  itemClaims: ItemClaimInput[];
  screenshotUrl: string;
  isWildcardRedemption?: boolean;
  wildcardId?: string;
  now?: Date; // injectable for tests
}

// All submission-time gating lives here — the client mirrors these checks
// for UX, but this is the enforcement (v1 only enforced freeze/gating
// client-side, which meant a direct API call bypassed both).
export function createSubmission(db: Db, bingo: Bingo, params: CreateSubmissionParams) {
  return db.transaction((tx) => {
    const now = params.now ?? new Date();

    if (bingo.stage !== "live") {
      throw new ServiceError(400, "Submissions are only open while the bingo is live");
    }
    if (!bingo.startsAt || now < bingo.startsAt) {
      throw new ServiceError(400, "The bingo has not started yet");
    }

    const task = tx.select().from(tileTasks).where(eq(tileTasks.id, params.taskId)).get();
    if (!task) throw new ServiceError(404, "Task not found");
    const tile = tx.select().from(tiles).where(eq(tiles.id, task.tileId)).get();
    if (!tile || tile.bingoId !== bingo.id) throw new ServiceError(404, "Tile not found");

    if (tile.hasFreezePeriod) {
      const unlockAt = new Date(bingo.startsAt.getTime() + tile.freezeDurationMinutes * 60_000);
      if (now < unlockAt) {
        throw new ServiceError(400, `This tile is frozen until ${unlockAt.toISOString()}`);
      }
    }

    if (task.submitRequiresPrevious) {
      const tasksOrdered = tx.select().from(tileTasks).where(eq(tileTasks.tileId, tile.id)).orderBy(tileTasks.sortOrder).all();
      const idx = tasksOrdered.findIndex((t) => t.id === task.id);
      const prevTask = idx > 0 ? tasksOrdered[idx - 1] : null;
      if (prevTask) {
        const prevProgress = tx
          .select()
          .from(teamTaskProgress)
          .where(and(eq(teamTaskProgress.teamId, params.teamId), eq(teamTaskProgress.taskId, prevTask.id)))
          .get();
        if (prevProgress?.status !== "completed") {
          throw new ServiceError(400, "The previous task on this tile must be completed first");
        }
      }
    }

    // Manual-scoring tasks have no item list to claim against — the mod
    // judges the screenshot directly, so an empty claim list is fine.
    if (task.scoringMode === "automatic" && params.itemClaims.length === 0) {
      throw new ServiceError(400, "At least one item claim is required");
    }

    if (params.isWildcardRedemption) {
      if (!params.wildcardId) throw new ServiceError(400, "wildcardId is required for a wildcard redemption");
      const wildcard = tx.select().from(tileWildcards).where(eq(tileWildcards.id, params.wildcardId)).get();
      if (!wildcard || wildcard.tileId !== tile.id) {
        throw new ServiceError(400, "Wildcard does not belong to this tile");
      }
      if (wildcard.applicableTaskId && wildcard.applicableTaskId !== task.id) {
        throw new ServiceError(400, "Wildcard is not applicable to this task");
      }
    }

    const submission = tx
      .insert(submissions)
      .values({
        teamId: params.teamId,
        taskId: task.id,
        submittedByUserId: params.submittedByUserId,
        isWildcardRedemption: params.isWildcardRedemption ?? false,
        wildcardId: params.wildcardId ?? null,
      })
      .returning()
      .get();

    tx.insert(submissionScreenshots).values({ submissionId: submission.id, storageUrl: params.screenshotUrl }).run();

    for (const claim of params.itemClaims) {
      tx.insert(submissionItemClaims)
        .values({ submissionId: submission.id, itemName: claim.itemName, quantity: claim.quantity ?? 1, taskItemId: claim.taskItemId ?? null })
        .run();
    }

    const progress = tx
      .select()
      .from(teamTaskProgress)
      .where(and(eq(teamTaskProgress.teamId, params.teamId), eq(teamTaskProgress.taskId, task.id)))
      .get();
    if (progress) {
      if (progress.status !== "completed") {
        tx.update(teamTaskProgress).set({ status: "pending_approval" }).where(eq(teamTaskProgress.id, progress.id)).run();
      }
    } else {
      tx.insert(teamTaskProgress).values({ teamId: params.teamId, taskId: task.id, status: "pending_approval" }).run();
    }

    return submission;
  });
}

export type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">;

export interface SubmissionDetails {
  submission: typeof submissions.$inferSelect;
  screenshots: (typeof submissionScreenshots.$inferSelect)[];
  claims: (typeof submissionItemClaims.$inferSelect)[];
  submittedByUser: MinimalUser | null;
}

// Attaches screenshots, item claims, and the submitter's (minimal) user row
// to a set of submissions — every submission list the client renders needs
// all three to be reviewable/displayable.
function attachDetails(db: Db, subs: (typeof submissions.$inferSelect)[]): SubmissionDetails[] {
  if (subs.length === 0) return [];
  const submissionIds = subs.map((s) => s.id);
  const screenshots = db.select().from(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, submissionIds)).all();
  const claims = db.select().from(submissionItemClaims).where(inArray(submissionItemClaims.submissionId, submissionIds)).all();
  const userIds = [...new Set(subs.map((s) => s.submittedByUserId))];
  const userRows = db
    .select({ id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick })
    .from(users)
    .where(inArray(users.id, userIds))
    .all();
  const userById = new Map(userRows.map((u) => [u.id, u]));

  return subs.map((s) => ({
    submission: s,
    screenshots: screenshots.filter((sc) => sc.submissionId === s.id),
    claims: claims.filter((c) => c.submissionId === s.id),
    submittedByUser: userById.get(s.submittedByUserId) ?? null,
  }));
}

export interface ModSubmissionRow extends SubmissionDetails {
  task: typeof tileTasks.$inferSelect;
  tile: typeof tiles.$inferSelect;
  team: Pick<typeof teams.$inferSelect, "id" | "name" | "color">;
}

export function getAllSubmissionsForBingo(db: Db, bingoId: string): ModSubmissionRow[] {
  const rows = db
    .select({ submission: submissions, task: tileTasks, tile: tiles, team: { id: teams.id, name: teams.name, color: teams.color } })
    .from(submissions)
    .innerJoin(tileTasks, eq(submissions.taskId, tileTasks.id))
    .innerJoin(tiles, eq(tileTasks.tileId, tiles.id))
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(tiles.bingoId, bingoId))
    .all();

  const details = attachDetails(db, rows.map((r) => r.submission));
  const detailsById = new Map(details.map((d) => [d.submission.id, d]));

  return rows.map((r) => ({ ...detailsById.get(r.submission.id)!, task: r.task, tile: r.tile, team: r.team }));
}

export function getPendingSubmissions(db: Db, bingoId: string) {
  return getAllSubmissionsForBingo(db, bingoId).filter((row) => row.submission.status === "pending");
}

export function getPendingCount(db: Db, bingoId: string): number {
  return getPendingSubmissions(db, bingoId).length;
}

export function getSubmissionById(db: Db, submissionId: string) {
  return db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
}

export function getTeamSubmissions(db: Db, teamId: string): SubmissionDetails[] {
  return attachDetails(db, db.select().from(submissions).where(eq(submissions.teamId, teamId)).all());
}
