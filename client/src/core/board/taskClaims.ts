import type { SubmissionDetails, Tile } from "@bingo/shared";

export interface TaskClaimMaps {
  approvedByTaskAndItem: Map<string, Map<string, number>>;
  submittedByTask: Map<string, Set<string>>;
  approvedCountByTask: Map<string, number>;
}

// Builds per-task "what's been submitted/approved" maps from a team's
// submissions for one tile — feeds TaskPanel's strikethrough/checkmark state
// and SubmissionModal's duplicate-item exclusion.
export function buildTaskClaimMaps(tile: Tile, teamSubmissions: SubmissionDetails[]): TaskClaimMaps {
  const taskIds = new Set(tile.tasks.map((t) => t.id));
  const approvedByTaskAndItem = new Map<string, Map<string, number>>();
  const submittedByTask = new Map<string, Set<string>>();
  const approvedCountByTask = new Map<string, number>();

  for (const detail of teamSubmissions) {
    const taskId = detail.submission.taskId;
    if (!taskIds.has(taskId) || detail.submission.status === "rejected") continue;

    const submitted = submittedByTask.get(taskId) ?? new Set<string>();
    for (const c of detail.claims) submitted.add(c.itemName);
    submittedByTask.set(taskId, submitted);

    if (detail.submission.status !== "approved") continue;
    approvedCountByTask.set(taskId, (approvedCountByTask.get(taskId) ?? 0) + 1);
    const byItem = approvedByTaskAndItem.get(taskId) ?? new Map<string, number>();
    for (const c of detail.claims) byItem.set(c.itemName, (byItem.get(c.itemName) ?? 0) + c.quantity);
    approvedByTaskAndItem.set(taskId, byItem);
  }

  return { approvedByTaskAndItem, submittedByTask, approvedCountByTask };
}

/** Items already claimed for this task — folding in the previous task's claims when allowsPreviouslyAcquired is set. */
export function excludedItemNamesForTask(tile: Tile, taskId: string, maps: TaskClaimMaps): Set<string> {
  const task = tile.tasks.find((t) => t.id === taskId);
  if (!task?.requiresNoDuplicates) return new Set();
  const excluded = new Set(maps.submittedByTask.get(taskId) ?? []);
  if (task.allowsPreviouslyAcquired) {
    const idx = tile.tasks.findIndex((t) => t.id === taskId);
    const prevTask = idx > 0 ? tile.tasks[idx - 1] : null;
    if (prevTask) for (const name of maps.submittedByTask.get(prevTask.id) ?? []) excluded.add(name);
  }
  return excluded;
}
