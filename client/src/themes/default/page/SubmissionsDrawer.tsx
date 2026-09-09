import type { SubmissionModel } from "../../../headless/types";
import { Dialog, DialogHeader } from "../../../core/ui/Dialog";
import { Button } from "../../../core/ui/Button";
import { Badge, EmptyState } from "../../../core/ui/Card";
import { ImageIcon } from "../../../core/ui/icons";
import { SubmissionStatusBadge } from "../../../core/ui/StatusBadge";
import { ScreenshotThumb } from "../../../core/submissions/ScreenshotThumb";

export function SubmissionsDrawer({
  isOpen,
  submissions,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  submissions: SubmissionModel[];
  onClose: () => void;
  onSubmit?: () => void;
}) {
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

      {submissions.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={<ImageIcon />} title="No submissions yet">
            Submit a completion using the Submit button in the header.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {submissions.map((s) => (
            <li key={s.id} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-hover">
              <ScreenshotThumb url={s.thumbnailUrl ?? undefined} />

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-fg">{s.tileName ?? "Unknown tile"}</span>
                  {s.taskLabels.map((label) => (
                    <Badge key={label}>{label}</Badge>
                  ))}
                </div>
                <p className="truncate text-sm text-fg-muted">{s.summary}</p>
                {s.submittedBy && <p className="mt-0.5 text-xs text-fg-subtle">by {s.submittedBy}</p>}
                {s.reviewerNotes && <p className="mt-0.5 truncate text-xs text-warn">{s.reviewerNotes}</p>}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <SubmissionStatusBadge status={s.status} />
                <span className="text-xs text-fg-subtle">{s.timeAgo}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
