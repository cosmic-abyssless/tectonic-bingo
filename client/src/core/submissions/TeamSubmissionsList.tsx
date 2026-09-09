import type { SubmissionDetails, Tile } from "@bingo/shared";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Badge, EmptyState } from "../ui/Card";
import { ImageIcon } from "../ui/icons";
import { SubmissionStatusBadge } from "../ui/StatusBadge";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";
import { collectLeaves } from "../board/requirementTree";
import { claimsSummary } from "./claimsSummary";
import { ScreenshotThumb } from "./ScreenshotThumb";

export function TeamSubmissionsList({
  isOpen,
  tiles,
  submissions,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  tiles: Tile[];
  submissions: SubmissionDetails[];
  onClose: () => void;
  onSubmit?: () => void;
}) {
  // A claim targets a leaf, which may be nested under a task's ALL/ANY/COUNT
  // wrapper rather than being the task itself.
  const taskLookup = new Map<string, { tile: Tile; taskLabel: string }>();
  for (const tile of tiles) for (const task of tile.node.children) for (const leaf of collectLeaves(task)) taskLookup.set(leaf.id, { tile, taskLabel: task.label ?? "" });

  const sorted = [...submissions].sort((a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime());

  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      <DialogHeader
        title="Team submissions"
        subtitle={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""}`}
        onClose={onClose}
        action={
          onSubmit && (
            <Button variant="primary" size="sm" onPress={onSubmit}>
              Submit
            </Button>
          )
        }
      />

      {sorted.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={<ImageIcon />} title="No submissions yet">
            Submit a completion using the Submit button in the header.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((detail) => {
            const infos = [...new Set(detail.claims.map((c) => c.nodeId))].map((id) => taskLookup.get(id)).filter((i) => !!i);
            const tileName = infos[0]?.tile.name;
            return (
              <li key={detail.submission.id} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-hover">
                <ScreenshotThumb url={detail.screenshots[0]?.storageUrl} />

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{tileName ?? "Unknown tile"}</span>
                    {infos.map((info) => (
                      <Badge key={info.taskLabel}>{info.taskLabel}</Badge>
                    ))}
                  </div>
                  <p className="truncate text-sm text-fg-muted">{claimsSummary(detail.claims)}</p>
                  {detail.submittedByUser && <p className="mt-0.5 text-xs text-fg-subtle">by {displayName(detail.submittedByUser)}</p>}
                  {detail.submission.reviewerNotes && <p className="mt-0.5 truncate text-xs text-warn">{detail.submission.reviewerNotes}</p>}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <SubmissionStatusBadge status={detail.submission.status} />
                  <span className="text-xs text-fg-subtle">{timeAgo(detail.submission.submittedAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
