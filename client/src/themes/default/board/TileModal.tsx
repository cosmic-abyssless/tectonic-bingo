import { Heading } from "react-aria-components";
import type { TileModel } from "../../../headless/types";
import { Dialog } from "../../../core/ui/Dialog";
import { Button, IconButton } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { ClockIcon, HandIcon, XIcon } from "../../../core/ui/icons";
import { TaskInterestPeople } from "../../../core/ui/TaskInterestPeople";
import { useSlot } from "../../context";
import { thumbUrl } from "../../../api/imageVariants";

/** `tile` null while `isOpen` transitions closed (kept mounted so it can animate out). */
export function TileModal({
  tile,
  isOpen,
  onClose,
  onSubmit,
  onToggleInterest,
}: {
  tile: TileModel | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (taskId?: string) => void;
  onToggleInterest?: (taskId: string) => void;
}) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      {tile && <TileDetails tile={tile} onClose={onClose} onSubmit={onSubmit} onToggleInterest={onToggleInterest} />}
    </Dialog>
  );
}

function TileDetails({
  tile,
  onClose,
  onSubmit,
  onToggleInterest,
}: {
  tile: TileModel;
  onClose: () => void;
  onSubmit?: (taskId?: string) => void;
  onToggleInterest?: (taskId: string) => void;
}) {
  const TaskPanel = useSlot("TaskPanel");
  const TileSubmissions = useSlot("TileSubmissions");
  const submitDisabled = tile.progress.allComplete || tile.freeze.isFrozen;
  const showInterestRow = !!onToggleInterest || tile.tasks.some((t) => t.interest.people.length > 0);

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: tile.category?.color ?? undefined }}>
        <div className="flex min-w-0 items-center gap-4">
          {tile.imageUrl && <img src={thumbUrl(tile.imageUrl)} alt="" className="size-14 shrink-0 object-contain" />}
          <div className="min-w-0">
            <Heading slot="title" className="text-lg font-semibold text-on-surface">
              {tile.name}
            </Heading>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {tile.category && (
                <Badge className="border-current" style={{ color: tile.category.color ?? undefined }}>
                  {tile.category.label}
                </Badge>
              )}
              <span className="num text-sm text-on-surface-muted">
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
            <Button variant="primary" size="sm" onPress={() => onSubmit()} isDisabled={submitDisabled}>
              {tile.progress.allComplete ? "Complete" : tile.freeze.isFrozen ? "Frozen" : "Submit"}
            </Button>
          )}
          <IconButton label="Close" size="sm" onPress={onClose}>
            <XIcon />
          </IconButton>
        </div>
      </div>

      {showInterestRow && (
        <ul className="divide-y divide-outline border-b border-outline text-sm">
          {tile.tasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium text-on-surface">{task.label}</span>
              <TaskInterestPeople interest={task.interest} maxInline={1} variant="default" />
              {onToggleInterest && task.interest.canToggle && (
                <Button variant={task.interest.mine ? "primary" : "secondary"} size="sm" onPress={() => onToggleInterest(task.id)} aria-pressed={task.interest.mine}>
                  <HandIcon fill={task.interest.mine ? "currentColor" : "none"} />
                  {task.interest.mine ? "I'm on this" : "I'll do this"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 divide-y divide-outline md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] md:divide-y-0 md:divide-x">
        {tile.tasks.map((task) => (
          <TaskPanel key={task.id} task={task} />
        ))}
      </div>

      {tile.submissions.length > 0 && <TileSubmissions submissions={tile.submissions} />}
    </>
  );
}
