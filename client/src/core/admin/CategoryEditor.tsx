import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TileCategory } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";

export function CategoryEditor({ slug, categories }: { slug: string; categories: TileCategory[] }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [colorHex, setColorHex] = useState("#6366f1");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });

  async function add() {
    if (!label.trim()) return;
    await adminApi.createCategory(slug, { label: label.trim(), colorHex, sortOrder: categories.length });
    setLabel("");
    invalidate();
  }
  async function remove(id: string) {
    await adminApi.deleteCategory(slug, id);
    invalidate();
  }
  async function recolor(id: string, hex: string) {
    await adminApi.updateCategory(slug, id, { colorHex: hex });
    invalidate();
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-300 mb-2">Categories</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full pl-1 pr-2 py-1">
            <input type="color" value={cat.colorHex ?? "#64748b"} onChange={(e) => recolor(cat.id, e.target.value)} className="w-5 h-5 rounded-full border-none cursor-pointer bg-transparent" />
            <span className="text-sm text-slate-200">{cat.label}</span>
            <button onClick={() => remove(cat.id)} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer ml-1">
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer bg-transparent" />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New category name…"
          className="bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
        />
        <button onClick={add} className="text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-md px-3 py-1.5 transition-colors cursor-pointer">
          Add
        </button>
      </div>
    </div>
  );
}
