import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ClaimInput } from "@bingo/shared";
import * as schema from "../db/schema";
import {
  claims, requirementNodes, submissions, submissionScreenshots, teams, teamTaskProgress, tileTasks, tiles, tileWildcards, users,
} from "../db/schema";
import { ServiceError } from "./errors";
import { refreshTaskProgressStatus } from "./scoringService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

export interface CreateSubmissionParams {
  teamId: string;
  submittedByUserId: string;
  claims: ClaimInput[];
  screenshotUrl: string;
  now?: Date; // injectable for tests
}

// All submission-time gating lives here — the client mirrors these checks
// for UX, but this is the enforcement.
export function createSubmission(db: Db, bingo: Bingo, params: CreateSubmissionParams) {
  return db.transaction((tx) => {
    const now = params.now ?? new Date();

    if (bingo.stage !== "live") {
      throw new ServiceError(400, "Submissions are only open while the bingo is live");
    }
    if (!bingo.startsAt || now < bingo.startsAt) {
      throw new ServiceError(400, "The bingo has not started yet");
    }
    if (params.claims.length === 0) throw new ServiceError(400, "At least one claim is required");

    const nodeIds = [...new Set(params.claims.map((c) => c.nodeId))];
    const leaves = tx.select().from(requirementNodes).where(inArray(requirementNodes.id, nodeIds)).all();
    if (leaves.length !== nodeIds.length || leaves.some((n) => n.kind !== "ITEM" && n.kind !== "MANUAL")) {
      throw new ServiceError(400, "Claims must target requirement leaves");
    }
    const leafById = new Map(leaves.map((n) => [n.id, n]));

    const taskIds = [...new Set(leaves.map((n) => n.taskId))];
    const tasks = tx.select().from(tileTasks).where(inArray(tileTasks.id, taskIds)).all();
    const tileIds = [...new Set(tasks.map((t) => t.tileId))];
    // Launch scope: one submission covers one tile. Drop this to allow
    // cross-tile claims.
    if (tileIds.length !== 1) throw new ServiceError(400, "All claims in a submission must belong to the same tile");
    const tile = tx.select().from(tiles).where(eq(tiles.id, tileIds[0])).get();
    if (!tile || tile.bingoId !== bingo.id) throw new ServiceError(404, "Tile not found");

    if (tile.hasFreezePeriod) {
      const unlockAt = new Date(bingo.startsAt.getTime() + tile.freezeDurationMinutes * 60_000);
      if (now < unlockAt) {
        throw new ServiceError(400, `This tile is frozen until ${unlockAt.toISOString()}`);
      }
    }

    const tasksOrdered = tx.select().from(tileTasks).where(eq(tileTasks.tileId, tile.id)).orderBy(tileTasks.sortOrder).all();
    for (const task of tasks) {
      if (!task.submitRequiresPrevious) continue;
      const idx = tasksOrdered.findIndex((t) => t.id === task.id);
      const prevTask = idx > 0 ? tasksOrdered[idx - 1] : null;
      if (!prevTask) continue;
      const prevProgress = tx
        .select()
        .from(teamTaskProgress)
        .where(and(eq(teamTaskProgress.teamId, params.teamId), eq(teamTaskProgress.taskId, prevTask.id)))
        .get();
      if (prevProgress?.status !== "completed") {
        throw new ServiceError(400, `${task.label}: the previous task on this tile must be completed first`);
      }
    }

    for (const claim of params.claims) {
      const leaf = leafById.get(claim.nodeId)!;
      if (leaf.kind === "ITEM" && !claim.itemName) throw new ServiceError(400, "itemName is required for item claims");
      if (!claim.wildcardId) continue;
      const wildcard = tx.select().from(tileWildcards).where(eq(tileWildcards.id, claim.wildcardId)).get();
      if (!wildcard || wildcard.tileId !== tile.id) throw new ServiceError(400, "Wildcard does not belong to this tile");
      if (wildcard.applicableNodeId && wildcard.applicableNodeId !== claim.nodeId) {
        throw new ServiceError(400, "Wildcard is not applicable to this requirement");
      }
    }

    const submission = tx
      .insert(submissions)
      .values({ teamId: params.teamId, submittedByUserId: params.submittedByUserId })
      .returning()
      .get();

    tx.insert(submissionScreenshots).values({ submissionId: submission.id, storageUrl: params.screenshotUrl }).run();

    for (const claim of params.claims) {
      tx.insert(claims)
        .values({
          submissionId: submission.id,
          nodeId: claim.nodeId,
          itemName: claim.itemName ?? null,
          quantity: claim.quantity ?? 1,
          wildcardId: claim.wildcardId ?? null,
        })
        .run();
    }

    for (const taskId of taskIds) refreshTaskProgressStatus(tx, params.teamId, taskId);

    return submission;
  });
}

export type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">;

export interface ClaimRow {
  id: string;
  submissionId: string;
  nodeId: string;
  taskId: string;
  itemName: string | null;
  quantity: number;
  wildcardId: string | null;
}

export interface SubmissionDetails {
  submission: typeof submissions.$inferSelect;
  screenshots: (typeof submissionScreenshots.$inferSelect)[];
  claims: ClaimRow[];
  submittedByUser: MinimalUser | null;
}

// Attaches screenshots, claims, and the submitter's (minimal) user row to a
// set of submissions — every submission list the client renders needs all
// three to be reviewable/displayable.
function attachDetails(db: Db, subs: (typeof submissions.$inferSelect)[]): SubmissionDetails[] {
  if (subs.length === 0) return [];
  const submissionIds = subs.map((s) => s.id);
  const screenshots = db.select().from(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, submissionIds)).all();
  const claimRows = db
    .select({
      id: claims.id, submissionId: claims.submissionId, nodeId: claims.nodeId, taskId: requirementNodes.taskId,
      itemName: claims.itemName, quantity: claims.quantity, wildcardId: claims.wildcardId,
    })
    .from(claims)
    .innerJoin(requirementNodes, eq(claims.nodeId, requirementNodes.id))
    .where(inArray(claims.submissionId, submissionIds))
    .all();
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
    claims: claimRows.filter((c) => c.submissionId === s.id),
    submittedByUser: userById.get(s.submittedByUserId) ?? null,
  }));
}

export interface ModSubmissionRow extends SubmissionDetails {
  tasks: (typeof tileTasks.$inferSelect)[];
  tile: typeof tiles.$inferSelect;
  team: Pick<typeof teams.$inferSelect, "id" | "name" | "color">;
}

export function getAllSubmissionsForBingo(db: Db, bingoId: string): ModSubmissionRow[] {
  const rows = db
    .select({ submission: submissions, team: { id: teams.id, name: teams.name, color: teams.color } })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(teams.bingoId, bingoId))
    .all();

  const details = attachDetails(db, rows.map((r) => r.submission));
  const taskIds = [...new Set(details.flatMap((d) => d.claims.map((c) => c.taskId)))];
  const taskRows = taskIds.length ? db.select().from(tileTasks).where(inArray(tileTasks.id, taskIds)).orderBy(tileTasks.sortOrder).all() : [];
  const tileIds = [...new Set(taskRows.map((t) => t.tileId))];
  const tileRows = tileIds.length ? db.select().from(tiles).where(inArray(tiles.id, tileIds)).all() : [];
  const taskById = new Map(taskRows.map((t) => [t.id, t]));
  const tileById = new Map(tileRows.map((t) => [t.id, t]));

  return rows.map((r, i) => {
    const d = details[i];
    const tasks = [...new Set(d.claims.map((c) => c.taskId))].map((id) => taskById.get(id)!);
    return { ...d, tasks, tile: tileById.get(tasks[0].tileId)!, team: r.team };
  });
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
