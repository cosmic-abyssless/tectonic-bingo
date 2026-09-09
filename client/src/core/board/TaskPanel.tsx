import { TooltipTrigger, Tooltip, Focusable } from "react-aria-components";
import type { RequirementNodeModel, TaskModel } from "../../headless/types";
import { leafLabel } from "./labels";
import { Badge } from "../ui/Card";
import { CheckIcon, LockIcon } from "../ui/icons";

// Re-exported for existing callers (e.g. SubmissionModal.tsx) that still
// import it from here — the real definition lives in ./labels.
export { leafLabel };

function Check() {
  return <CheckIcon size={12} className="shrink-0 text-ok" aria-label="complete" />;
}

function rowClass(dim: boolean, submitted: boolean) {
  return `flex items-baseline gap-2 text-sm ${dim ? "text-fg-subtle line-through" : submitted ? "text-fg-muted" : "text-fg"}`;
}

// A leaf (ITEM or SUM) row — the model already carries dim/submitted/
// complete/progress precomputed (see headless/boardModel.ts's
// buildRequirementTree), so this only renders them.
function LeafOrSumRow({ node }: { node: RequirementNodeModel }) {
  return (
    <li className={rowClass(node.dim, node.submitted)}>
      <span className="text-fg-subtle">·</span>
      {node.progress && (
        <span className={`num text-xs font-medium ${node.complete ? "text-ok" : "text-warn"}`}>
          {node.progress.current}/{node.progress.target}
        </span>
      )}
      {node.label}
      {node.complete && <Check />}
    </li>
  );
}

function RequirementTree({ node, root }: { node: RequirementNodeModel; root?: boolean }) {
  if (node.isLeaf) {
    return (
      <ul className="space-y-1">
        <LeafOrSumRow node={node} />
      </ul>
    );
  }
  return (
    <div className={root ? "" : "ml-2 border-l border-line pl-3"}>
      {node.showHeading && (
        <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wide ${node.complete ? "text-ok" : "text-fg-subtle"}`}>
          {node.label}
          {node.complete && <Check />}
        </span>
      )}
      <ul className="mt-1 space-y-1">
        {node.children.map((child) =>
          child.isLeaf ? (
            <LeafOrSumRow key={child.id} node={child} />
          ) : (
            <li key={child.id}>
              <RequirementTree node={child} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

// A task is just a node that's a direct child of its tile's node.
export function TaskPanel({ task }: { task: TaskModel }) {
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
