import { Heading } from "react-aria-components";
import type { TileModel } from "../../headless/types";
import { Dialog } from "../ui/Dialog";
import { Button, IconButton } from "../ui/Button";
import { Badge } from "../ui/Card";
import { ClockIcon, XIcon } from "../ui/icons";
import { SubmissionRow } from "../submissions/SubmissionRow";
import { TaskPanel } from "./TaskPanel";

/** `tile` null closes the dialog (kept mounted so it can animate out). */
export function TileModal({ tile, onClose, onSubmit }: { tile: TileModel | null; onClose: () => void; onSubmit?: () => void }) {
  return (
    <Dialog isOpen={tile !== null} onClose={onClose} size="lg">
      {tile && <TileDetails tile={tile} onClose={onClose} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function TileDetails({ tile, onClose, onSubmit }: { tile: TileModel; onClose: () => void; onSubmit?: () => void }) {
  const submitDisabled = tile.progress.allComplete || tile.freeze.isFrozen;

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: tile.category?.color ?? undefined }}>
        <div className="flex min-w-0 items-center gap-4">
          {tile.imageUrl && <img src={tile.imageUrl} alt="" className="size-14 shrink-0 object-contain" />}
          <div className="min-w-0">
            <Heading slot="title" className="text-lg font-semibold text-fg">
              {tile.name}
            </Heading>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {tile.category && (
                <Badge className="border-current" style={{ color: tile.category.color ?? undefined }}>
                  {tile.category.label}
                </Badge>
              )}
              <span className="num text-sm text-fg-muted">
                {tile.progress.totalTasks > 0 ? `${tile.progress.pointsAwarded}/` : ""}
                {tile.progress.totalPoints} pts
              </span>
              {tile.freeze.hasFreezePeriod && (
                <Badge tone="info">
                  <ClockIcon size={12} />
                  <span className="num">{tile.freeze.durationMinutes}min</span> freeze
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onSubmit && (
            <Button variant="primary" size="sm" onPress={onSubmit} isDisabled={submitDisabled}>
              {tile.progress.allComplete ? "Complete" : tile.freeze.isFrozen ? "Frozen" : "Submit"}
            </Button>
          )}
          <IconButton label="Close" size="sm" onPress={onClose}>
            <XIcon />
          </IconButton>
        </div>
      </div>

      <div className="grid divide-x divide-line" style={{ gridTemplateColumns: `repeat(${Math.max(tile.tasks.length, 1)}, minmax(0, 1fr))` }}>
        {tile.tasks.map((task) => (
          <TaskPanel key={task.id} task={task} />
        ))}
      </div>

      {tile.submissions.length > 0 && (
        <div className="border-t border-line p-5">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Submissions</h3>
          {tile.submissions.map((s) => (
            <div key={s.id}>
              <p className="mt-2 text-xs font-medium text-fg-muted">{s.taskLabels.join(" + ")}</p>
              <SubmissionRow detail={s.detail} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
