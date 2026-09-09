import { TooltipTrigger, Tooltip, Focusable } from "react-aria-components";
import type { TaskModel } from "../../../headless/types";
import { Badge } from "../../../core/ui/Card";
import { CheckIcon, LockIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";

function Check() {
  return <CheckIcon size={12} className="shrink-0 text-ok" aria-label="complete" />;
}

// A task is just a node that's a direct child of its tile's node.
export function TaskPanel({ task }: { task: TaskModel }) {
  const RequirementTree = useSlot("RequirementTree");

  return (
    <div className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-fg">{task.label}</span>
          {task.complete && <Check />}
          {task.isManual && <Badge tone="info">Judged by mods</Badge>}
          {task.locked && (
            <TooltipTrigger delay={200}>
              <Focusable>
                <span role="img" aria-label="Locked" tabIndex={0} className="inline-flex text-fg-muted">
                  <LockIcon size={14} />
                </span>
              </Focusable>
              <Tooltip offset={6} className="overlay-panel z-30 max-w-56 rounded-md border border-line bg-surface-raised px-3 py-2 text-xs leading-relaxed text-fg shadow-pop">
                {task.lockedReason ?? "This task depends on a previous task."}
              </Tooltip>
            </TooltipTrigger>
          )}
        </div>
        <span className="num shrink-0 text-sm font-medium text-fg-muted">{task.points} pts</span>
      </div>

      <p className="mb-3 text-sm leading-relaxed text-fg-muted">{task.description}</p>

      {!task.isManual && task.tree && <RequirementTree node={task.tree} root />}

      {!task.isManual && task.allowsPreLoad && (
        <div className="mt-3">
          <Badge>Pre-load allowed</Badge>
        </div>
      )}

      {task.notes && <p className="mt-3 border-l-2 border-warn/60 pl-2 text-xs text-warn">{task.notes}</p>}
    </div>
  );
}
