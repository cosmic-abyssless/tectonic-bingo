import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RequirementNode, RequirementNodeInput, TileTask } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { adminQueryKeys, useItemGroups } from "../../api/adminQueries";
import { RequirementTreeEditor } from "./RequirementTreeEditor";

const FLAG_FIELDS: { key: "submitRequiresPrevious" | "pointsRequirePrevious" | "allowsPreLoad"; label: string; hint: string }[] = [
  { key: "submitRequiresPrevious", label: "Requires previous task", hint: "Can't submit until the previous task is completed" },
  { key: "pointsRequirePrevious", label: "Withhold points until previous", hint: "Can complete early, but points stay 0 until the previous task completes" },
  { key: "allowsPreLoad", label: "Allows pre-load screenshot", hint: "Player may submit an empty-state screenshot beforehand" },
];

function toInput(node: RequirementNode): RequirementNodeInput {
  return {
    kind: node.kind,
    minCount: node.minCount ?? undefined,
    quantity: node.quantity ?? undefined,
    distinctItems: node.distinctItems,
    itemGroupId: node.itemGroupId ?? undefined,
    itemNames: node.itemNames,
    children: node.children.map(toInput),
  };
}

export function TaskEditor({ slug, task, onDeleted }: { slug: string; task: TileTask; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const itemGroups = useItemGroups().data?.itemGroups ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });

  async function patch(fields: adminApi.TaskPayload) {
    await adminApi.updateTask(slug, task.id, fields);
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

  // A bare ITEM root (from the API/seed) is shown wrapped in an ALL so the tree always has a group at the top.
  const root = task.requirement;
  const rootInput: RequirementNodeInput = root.kind === "ITEM" ? { kind: "ALL", children: [toInput(root)] } : toInput(root);

  const isManual = task.scoringMode === "manual";

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
              <input id={`task-${task.id}-label`} defaultValue={task.label} onBlur={(e) => patch({ label: e.target.value })} className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label htmlFor={`task-${task.id}-points`} className="block text-xs text-slate-400 mb-1">Points</label>
              <input id={`task-${task.id}-points`} type="number" defaultValue={task.points} onBlur={(e) => patch({ points: Number(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div>
            <label htmlFor={`task-${task.id}-description`} className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea id={`task-${task.id}-description`} defaultValue={task.description} onBlur={(e) => patch({ description: e.target.value })} rows={2} className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Scoring mode</label>
            <div className="flex rounded-md overflow-hidden border border-slate-600 w-fit">
              <button
                onClick={() => patch({ scoringMode: "automatic", requirement: { kind: "ALL", children: [] } })}
                className={`px-3 py-1 text-xs font-medium cursor-pointer ${!isManual ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                Automatic
              </button>
              <button
                onClick={() => patch({ scoringMode: "manual", requirement: { kind: "MANUAL" } })}
                className={`px-3 py-1 text-xs font-medium cursor-pointer border-l border-slate-600 ${isManual ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                Manual (mod judges)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {FLAG_FIELDS.map(({ key, label, hint }) => (
              <label key={key} title={hint} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" checked={task[key]} onChange={(e) => patch({ [key]: e.target.checked })} className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer" />
                {label}
              </label>
            ))}
          </div>

          {!isManual && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Requirement</label>
              <RequirementTreeEditor root={rootInput} itemGroups={itemGroups} onChange={(requirement) => patch({ requirement })} onSaveAsGroup={saveAsGroup} />
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
