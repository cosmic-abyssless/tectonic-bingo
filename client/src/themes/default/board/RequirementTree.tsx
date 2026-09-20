import type { RequirementNodeModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { ItemIcon } from "../../../core/ui/ItemIcon";

function Check() {
  return <CheckIcon size={12} className="shrink-0 text-ok" aria-label="complete" />;
}

// A SUM (`noStrike`) never strikes through: its items can be handed in again, so
// what's been received shows as a count beside each item instead.
function rowClass(dim: boolean, submitted: boolean, noStrike: boolean) {
  return `flex items-baseline gap-2 text-sm ${dim ? `text-on-surface-subtle ${noStrike ? "" : "line-through"}` : submitted ? "text-on-surface-muted" : "text-on-surface"}`;
}

// A leaf (ITEM or SUM) row — the model already carries dim/submitted/
// complete/progress precomputed (see headless/boardModel.ts's
// buildRequirementTree), so this only renders them.
function LeafOrSumRow({ node }: { node: RequirementNodeModel }) {
  const iconUrl = node.iconUrl ?? (node.items.length === 1 ? node.items[0]!.iconUrl : null);
  const iconClass = `inline-block -my-1 mr-1.5 align-middle ${node.dim ? "opacity-60" : ""}`;
  return (
    <li className={rowClass(node.dim, node.submitted, !!node.progress)}>
      {node.items.length <= 1 && <span className="text-on-surface-subtle">·</span>}
      {node.progress && (
        <span className={`num text-xs font-medium ${node.complete ? "text-ok" : "text-warn"}`}>
          {node.progress.current}/{node.progress.target}
        </span>
      )}
      {node.items.length > 1 ? (
        <ul className="space-y-0.5">
          {node.items.map((item) => (
            <li key={item.name} className={item.lockedBy ? "text-on-surface-subtle" : undefined}>
              <ItemIcon url={item.iconUrl} className={iconClass} />
              {item.name}
              {item.count > 0 && <span className="num ml-1.5 text-xs font-medium text-ok">×{item.count}</span>}
              {item.lockedBy && <span className="ml-1.5 text-xs text-warn">{item.lockedBy}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <span className={node.lockedBy ? "text-on-surface-subtle" : undefined}>
          <ItemIcon url={iconUrl} className={iconClass} />
          {node.label}
          {node.lockedBy && <span className="ml-1.5 text-xs text-warn">{node.lockedBy}</span>}
        </span>
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
