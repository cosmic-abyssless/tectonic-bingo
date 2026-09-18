import type { RequirementNodeModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";

function Check() {
  return <CheckIcon size={12} className="shrink-0 text-ok" aria-label="complete" />;
}

function rowClass(dim: boolean, submitted: boolean) {
  return `flex items-baseline gap-2 text-sm ${dim ? "text-on-surface-subtle line-through" : submitted ? "text-on-surface-muted" : "text-on-surface"}`;
}

// A leaf (ITEM or SUM) row — the model already carries dim/submitted/
// complete/progress precomputed (see headless/boardModel.ts's
// buildRequirementTree), so this only renders them.
function LeafOrSumRow({ node }: { node: RequirementNodeModel }) {
  return (
    <li className={rowClass(node.dim, node.submitted)}>
      {node.items.length <= 1 && <span className="text-on-surface-subtle">·</span>}
      {node.progress && (
        <span className={`num text-xs font-medium ${node.complete ? "text-ok" : "text-warn"}`}>
          {node.progress.current}/{node.progress.target}
        </span>
      )}
      {node.items.length > 1 ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {node.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        node.label
      )}
      {node.complete && <Check />}
    </li>
  );
}

export function RequirementTree({ node, root }: { node: RequirementNodeModel; root?: boolean }) {
  if (node.isLeaf) {
    return (
      <ul className="space-y-1">
        <LeafOrSumRow node={node} />
      </ul>
    );
  }
  return (
    <div className={root ? "" : "ml-2 border-l border-outline pl-3"}>
      {node.showHeading && (
        <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wide ${node.complete ? "text-ok" : "text-on-surface-subtle"}`}>
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
