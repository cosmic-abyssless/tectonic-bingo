import type { GraphNode, NodeStatus } from "@bingo/shared";
import { itemLeafValue, leafComplete, type LeafClaimMaps } from "./taskClaims";

export function CheckIcon() {
  return (
    <svg className="w-3 h-3 text-green-400 shrink-0 no-underline" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** For an ITEM leaf, just its name. For a SUM, its children's names joined — the SUM is what carries the quantity/target now. */
export function leafLabel(node: GraphNode): string {
  if (node.kind === "SUM") return node.children.map((c) => c.itemName).filter((n): n is string => !!n).join(" / ") || "(no items)";
  return node.itemName ?? "(no item)";
}

function compositeLabel(node: GraphNode): string {
  switch (node.kind) {
    case "ALL":
      return "All of:";
    case "ANY":
      return "Any one of:";
    case "COUNT":
      return `At least ${node.minCount ?? 1} of:`;
    default:
      return "";
  }
}

// A single-name ITEM leaf — boolean, no quantity of its own. `notNeeded`
// means an enclosing ANY/COUNT is already satisfied by a sibling — this leaf
// itself was never claimed (no checkmark), but no longer needs to be.
function LeafRow({ node, maps, notNeeded }: { node: GraphNode; maps: LeafClaimMaps; notNeeded?: boolean }) {
  const complete = leafComplete(node.id, maps);
  const submitted = maps.submittedNodeIds.has(node.id);
  const dim = complete || notNeeded;
  return (
    <li className={`flex items-baseline gap-2 text-sm ${dim ? "text-slate-500 line-through" : submitted ? "text-slate-400" : "text-slate-200"}`}>
      <span className="text-indigo-400 text-xs">▸</span>
      {leafLabel(node)}
      {complete && <CheckIcon />}
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
  const dim = complete || notNeeded;
  return (
    <li className={`flex items-baseline gap-2 text-sm ${dim ? "text-slate-500 line-through" : submitted ? "text-slate-400" : "text-slate-200"}`}>
      <span className="text-indigo-400 text-xs">▸</span>
      <span className={`font-semibold text-xs tabular-nums ${complete ? "text-green-400" : "text-yellow-400"}`}>
        {progress}/{target}
      </span>
      {leafLabel(node)}
      {complete && <CheckIcon />}
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
  // A root ALL with only leaves is the common case; skip the redundant heading.
  const showHeading = !(root && node.kind === "ALL");
  return (
    <div className={root ? "" : "ml-3 border-l border-slate-700 pl-3"}>
      {showHeading && (
        <span className={`text-xs uppercase tracking-wide inline-flex items-center gap-1 ${nodeComplete ? "text-green-500" : "text-slate-500"}`}>
          {compositeLabel(node)}
          {nodeComplete && <CheckIcon />}
        </span>
      )}
      <ul className="space-y-1 mt-1">
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-bold text-sm">{task.label}</span>
          {complete && <CheckIcon />}
          {isManual && (
            <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-600 rounded-full px-2 py-0.5">
              Judged by mods
            </span>
          )}
          {locked && (
            <div className="relative group/lock">
              <svg className="w-3.5 h-3.5 text-slate-400 cursor-default" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 hidden group-hover/lock:block bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 shadow-xl z-30 leading-relaxed">
                {lockedReason ?? "This task depends on a previous task."}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
              </div>
            </div>
          )}
        </div>
        <span className="text-yellow-400 font-semibold text-sm">{task.points} pts</span>
      </div>

      <p className="text-slate-300 text-sm leading-relaxed mb-3">{task.description}</p>

      {!isManual && <RequirementTree node={task} maps={claimMaps} statusByNodeId={statusByNodeId} root />}

      {!isManual && task.allowsPreLoad && (
        <div className="flex gap-2 flex-wrap mt-3">
          <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
            Pre-load allowed
          </span>
        </div>
      )}

      {task.notes && <p className="mt-3 text-xs text-amber-400 border-l-2 border-amber-500 pl-2">{task.notes}</p>}
    </div>
  );
}
