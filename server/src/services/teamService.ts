import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLines, teamCompletedLines, teamMembers, teamPointAdjustments, teamTaskProgress, teams } from "../db/schema";

type Db = BetterSQLite3Database<typeof schema>;

export function getTeamsForBingo(db: Db, bingoId: string) {
  return db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
}

export function getTeamById(db: Db, teamId: string) {
  return db.select().from(teams).where(eq(teams.id, teamId)).get();
}

export function getTeamMembers(db: Db, teamId: string) {
  return db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all();
}

// A user belongs to at most one team per bingo (enforced by the draft flow).
export function getUserTeamForBingo(db: Db, bingoId: string, userId: string) {
  const rows = db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.bingoId, bingoId), eq(teamMembers.userId, userId)))
    .all();
  return rows[0]?.team ?? null;
}

export interface TeamProgressSummary {
  tasks: (typeof teamTaskProgress.$inferSelect)[];
  completedLines: { bingoLineId: string; points: number; completedAt: Date }[];
  adjustments: (typeof teamPointAdjustments.$inferSelect)[];
  totalPoints: number;
}

export function getTeamProgress(db: Db, teamId: string): TeamProgressSummary {
  const taskProgress = db.select().from(teamTaskProgress).where(eq(teamTaskProgress.teamId, teamId)).all();
  const completedLineRows = db.select().from(teamCompletedLines).where(eq(teamCompletedLines.teamId, teamId)).all();
  const lineIds = completedLineRows.map((l) => l.bingoLineId);
  const lineRows = lineIds.length ? db.select().from(bingoLines).where(inArray(bingoLines.id, lineIds)).all() : [];
  const adjustments = db.select().from(teamPointAdjustments).where(eq(teamPointAdjustments.teamId, teamId)).all();

  const taskPoints = taskProgress.reduce((sum, t) => sum + t.pointsAwarded, 0);
  const linePoints = lineRows.reduce((sum, l) => sum + l.points, 0);
  const adjustmentPoints = adjustments.reduce((sum, a) => sum + a.amount, 0);

  return {
    tasks: taskProgress,
    completedLines: completedLineRows.map((cl) => ({
      bingoLineId: cl.bingoLineId,
      points: lineRows.find((l) => l.id === cl.bingoLineId)?.points ?? 0,
      completedAt: cl.completedAt,
    })),
    adjustments,
    totalPoints: taskPoints + linePoints + adjustmentPoints,
  };
}
