import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ItemGroup } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useItemGroups } from "../../api/adminQueries";

const INPUT = "w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500";

function parseNames(raw: string): string[] {
  return raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

interface GroupFormProps {
  initial?: ItemGroup;
  onSave: (payload: { name: string; description?: string; itemNames: string[] }) => Promise<void>;
  onCancel?: () => void;
}

function GroupForm({ initial, onSave, onCancel }: GroupFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [names, setNames] = useState(initial?.itemNames.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemNames = parseNames(names);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined, itemNames });
      if (!initial) {
        setName("");
        setDescription("");
        setNames("");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save item group");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <input aria-label="Group name" placeholder="Group name (e.g. Cerberus uniques)" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
      <input aria-label="Group description" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className={INPUT} />
      <textarea
        aria-label="Group item names"
        placeholder="One item name per line (or comma-separated)"
        value={names}
        onChange={(e) => setNames(e.target.value)}
        rows={4}
        className={INPUT}
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={!name.trim() || itemNames.length === 0 || saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-md px-3 py-1.5 text-sm cursor-pointer"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create group"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-sm text-slate-400 hover:text-white px-3 py-1.5 cursor-pointer">Cancel</button>
        )}
      </div>
    </div>
  );
}

function GroupRow({ group }: { group: ItemGroup }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.itemGroups });

  async function remove() {
    if (!confirm(`Delete item group "${group.name}"?`)) return;
    setError(null);
    try {
      await adminApi.deleteItemGroup(group.id);
      await invalidate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete item group");
    }
  }

  return (
    <li className="border border-slate-700 rounded-md p-3 space-y-2">
      {editing ? (
        <GroupForm
          initial={group}
          onCancel={() => setEditing(false)}
          onSave={async (payload) => {
            await adminApi.updateItemGroup(group.id, payload);
            await invalidate();
            setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-white text-sm">{group.name}</div>
              {group.description && <div className="text-xs text-slate-400">{group.description}</div>}
            </div>
            <div className="flex gap-2 text-xs shrink-0">
              <button onClick={() => setEditing(true)} className="text-indigo-400 hover:text-indigo-300 cursor-pointer">Edit</button>
              <button onClick={remove} className="text-red-400 hover:text-red-300 cursor-pointer">Delete</button>
            </div>
          </div>
          <div className="text-xs text-slate-300">{group.itemNames.join(", ")}</div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </>
      )}
    </li>
  );
}

export function ItemGroupsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useItemGroups();
  const groups = data?.itemGroups ?? [];

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4 w-full max-w-2xl">
      <div>
        <h2 className="font-bold text-white">Item groups</h2>
        <p className="text-xs text-slate-400">Named sets of item names reusable in any bingo's tile requirements.</p>
      </div>
      <GroupForm
        onSave={async (payload) => {
          await adminApi.createItemGroup(payload);
          await queryClient.invalidateQueries({ queryKey: adminQueryKeys.itemGroups });
        }}
      />
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-slate-500">No item groups yet.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => <GroupRow key={g.id} group={g} />)}
        </ul>
      )}
    </div>
  );
}
