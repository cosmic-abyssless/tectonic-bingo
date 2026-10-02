import { Fragment } from "react";
import type { RequirementNodeModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { ItemIcon } from "../../../core/ui/ItemIcon";
import { WikiItemLink } from "../../../core/ui/WikiItemLink";
import { itemNameOf } from "../../../headless/requirementItems";
import { countsAsLabel } from "../../../core/board/labels";

function Check() {
  return <CheckIcon size={12} className="shrink-0 text-ok" aria-label="complete" />;
}

// A SUM (`noStrike`) never strikes through: its items can be handed in again, so
// what's been received shows as a count instead.
function rowClass(dim: boolean, submitted: boolean, noStrike: boolean) {
  return `flex items-baseline gap-2 text-sm ${dim ? `text-on-surface-subtle ${noStrike ? "" : "line-through"}` : submitted ? "text-on-surface-muted" : "text-on-surface"}`;
}

// The line down a nested condition's options, with a branch to each, as the board editor draws it. Drawn per row (and
// through the gaps between rows, which are each row's top padding), so it stops at the last option's branch. The branch
// meets a row's first line: its padding, plus half a line.
function branchClass(last: boolean, tick = true) {
  const line = "relative pl-4 pt-1 before:absolute before:left-0 before:top-0 before:border-l before:border-outline-strong";
  return `${line} ${last ? "before:h-3.5" : "before:bottom-0"} ${tick ? "after:absolute after:left-0 after:top-3.5 after:w-3 after:border-t after:border-outline-strong" : ""}`;
}

// A leaf row: an ITEM, or a SUM over a single item — the model already carries
// dim/submitted/complete/progress precomputed (see headless/boardModel.ts's
// buildRequirementTree), so this only renders them. `bare`: a piece of an "any one of" group of Items, which has no
// bullet of its own (the group's row has it). `hideLock`: its group's row already says where the group was used, so it
// only shows that it's unavailable. `className`: its branch, in a nested condition.
function LeafRow({ node, bare, hideLock, className }: { node: RequirementNodeModel; bare?: boolean; hideLock?: boolean; className?: string }) {
  const iconUrl = node.iconUrl ?? (node.items.length === 1 ? node.items[0]!.iconUrl : null);
  return (
    <li className={`${rowClass(node.dim, node.submitted, !!node.progress)} ${className ?? ""}`}>
      {!bare && <span className="text-on-surface-subtle">·</span>}
      {node.progress && <Progress node={node} />}
      <span className={node.lockedBy ? "text-on-surface-subtle" : undefined}>
        <ItemIcon url={iconUrl} className={iconClass(node.dim)} />
        {itemNameOf(node) ? <WikiItemLink name={itemNameOf(node)!} /> : node.label}
        {node.kind === "SUM" && <CountsAs countsAs={node.items[0]?.countsAs} />}
        {node.quantity && <span className="num ml-1.5 text-xs font-medium">×{node.quantity}</span>}
        {node.lockedBy && !hideLock && <span className="ml-1.5 text-xs text-warn">{node.lockedBy}</span>}
      </span>
      {node.complete && !bare && <Check />}
    </li>
  );
}

// "· counts as 25" after an item that adds more than one to its SUM's total (CONTEXT.md "Counts as"); nothing at 1.
function CountsAs({ countsAs }: { countsAs: number | undefined }) {
  const label = countsAsLabel(countsAs);
  return label ? <span className="ml-1.5 text-xs text-on-surface-subtle">· {label}</span> : null;
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
      <CountsAs countsAs={item.countsAs} />
      <span className={`num ml-1.5 text-xs font-medium ${item.count > 0 ? "text-ok" : "text-on-surface-subtle"}`}>×{item.count}</span>
      {item.lockedBy && <span className="ml-1.5 text-xs text-warn">{item.lockedBy}</span>}
    </li>
  ));
}

// Between an ANY's direct options, in the heading style.
function OrDivider({ dim, className }: { dim: boolean; className?: string }) {
  return (
    <li role="separator" className={`flex items-center gap-2 text-[11px] uppercase tracking-wide ${dim ? "text-on-surface-subtle opacity-60" : "text-on-surface-muted"} ${className ?? ""}`}>
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
  // The root's options are a plain list; a nested condition's hang off its line, a branch to each (see branchClass).
  const nested = !root && node.kind !== "SUM";
  const last = node.children.length - 1;
  return (
    <div>
      {node.showHeading &&
        (node.itemGroup ? (
          // One option of its parent: a row with its own bullet, and a tick once any piece is in.
          <div className={rowClass(node.dim, false, true)}>
            <span className="text-on-surface-subtle">·</span>
            <span className={`text-[11px] uppercase tracking-wide ${node.lockedBy && !node.complete ? "text-on-surface-subtle" : ""}`}>{node.label}</span>
            {node.lockedBy && <span className="text-xs text-warn">{node.lockedBy}</span>}
            {node.complete && <Check />}
          </div>
        ) : (
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
        ))}
      <ul className={nested ? "ml-0.5" : "mt-1 space-y-1"}>
        {node.kind === "SUM" ? (
          <SumItemRows node={node} />
        ) : (
          node.children.map((child, i) => (
            <Fragment key={child.id}>
              {i > 0 && node.divider && <OrDivider dim={node.divider.dim} className={nested ? branchClass(false, false) : undefined} />}
              {child.isLeaf ? (
                <LeafRow node={child} bare={node.itemGroup} hideLock={node.itemGroup && !!node.lockedBy} className={nested ? branchClass(i === last) : undefined} />
              ) : (
                <li className={nested ? branchClass(i === last) : undefined}>
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
