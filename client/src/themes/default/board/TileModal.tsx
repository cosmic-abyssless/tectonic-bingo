import { Heading } from "react-aria-components";
import type { TileModel } from "../../../headless/types";
import { Dialog } from "../../../core/ui/Dialog";
import { Button, IconButton } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { ClockIcon, HandIcon, XIcon } from "../../../core/ui/icons";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { useSlot } from "../../context";

/** `tile` null while `isOpen` transitions closed (kept mounted so it can animate out). */
export function TileModal({ tile, isOpen, onClose, onSubmit, onToggleInterest }: { tile: TileModel | null; isOpen: boolean; onClose: () => void; onSubmit?: () => void; onToggleInterest?: () => void }) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      {tile && <TileDetails tile={tile} onClose={onClose} onSubmit={onSubmit} onToggleInterest={onToggleInterest} />}
    </Dialog>
  );
}

function TileDetails({ tile, onClose, onSubmit, onToggleInterest }: { tile: TileModel; onClose: () => void; onSubmit?: () => void; onToggleInterest?: () => void }) {
  const TaskPanel = useSlot("TaskPanel");
  const TileSubmissions = useSlot("TileSubmissions");
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

      {(onToggleInterest || tile.interest.people.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3 text-sm">
          {onToggleInterest && (
            <Button variant={tile.interest.mine ? "primary" : "secondary"} size="sm" onPress={onToggleInterest} aria-pressed={tile.interest.mine}>
              <HandIcon fill={tile.interest.mine ? "currentColor" : "none"} />
              {tile.interest.mine ? "I'm on this" : "I'll do this"}
            </Button>
          )}
          {tile.interest.people.length > 0 ? (
            <p className="text-fg-muted">
              <span className="text-fg-subtle">On this tile: </span>
              {tile.interest.people.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <PlayerName userId={p.id}>{p.displayName}</PlayerName>
                </span>
              ))}
            </p>
          ) : (
            <p className="text-fg-subtle">Nobody has claimed this tile yet.</p>
          )}
        </div>
      )}

      <div className="grid divide-x divide-line" style={{ gridTemplateColumns: `repeat(${Math.max(tile.tasks.length, 1)}, minmax(0, 1fr))` }}>
        {tile.tasks.map((task) => (
          <TaskPanel key={task.id} task={task} />
        ))}
      </div>

      {tile.submissions.length > 0 && <TileSubmissions submissions={tile.submissions} />}
    </>
  );
}
