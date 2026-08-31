import type { SubmissionDetails, Tile, TaskStatus, TeamTaskProgress } from "@bingo/shared";

export interface TileProgressSummary {
  completedTasks: number;
  totalTasks: number;
  pointsAwarded: number;
  totalPoints: number;
  allComplete: boolean;
  statusByTaskId: Map<string, TaskStatus>;
}

export function summarizeTileProgress(tile: Tile, progress: TeamTaskProgress[]): TileProgressSummary {
  const byTaskId = new Map(progress.map((p) => [p.taskId, p]));
  const statusByTaskId = new Map<string, TaskStatus>();
  let completedTasks = 0;
  let pointsAwarded = 0;
  const totalPoints = tile.tasks.reduce((sum, t) => sum + t.points, 0);

  for (const task of tile.tasks) {
    const p = byTaskId.get(task.id);
    const status = p?.status ?? "not_started";
    statusByTaskId.set(task.id, status);
    if (status === "completed") completedTasks++;
    pointsAwarded += p?.pointsAwarded ?? 0;
  }

  return {
    completedTasks,
    totalTasks: tile.tasks.length,
    pointsAwarded,
    totalPoints,
    allComplete: tile.tasks.length > 0 && completedTasks === tile.tasks.length,
    statusByTaskId,
  };
}

export function getFreezeUnlockAt(bingoStartsAt: string | null, tile: Tile): number | null {
  if (!tile.hasFreezePeriod || !bingoStartsAt) return null;
  return new Date(bingoStartsAt).getTime() + tile.freezeDurationMinutes * 60_000;
}

function taskToTileMap(tiles: Tile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tile of tiles) for (const task of tile.tasks) map.set(task.id, tile.id);
  return map;
}

export function groupProgressByTile(tiles: Tile[], progress: TeamTaskProgress[]): Map<string, TeamTaskProgress[]> {
  const taskToTile = taskToTileMap(tiles);
  const map = new Map<string, TeamTaskProgress[]>();
  for (const p of progress) {
    const tileId = taskToTile.get(p.taskId);
    if (!tileId) continue;
    const list = map.get(tileId) ?? [];
    list.push(p);
    map.set(tileId, list);
  }
  return map;
}

export function groupSubmissionsByTile(tiles: Tile[], submissions: SubmissionDetails[]): Map<string, SubmissionDetails[]> {
  const taskToTile = taskToTileMap(tiles);
  const map = new Map<string, SubmissionDetails[]>();
  for (const s of submissions) {
    const tileId = taskToTile.get(s.submission.taskId);
    if (!tileId) continue;
    const list = map.get(tileId) ?? [];
    list.push(s);
    map.set(tileId, list);
  }
  return map;
}
