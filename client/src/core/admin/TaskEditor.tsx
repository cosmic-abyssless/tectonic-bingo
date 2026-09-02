import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TileTask } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";

const FLAG_FIELDS: { key: keyof TileTask; label: string; hint: string }[] = [
  { key: "submitRequiresPrevious", label: "Requires previous task", hint: "Can't submit until the previous task is completed" },
  { key: "pointsRequirePrevious", label: "Withhold points until previous", hint: "Can complete early, but points stay 0 until the previous task completes" },
  { key: "requiresNoDuplicates", label: "No duplicate items", hint: "Same item can't be claimed twice" },
  { key: "allowsPreviouslyAcquired", label: "Folds previous task's claims", hint: "Approved claims from the previous task count toward this one too" },
  { key: "allowsPreLoad", label: "Allows pre-load screenshot", hint: "Player may submit an empty-state screenshot beforehand" },
  { key: "requiresCompleteSet", label: "Requires a complete set", hint: "Needs every item in one options group, not just one per group" },
];

export function TaskEditor({ slug, task, onDeleted }: { slug: string; task: TileTask; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemGroup, setNewItemGroup] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });

  async function patch(fields: Partial<TileTask>) {
    await adminApi.updateTask(slug, task.id, fields);
    invalidate();
  }
  async function deleteTask() {
    await adminApi.deleteTask(slug, task.id);
    invalidate();
    onDeleted();
  }
  async function addItem() {
    if (!newItemName.trim()) return;
    await adminApi.createTaskItem(slug, task.id, { itemName: newItemName.trim(), optionsGroup: newItemGroup.trim() || null, sortOrder: task.items.length });
    setNewItemName("");
    invalidate();
  }
  async function deleteItem(id: string) {
    await adminApi.deleteTaskItem(slug, id);
    invalidate();
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
                onClick={() => patch({ scoringMode: "automatic" })}
                className={`px-3 py-1 text-xs font-medium cursor-pointer ${!isManual ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                Automatic
              </button>
              <button
                onClick={() => patch({ scoringMode: "manual" })}
                className={`px-3 py-1 text-xs font-medium cursor-pointer border-l border-slate-600 ${isManual ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                Manual (mod judges)
              </button>
            </div>
          </div>

          {!isManual && (
            <>
              <div>
                <label htmlFor={`task-${task.id}-min-submissions`} className="block text-xs text-slate-400 mb-1">Min. approved submissions to complete</label>
                <input id={`task-${task.id}-min-submissions`} type="number" min={1} defaultValue={task.minSubmissions} onBlur={(e) => patch({ minSubmissions: Math.max(1, Number(e.target.value) || 1) })} className="w-24 bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {FLAG_FIELDS.map(({ key, label, hint }) => (
                  <label key={key} title={hint} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={!!task[key]} onChange={(e) => patch({ [key]: e.target.checked } as Partial<TileTask>)} className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer" />
                    {label}
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Items ({task.items.length})</label>
                <ul className="space-y-1 mb-2">
                  {task.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between bg-slate-800 rounded px-2 py-1 text-xs">
                      <span className="text-slate-200">
                        {item.itemName}
                        {item.optionsGroup && <span className="text-slate-500"> (group: {item.optionsGroup})</span>}
                      </span>
                      <button onClick={() => deleteItem(item.id)} className="text-slate-500 hover:text-red-400 cursor-pointer">
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Item name"
                    className="flex-1 bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                  />
                  <input
                    value={newItemGroup}
                    onChange={(e) => setNewItemGroup(e.target.value)}
                    placeholder="Options group (optional)"
                    className="w-40 bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                  />
                  <button onClick={addItem} className="text-xs bg-slate-700 hover:bg-slate-600 text-white rounded px-2.5 py-1 cursor-pointer">
                    Add
                  </button>
                </div>
              </div>
            </>
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
