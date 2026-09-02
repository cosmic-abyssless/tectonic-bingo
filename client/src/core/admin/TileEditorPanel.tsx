import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Tile, TileCategory } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Modal, ModalHeader } from "../ui/Modal";
import { TaskEditor } from "./TaskEditor";

export function TileEditorPanel({ slug, tile, categories, onClose }: { slug: string; tile: Tile; categories: TileCategory[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });

  async function patch(fields: Partial<Tile>) {
    await adminApi.updateTile(slug, tile.id, fields);
    invalidate();
  }
  async function deleteTile() {
    if (!confirm(`Delete "${tile.name}" and everything on it? This can't be undone.`)) return;
    await adminApi.deleteTile(slug, tile.id);
    invalidate();
    onClose();
  }
  async function addTask() {
    await adminApi.createTask(slug, tile.id, { label: `Part ${String.fromCharCode(65 + tile.tasks.length)}`, sortOrder: tile.tasks.length, points: 10, description: "Describe the challenge…" });
    invalidate();
  }
  async function uploadImage(file: File) {
    setUploading(true);
    try {
      await adminApi.uploadTileImage(slug, tile.id, file);
      invalidate();
    } finally {
      setUploading(false);
    }
  }
  async function addWildcard() {
    await adminApi.createWildcard(slug, tile.id, { itemName: "New wildcard" });
    invalidate();
  }
  async function deleteWildcard(id: string) {
    await adminApi.deleteWildcard(slug, id);
    invalidate();
  }

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader title={tile.name} subtitle={`Row ${tile.boardRow}, Col ${tile.boardCol}`} onClose={onClose} />
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div
            className="w-20 h-20 shrink-0 bg-slate-900 border border-slate-700 rounded-md flex items-center justify-center cursor-pointer overflow-hidden"
            onClick={() => fileInputRef.current?.click()}
          >
            {tile.imageUrl ? <img src={tile.imageUrl} alt="" className="w-full h-full object-contain" /> : <span className="text-slate-600 text-xs text-center px-1">{uploading ? "…" : "Upload"}</span>}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />

          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="tile-name" className="block text-xs text-slate-400 mb-1">Name</label>
              <input id="tile-name" defaultValue={tile.name} onBlur={(e) => patch({ name: e.target.value })} className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select
                defaultValue={tile.categoryId ?? ""}
                onChange={(e) => patch({ categoryId: e.target.value || null })}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs text-slate-300 mt-6 cursor-pointer">
                <input type="checkbox" defaultChecked={tile.hasFreezePeriod} onChange={(e) => patch({ hasFreezePeriod: e.target.checked })} className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer" />
                Freeze period
              </label>
            </div>
            {tile.hasFreezePeriod && (
              <div className="col-span-2">
                <label htmlFor="tile-freeze-duration" className="block text-xs text-slate-400 mb-1">Freeze duration (minutes)</label>
                <input
                  id="tile-freeze-duration"
                  type="number"
                  defaultValue={tile.freezeDurationMinutes}
                  onBlur={(e) => patch({ freezeDurationMinutes: Number(e.target.value) || 0 })}
                  className="w-32 bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-300">Tasks ({tile.tasks.length})</p>
            <button onClick={addTask} className="text-xs bg-slate-700 hover:bg-slate-600 text-white rounded px-2.5 py-1 cursor-pointer">
              + Add task
            </button>
          </div>
          <div className="space-y-2">
            {tile.tasks.map((task) => (
              <TaskEditor key={task.id} slug={slug} task={task} onDeleted={() => {}} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-300">Wildcards ({tile.wildcards.length})</p>
            <button onClick={addWildcard} className="text-xs bg-slate-700 hover:bg-slate-600 text-white rounded px-2.5 py-1 cursor-pointer">
              + Add wildcard
            </button>
          </div>
          <ul className="space-y-1.5">
            {tile.wildcards.map((wc) => (
              <li key={wc.id} className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-2 py-1.5">
                <input
                  defaultValue={wc.itemName}
                  onBlur={(e) => adminApi.updateWildcard(slug, wc.id, { itemName: e.target.value }).then(invalidate)}
                  className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                />
                <select
                  aria-label="Wildcard applicable task"
                  defaultValue={wc.applicableTaskId ?? ""}
                  onChange={(e) => adminApi.updateWildcard(slug, wc.id, { applicableTaskId: e.target.value || null }).then(invalidate)}
                  className="bg-slate-800 border border-slate-600 text-slate-300 text-xs rounded px-1.5 py-1 focus:outline-none"
                >
                  <option value="">Any task</option>
                  {tile.tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button onClick={() => deleteWildcard(wc.id)} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Notes (admin-only)</label>
          <input defaultValue={tile.notes ?? ""} onBlur={(e) => patch({ notes: e.target.value || null })} className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500" />
        </div>

        <button onClick={deleteTile} className="text-sm text-red-400 hover:text-red-300 cursor-pointer">
          Delete tile
        </button>
      </div>
    </Modal>
  );
}
