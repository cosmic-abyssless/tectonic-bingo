import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RequirementKind, RequirementNode, RequirementNodeInput, TileTask } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { useItemGroups } from "../../api/adminQueries";

const FLAG_FIELDS: { key: "submitRequiresPrevious" | "pointsRequirePrevious" | "allowsPreLoad"; label: string; hint: string }[] = [
  { key: "submitRequiresPrevious", label: "Requires previous task", hint: "Can't submit until the previous task is completed" },
  { key: "pointsRequirePrevious", label: "Withhold points until previous", hint: "Can complete early, but points stay 0 until the previous task completes" },
  { key: "allowsPreLoad", label: "Allows pre-load screenshot", hint: "Player may submit an empty-state screenshot beforehand" },
];

const ROOT_KINDS: { kind: RequirementKind; label: string }[] = [
  { kind: "ALL", label: "All of" },
  { kind: "ANY", label: "Any one of" },
  { kind: "COUNT", label: "At least N of" },
];

// The flat editor only handles a root (ALL/ANY/COUNT) with ITEM leaves.
// Deeper trees are shown read-only until edited, at which point they collapse.
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

const INPUT = "bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600";

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

  const root = task.requirement;
  const leaves = root.kind === "ITEM" ? [root] : root.children;
  const rootKind: RequirementKind = root.kind === "ITEM" ? "ALL" : root.kind;
  const isNested = leaves.some((leaf) => leaf.kind !== "ITEM");

  function saveTree(kind: RequirementKind, minCount: number | undefined, children: RequirementNodeInput[]) {
    return patch({ requirement: { kind, minCount: kind === "COUNT" ? minCount ?? 1 : undefined, children } });
  }
  function saveLeaves(nextLeaves: RequirementNodeInput[]) {
    return saveTree(rootKind, root.minCount ?? undefined, nextLeaves);
  }
  function updateLeaf(index: number, changes: Partial<RequirementNodeInput>) {
    return saveLeaves(leaves.map((leaf, i) => (i === index ? { ...toInput(leaf), ...changes } : toInput(leaf))));
  }
  function addLeaf() {
    return saveLeaves([...leaves.map(toInput), { kind: "ITEM", itemNames: [], quantity: 1 }]);
  }
  function removeLeaf(index: number) {
    return saveLeaves(leaves.filter((_, i) => i !== index).map(toInput));
  }

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
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs text-slate-400">Requirement</label>
                <select
                  aria-label="Requirement kind"
                  value={rootKind}
                  onChange={(e) => saveTree(e.target.value as RequirementKind, root.minCount ?? undefined, leaves.map(toInput))}
                  className={INPUT}
                >
                  {ROOT_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>{k.label}</option>
                  ))}
                </select>
                {rootKind === "COUNT" && (
                  <input
                    aria-label="Minimum count"
                    type="number"
                    min={1}
                    defaultValue={root.minCount ?? 1}
                    onBlur={(e) => saveTree("COUNT", Math.max(1, Number(e.target.value) || 1), leaves.map(toInput))}
                    className={`w-16 ${INPUT}`}
                  />
                )}
              </div>
              {isNested && <p className="text-xs text-yellow-400 mb-1.5">This task has a nested requirement tree; editing here will flatten it.</p>}
              <ul className="space-y-1 mb-2">
                {leaves.map((leaf, i) => (
                  <li key={leaf.id} className="flex items-center gap-2 bg-slate-800 rounded px-2 py-1">
                    <input
                      aria-label="Item names"
                      defaultValue={leaf.itemNames.join(", ")}
                      placeholder="Item names, comma-separated"
                      onBlur={(e) => updateLeaf(i, { itemNames: e.target.value.split(",").map((n) => n.trim()).filter(Boolean) })}
                      className={`flex-1 ${INPUT}`}
                    />
                    <select
                      aria-label="Item group"
                      value={leaf.itemGroupId ?? ""}
                      onChange={(e) => updateLeaf(i, { itemGroupId: e.target.value || undefined })}
                      className={INPUT}
                    >
                      <option value="">No group</option>
                      {itemGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <input
                      aria-label="Quantity"
                      type="number"
                      min={1}
                      defaultValue={leaf.quantity ?? 1}
                      onBlur={(e) => updateLeaf(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className={`w-14 ${INPUT}`}
                    />
                    <label title="Count distinct item names instead of total quantity" className="flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={leaf.distinctItems} onChange={(e) => updateLeaf(i, { distinctItems: e.target.checked })} className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer" />
                      distinct
                    </label>
                    <button onClick={() => removeLeaf(i)} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <button onClick={addLeaf} className="text-xs bg-slate-700 hover:bg-slate-600 text-white rounded px-2.5 py-1 cursor-pointer">
                + Add item requirement
              </button>
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
