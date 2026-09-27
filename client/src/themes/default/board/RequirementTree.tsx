import { Fragment } from "react";
import type { RequirementNodeModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { ItemIcon } from "../../../core/ui/ItemIcon";
import { WikiItemLink } from "../../../core/ui/WikiItemLink";
import { itemNameOf } from "../../../headless/requirementItems";

function Check() {
  return <CheckIcon size={12} className="shrink-0 text-ok" aria-label="complete" />;
}

// A SUM (`noStrike`) never strikes through: its items can be handed in again, so
// what's been received shows as a count instead.
function rowClass(dim: boolean, submitted: boolean, noStrike: boolean) {
  return `flex items-baseline gap-2 text-sm ${dim ? `text-on-surface-subtle ${noStrike ? "" : "line-through"}` : submitted ? "text-on-surface-muted" : "text-on-surface"}`;
}

// A leaf row: an ITEM, or a SUM over a single item — the model already carries
// dim/submitted/complete/progress precomputed (see headless/boardModel.ts's
// buildRequirementTree), so this only renders them.
function LeafRow({ node }: { node: RequirementNodeModel }) {
  const iconUrl = node.iconUrl ?? (node.items.length === 1 ? node.items[0]!.iconUrl : null);
  return (
    <li className={rowClass(node.dim, node.submitted, !!node.progress)}>
      <span className="text-on-surface-subtle">·</span>
      {node.progress && <Progress node={node} />}
      <span className={node.lockedBy ? "text-on-surface-subtle" : undefined}>
        <ItemIcon url={iconUrl} className={iconClass(node.dim)} />
        {itemNameOf(node) ? <WikiItemLink name={itemNameOf(node)!} /> : node.label}
        {node.quantity && <span className="num ml-1.5 text-xs font-medium">×{node.quantity}</span>}
        {node.lockedBy && <span className="ml-1.5 text-xs text-warn">{node.lockedBy}</span>}
      </span>
      {node.complete && <Check />}
    </li>
  );
}

function iconClass(dim: boolean) {
  return `inline-block -my-1 mr-1.5 align-middle ${dim ? "opacity-60" : ""}`;
}

function Progress({ node }: { node: RequirementNodeModel }) {
  return (
    <span className={`num text-xs font-medium normal-case tracking-normal ${node.complete ? "text-ok" : "text-warn"}`}>
      {node.progress!.current}/{node.progress!.target}
    </span>
  );
}

// A SUM over several items: one row per item with how many have been received,
// and no tick per item, since no single item completes it on its own.
function SumItemRows({ node }: { node: RequirementNodeModel }) {
  return node.items.map((item) => (
    <li key={item.name} className={`text-sm ${node.dim || item.lockedBy ? "text-on-surface-subtle" : "text-on-surface"}`}>
      <ItemIcon url={item.iconUrl} className={iconClass(node.dim || !!item.lockedBy)} />
      <WikiItemLink name={item.name} />
      <span className={`num ml-1.5 text-xs font-medium ${item.count > 0 ? "text-ok" : "text-on-surface-subtle"}`}>×{item.count}</span>
      {item.lockedBy && <span className="ml-1.5 text-xs text-warn">{item.lockedBy}</span>}
    </li>
  ));
}

// Between an ANY's direct options, in the heading style.
function OrDivider({ dim }: { dim: boolean }) {
  return (
    <li role="separator" className={`flex items-center gap-2 text-[11px] uppercase tracking-wide ${dim ? "text-on-surface-subtle opacity-60" : "text-on-surface-muted"}`}>
      <span className="h-px w-4 bg-outline-strong" />
      or
      <span className="h-px w-4 bg-outline-strong" />
    </li>
  );
}

export function RequirementTree({ node, root }: { node: RequirementNodeModel; root?: boolean }) {
  if (node.isLeaf) {
    return (
      <ul className="space-y-1">
        <LeafRow node={node} />
      </ul>
    );
  }
  return (
    <div className={root ? "" : "ml-2 border-l border-outline pl-3"}>
      {node.showHeading && (
        <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wide ${node.complete ? "text-ok" : "text-on-surface-subtle"}`}>
          {node.label}
          {node.progress && (
            <>
              <span aria-hidden>·</span>
              <Progress node={node} />
            </>
          )}
          {node.complete && <Check />}
        </span>
      )}
      <ul className="mt-1 space-y-1">
        {node.kind === "SUM" ? (
          <SumItemRows node={node} />
        ) : (
          node.children.map((child, i) => (
            <Fragment key={child.id}>
              {i > 0 && node.divider && <OrDivider dim={node.divider.dim} />}
              {child.isLeaf ? (
                <LeafRow node={child} />
              ) : (
                <li>
                  <RequirementTree node={child} />
                </li>
              )}
            </Fragment>
          ))
        )}
      </ul>
    </div>
  );
}
