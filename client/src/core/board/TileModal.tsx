import type { Bingo, SubmissionDetails, Tile, TileCategory, TeamNodeState } from "@bingo/shared";
import { Modal } from "../ui/Modal";
import { SubmissionRow } from "../submissions/SubmissionRow";
import { TaskPanel } from "./TaskPanel";
import { buildLeafClaimMaps } from "./taskClaims";
import { collectLeaves } from "./requirementTree";
import { summarizeTileProgress, getFreezeUnlockAt } from "./tileProgress";

export function TileModal({
  tile,
  bingo,
  category,
  nodeStates,
  teamSubmissions,
  onClose,
  onSubmit,
}: {
  tile: Tile;
  bingo: Bingo;
  category?: TileCategory;
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
  onClose: () => void;
  onSubmit?: () => void;
}) {
  const accent = category?.colorHex;
  const summary = summarizeTileProgress(tile, nodeStates, teamSubmissions);
  const freezeUnlocksAt = getFreezeUnlockAt(bingo.startsAt, tile);
  const isFrozen = !!(freezeUnlocksAt && Date.now() < freezeUnlocksAt);
  const submitDisabled = summary.allComplete || isFrozen;

  const claimMaps = buildLeafClaimMaps(teamSubmissions);
  const tasks = tile.node.children;

  // A claim targets a leaf, which may be nested under a task's ALL/ANY/COUNT
  // wrapper rather than being the task itself — map each leaf back to the
  // task that owns it for display (labels, "which submissions belong here").
  const taskLabelByLeafId = new Map<string, string>();
  const leafIds = new Set<string>();
  for (const task of tasks) {
    for (const leaf of collectLeaves(task)) {
      taskLabelByLeafId.set(leaf.id, task.label ?? "");
      leafIds.add(leaf.id);
    }
  }
  const tileSubmissions = teamSubmissions.filter((d) => d.claims.some((c) => leafIds.has(c.nodeId)));

  return (
    <Modal onClose={onClose} size="lg">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b-2" style={{ borderColor: accent ?? "#64748b" }}>
        <div className="flex items-center gap-4">
          {tile.imageUrl && <img src={tile.imageUrl} alt={tile.name} className="w-16 h-16 object-contain shrink-0" />}
          <div>
            <h2 className="text-white text-xl font-bold">{tile.name}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {category && (
                <span
                  className="text-xs font-semibold border rounded-full px-2.5 py-0.5"
                  style={{ color: category.colorHex ?? undefined, borderColor: category.colorHex ?? undefined, backgroundColor: category.colorHex ? `${category.colorHex}1a` : undefined }}
                >
                  {category.label}
                </span>
              )}
              <span className="text-yellow-400 text-sm font-semibold">
                {summary.totalTasks > 0 ? `${summary.pointsAwarded}/` : ""}
                {summary.totalPoints} pts
              </span>
              {tile.hasFreezePeriod && (
                <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2.5 py-0.5">
                  ⏱ {tile.freezeDurationMinutes}min freeze
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onSubmit && (
            <button
              onClick={submitDisabled ? undefined : onSubmit}
              disabled={submitDisabled}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Submit
            </button>
          )}
          <button aria-label="Close" className="text-slate-400 hover:text-white text-lg leading-none p-1 cursor-pointer" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* Tasks */}
      <div className="grid divide-x divide-slate-700" style={{ gridTemplateColumns: `repeat(${Math.max(tasks.length, 1)}, minmax(0, 1fr))` }}>
        {tasks.map((task) => {
          const gate = task.submitGateNodeId ? tasks.find((t) => t.id === task.submitGateNodeId) : undefined;
          const locked = gate ? summary.statusByNodeId.get(gate.id) !== "completed" : false;
          return (
            <TaskPanel
              key={task.id}
              task={task}
              claimMaps={claimMaps}
              locked={locked}
              lockedReason={locked && gate ? `${task.label} cannot be submitted until ${gate.label} is completed.` : undefined}
              complete={summary.statusByNodeId.get(task.id) === "completed"}
            />
          );
        })}
      </div>

      {/* Team submissions */}
      {tileSubmissions.length > 0 && (
        <div className="p-5 border-t border-slate-700">
          <h4 className="text-slate-400 text-xs uppercase tracking-wide mb-3">Submissions</h4>
          {tileSubmissions.map((detail) => {
            const labels = [...new Set(detail.claims.map((c) => taskLabelByLeafId.get(c.nodeId)).filter(Boolean))];
            return (
              <div key={detail.submission.id}>
                <p className="text-xs font-semibold text-slate-400 mt-2">{labels.join(" + ")}</p>
                <SubmissionRow detail={detail} />
              </div>
            );
          })}
        </div>
      )}

    </Modal>
  );
}
