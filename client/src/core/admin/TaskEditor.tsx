import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GraphNode, GraphNodeInput } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { adminQueryKeys, useItemGroups } from "../../api/adminQueries";
import { toGraphNodeInput as toInput } from "../board/requirementTree";
import { RequirementTreeEditor, type ExistingLeaf, type ExistingCondition } from "./RequirementTreeEditor";

// A task is a node that's a direct child of its tile's node. `previousTaskId`
// is the sibling immediately before this one (per the tile's current child
// order) — "requires/withholds until previous" resolves to that specific
// node id, per docs/node-graph-model.md §6.
export function TaskEditor({
  slug,
  task,
  previousTaskId,
  existingLeaves,
  existingConditions,
  sharedNodeIds,
  onDeleted,
}: {
  slug: string;
  task: GraphNode;
  previousTaskId?: string;
  existingLeaves?: ExistingLeaf[];
  existingConditions?: ExistingCondition[];
  sharedNodeIds: Set<string>;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const itemGroups = useItemGroups().data?.itemGroups ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });

  // The server replaces the whole node (fields + subtree) on every PATCH —
  // always send the full current input, overridden with just the changed
  // field(s), so editing one field can't wipe another (e.g. a label edit
  // wiping the requirement tree, or a tree edit resetting points to 0).
  async function patch(fields: Partial<GraphNodeInput>) {
    await adminApi.updateTask(slug, task.id, { ...toInput(task), ...fields });
    invalidate();
  }
  async function deleteTask() {
    await adminApi.deleteTask(slug, task.id);
    invalidate();
    onDeleted();
  }
  async function saveAsGroup(itemNames: string[]) {
    const name = prompt("Name for the new item group:", "");
    if (!name?.trim()) return null;
    const { itemGroup } = await adminApi.createItemGroup({ name: name.trim(), itemNames });
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.itemGroups });
    return itemGroup;
  }

  const isManual = task.kind === "MANUAL";
  const requiresPrevious = task.submitGateNodeId != null;
  const withholdsPoints = task.pointsGateNodeId != null;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      <button
        type="button"
        aria-label={`${expanded ? "Collapse" : "Expand"} task: ${task.label}`}
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer text-left"
      >
        <span className="text-sm font-semibold text-white">
          {task.label} <span className="text-slate-500 font-normal">— {task.points} pts{isManual ? " · manual" : ""}</span>
        </span>
        <span className="text-slate-500 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-700 px-3 py-3 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`task-${task.id}-label`} className="block text-xs text-slate-400 mb-1">Label</label>
              <input id={`task-${task.id}-label`} defaultValue={task.label ?? ""} onBlur={(e) => patch({ label: e.target.value })} className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label htmlFor={`task-${task.id}-points`} className="block text-xs text-slate-400 mb-1">Points</label>
              <input id={`task-${task.id}-points`} type="number" defaultValue={task.points} onBlur={(e) => patch({ points: Number(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div>
            <label htmlFor={`task-${task.id}-description`} className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea id={`task-${task.id}-description`} defaultValue={task.description ?? ""} onBlur={(e) => patch({ description: e.target.value })} rows={2} className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Scoring mode</label>
            <div className="flex rounded-md overflow-hidden border border-slate-600 w-fit">
              <button
                onClick={() => patch({ kind: "ALL", children: [] })}
                className={`px-3 py-1 text-xs font-medium cursor-pointer ${!isManual ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                Automatic
              </button>
              <button
                onClick={() => patch({ kind: "MANUAL", children: [] })}
                className={`px-3 py-1 text-xs font-medium cursor-pointer border-l border-slate-600 ${isManual ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                Manual (mod judges)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <label title="Can't submit until the previous task is completed" className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresPrevious}
                disabled={!previousTaskId}
                onChange={(e) => patch({ submitGateNodeId: e.target.checked ? previousTaskId : null })}
                className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer disabled:opacity-40"
              />
              Requires previous task
            </label>
            <label title="Can complete early, but points stay 0 until the previous task completes" className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={withholdsPoints}
                disabled={!previousTaskId}
                onChange={(e) => patch({ pointsGateNodeId: e.target.checked ? previousTaskId : null })}
                className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer disabled:opacity-40"
              />
              Withhold points until previous
            </label>
            <label title="Player may submit an empty-state screenshot beforehand" className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={task.allowsPreLoad} onChange={(e) => patch({ allowsPreLoad: e.target.checked })} className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer" />
              Allows pre-load screenshot
            </label>
          </div>

          {!isManual && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Requirement</label>
              <RequirementTreeEditor
                root={toInput(task)}
                itemGroups={itemGroups}
                onChange={(updated) => patch(updated)}
                onSaveAsGroup={saveAsGroup}
                existingLeaves={existingLeaves}
                existingConditions={existingConditions}
                sharedNodeIds={sharedNodeIds}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes (shown to players)</label>
            <input defaultValue={task.notes ?? ""} onBlur={(e) => patch({ notes: e.target.value || null })} className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500" />
          </div>

          <button onClick={deleteTask} className="text-xs text-red-400 hover:text-red-300 cursor-pointer">
            Delete task
          </button>
        </div>
      )}
    </div>
  );
}
