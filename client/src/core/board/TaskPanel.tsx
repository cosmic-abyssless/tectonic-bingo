import type { GraphNode, NodeStatus } from "@bingo/shared";
import { TooltipTrigger, Tooltip, Focusable } from "react-aria-components";
import { itemLeafValue, leafComplete, type LeafClaimMaps } from "./taskClaims";
import { conditionHeading } from "./requirementTree";
import { Badge } from "../ui/Card";
import { CheckIcon, LockIcon } from "../ui/icons";

function Check() {
  return <CheckIcon size={12} className="shrink-0 text-ok" aria-label="complete" />;
}

/** For an ITEM leaf, just its name. For a SUM, its children's names joined — the SUM is what carries the quantity/target now. */
export function leafLabel(node: GraphNode): string {
  if (node.kind === "SUM") return node.children.map((c) => c.itemName).filter((n): n is string => !!n).join(" / ") || "(no items)";
  return node.itemName ?? "(no item)";
}

function rowClass(dim: boolean, submitted: boolean) {
  return `flex items-baseline gap-2 text-sm ${dim ? "text-fg-subtle line-through" : submitted ? "text-fg-muted" : "text-fg"}`;
}

// A single-name ITEM leaf — boolean, no quantity of its own. `notNeeded`
// means an enclosing ANY/COUNT is already satisfied by a sibling — this leaf
// itself was never claimed (no checkmark), but no longer needs to be.
function LeafRow({ node, maps, notNeeded }: { node: GraphNode; maps: LeafClaimMaps; notNeeded?: boolean }) {
  const complete = leafComplete(node.id, maps);
  const submitted = maps.submittedNodeIds.has(node.id);
  return (
    <li className={rowClass(complete || !!notNeeded, submitted)}>
      <span className="text-fg-subtle">·</span>
      {leafLabel(node)}
      {complete && <Check />}
    </li>
  );
}

// A SUM over one or more ITEM children — the quantity target lives here now,
// summed across whichever of its children's names were actually claimed.
function SumRow({ node, maps, notNeeded }: { node: GraphNode; maps: LeafClaimMaps; notNeeded?: boolean }) {
  const target = node.quantity ?? 1;
  const progress = node.children.reduce((sum, child) => sum + itemLeafValue(child.id, maps), 0);
  const complete = progress >= target;
  const submitted = node.children.some((child) => maps.submittedNodeIds.has(child.id));
  return (
    <li className={rowClass(complete || !!notNeeded, submitted)}>
      <span className="text-fg-subtle">·</span>
      <span className={`num text-xs font-medium ${complete ? "text-ok" : "text-warn"}`}>
        {progress}/{target}
      </span>
      {leafLabel(node)}
      {complete && <Check />}
    </li>
  );
}

// `statusByNodeId` is the server-confirmed completion set (teamNodeState,
// rescored after an approval) — the same source TileModal already uses for a
// task's own checkmark. Threading it through here lets an ALL/ANY/COUNT node
// show its *own* completion (not just each leaf's), and — via
// `ancestorSatisfied` carried down through the recursion — dim every leaf
// under an already-satisfied ANY/COUNT, since submitting them wouldn't
// progress the tile any further. A still-*pending* sibling claim doesn't
// trigger this (no teamNodeState row yet — a mod could still reject it).
function RequirementTree({
  node,
  maps,
  statusByNodeId,
  ancestorSatisfied = false,
  root,
}: {
  node: GraphNode;
  maps: LeafClaimMaps;
  statusByNodeId?: Map<string, NodeStatus>;
  ancestorSatisfied?: boolean;
  root?: boolean;
}) {
  if (node.kind === "MANUAL") return null;
  if (node.kind === "ITEM") {
    return (
      <ul className="space-y-1">
        <LeafRow node={node} maps={maps} notNeeded={ancestorSatisfied} />
      </ul>
    );
  }
  if (node.kind === "SUM") {
    return (
      <ul className="space-y-1">
        <SumRow node={node} maps={maps} notNeeded={ancestorSatisfied} />
      </ul>
    );
  }
  const nodeComplete = statusByNodeId?.get(node.id) === "completed";
  const childAncestorSatisfied = ancestorSatisfied || nodeComplete;
  return (
    <div className={root ? "" : "ml-2 border-l border-line pl-3"}>
      <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wide ${nodeComplete ? "text-ok" : "text-fg-subtle"}`}>
        {conditionHeading(node)}
        {nodeComplete && <Check />}
      </span>
      <ul className="mt-1 space-y-1">
        {node.children.map((child) =>
          child.kind === "ITEM" ? (
            <LeafRow key={child.id} node={child} maps={maps} notNeeded={childAncestorSatisfied} />
          ) : child.kind === "SUM" ? (
            <SumRow key={child.id} node={child} maps={maps} notNeeded={childAncestorSatisfied} />
          ) : (
            <li key={child.id}>
              <RequirementTree node={child} maps={maps} statusByNodeId={statusByNodeId} ancestorSatisfied={childAncestorSatisfied} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

// A task is just a node that's a direct child of its tile's node.
export function TaskPanel({
  task,
  claimMaps,
  statusByNodeId,
  locked,
  lockedReason,
  complete,
}: {
  task: GraphNode;
  claimMaps: LeafClaimMaps;
  statusByNodeId?: Map<string, NodeStatus>;
  locked?: boolean;
  lockedReason?: string;
  complete?: boolean;
}) {
  const isManual = task.kind === "MANUAL";

  return (
    <div className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-fg">{task.label}</span>
          {complete && <Check />}
          {isManual && <Badge tone="info">Judged by mods</Badge>}
          {locked && (
            <TooltipTrigger delay={200}>
              <Focusable>
                <span role="img" aria-label="Locked" tabIndex={0} className="inline-flex text-fg-muted">
                  <LockIcon size={14} />
                </span>
              </Focusable>
              <Tooltip offset={6} className="overlay-panel z-30 max-w-56 rounded-md border border-line bg-surface-raised px-3 py-2 text-xs leading-relaxed text-fg shadow-pop">
                {lockedReason ?? "This task depends on a previous task."}
              </Tooltip>
            </TooltipTrigger>
          )}
        </div>
        <span className="num shrink-0 text-sm font-medium text-fg-muted">{task.points} pts</span>
      </div>

      <p className="mb-3 text-sm leading-relaxed text-fg-muted">{task.description}</p>

      {!isManual && <RequirementTree node={task} maps={claimMaps} statusByNodeId={statusByNodeId} root />}

      {!isManual && task.allowsPreLoad && (
        <div className="mt-3">
          <Badge>Pre-load allowed</Badge>
        </div>
      )}

      {task.notes && <p className="mt-3 border-l-2 border-warn/60 pl-2 text-xs text-warn">{task.notes}</p>}
    </div>
  );
}
