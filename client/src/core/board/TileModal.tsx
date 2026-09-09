import type { Bingo, SubmissionDetails, Tile, TileCategory, TeamNodeState } from "@bingo/shared";
import { Heading } from "react-aria-components";
import { Dialog } from "../ui/Dialog";
import { Button, IconButton } from "../ui/Button";
import { Badge } from "../ui/Card";
import { ClockIcon, XIcon } from "../ui/icons";
import { SubmissionRow } from "../submissions/SubmissionRow";
import { TaskPanel } from "./TaskPanel";
import { buildLeafClaimMaps } from "./taskClaims";
import { collectLeaves } from "./requirementTree";
import { summarizeTileProgress, getFreezeUnlockAt } from "./tileProgress";

/** `tile` null closes the dialog (kept mounted so it can animate out). */
export function TileModal({
  tile,
  bingo,
  category,
  nodeStates,
  teamSubmissions,
  onClose,
  onSubmit,
}: {
  tile: Tile | null;
  bingo: Bingo;
  category?: TileCategory;
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
  onClose: () => void;
  onSubmit?: () => void;
}) {
  return (
    <Dialog isOpen={tile !== null} onClose={onClose} size="lg">
      {tile && <TileDetails tile={tile} bingo={bingo} category={category} nodeStates={nodeStates} teamSubmissions={teamSubmissions} onClose={onClose} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function TileDetails({
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
    <>
      <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: category?.colorHex ?? undefined }}>
        <div className="flex min-w-0 items-center gap-4">
          {tile.imageUrl && <img src={tile.imageUrl} alt="" className="size-14 shrink-0 object-contain" />}
          <div className="min-w-0">
            <Heading slot="title" className="text-lg font-semibold text-fg">
              {tile.name}
            </Heading>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {category && (
                <Badge className="border-current" style={{ color: category.colorHex ?? undefined }}>
                  {category.label}
                </Badge>
              )}
              <span className="num text-sm text-fg-muted">
                {summary.totalTasks > 0 ? `${summary.pointsAwarded}/` : ""}
                {summary.totalPoints} pts
              </span>
              {tile.hasFreezePeriod && (
                <Badge tone="info">
                  <ClockIcon size={12} />
                  <span className="num">{tile.freezeDurationMinutes}min</span> freeze
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onSubmit && (
            <Button variant="primary" size="sm" onPress={onSubmit} isDisabled={submitDisabled}>
              {summary.allComplete ? "Complete" : isFrozen ? "Frozen" : "Submit"}
            </Button>
          )}
          <IconButton label="Close" size="sm" onPress={onClose}>
            <XIcon />
          </IconButton>
        </div>
      </div>

      <div className="grid divide-x divide-line" style={{ gridTemplateColumns: `repeat(${Math.max(tasks.length, 1)}, minmax(0, 1fr))` }}>
        {tasks.map((task) => {
          const gate = task.submitGateNodeId ? tasks.find((t) => t.id === task.submitGateNodeId) : undefined;
          const locked = gate ? summary.statusByNodeId.get(gate.id) !== "completed" : false;
          return (
            <TaskPanel
              key={task.id}
              task={task}
              claimMaps={claimMaps}
              statusByNodeId={summary.statusByNodeId}
              locked={locked}
              lockedReason={locked && gate ? `${task.label} cannot be submitted until ${gate.label} is completed.` : undefined}
              complete={summary.statusByNodeId.get(task.id) === "completed"}
            />
          );
        })}
      </div>

      {tileSubmissions.length > 0 && (
        <div className="border-t border-line p-5">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Submissions</h3>
          {tileSubmissions.map((detail) => {
            const labels = [...new Set(detail.claims.map((c) => taskLabelByLeafId.get(c.nodeId)).filter(Boolean))];
            return (
              <div key={detail.submission.id}>
                <p className="mt-2 text-xs font-medium text-fg-muted">{labels.join(" + ")}</p>
                <SubmissionRow detail={detail} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
