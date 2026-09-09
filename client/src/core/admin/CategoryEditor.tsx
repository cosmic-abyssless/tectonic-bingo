import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TileCategory } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Button, IconButton } from "../ui/Button";
import { Input } from "../ui/Field";
import { XIcon } from "../ui/icons";

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
      <p className="mb-2 text-sm font-medium text-fg">Categories</p>
      {categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface pl-1.5 pr-1">
              <input type="color" aria-label={`${cat.label} color`} value={cat.colorHex ?? "#64748b"} onChange={(e) => recolor(cat.id, e.target.value)} className="size-5 cursor-pointer rounded-full border-none bg-transparent" />
              <span className="text-sm text-fg">{cat.label}</span>
              <IconButton size="sm" label={`Remove ${cat.label}`} onPress={() => remove(cat.id)}>
                <XIcon size={12} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input type="color" aria-label="New category color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="size-8 cursor-pointer rounded-md border-none bg-transparent" />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New category name…" className="max-w-xs" />
        <Button onPress={add} isDisabled={!label.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
