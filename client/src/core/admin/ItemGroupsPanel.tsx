import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ItemGroup } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { adminQueryKeys, useItemGroups } from "../../api/adminQueries";
import { Button } from "../ui/Button";
import { Card, CardHeader, Notice } from "../ui/Card";
import { Input, Textarea } from "../ui/Field";

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
      <Input aria-label="Group name" placeholder="Group name (e.g. Cerberus uniques)" value={name} onChange={(e) => setName(e.target.value)} />
      <Input aria-label="Group description" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <Textarea aria-label="Group item names" placeholder="One item name per line (or comma-separated)" value={names} onChange={(e) => setNames(e.target.value)} rows={4} />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onPress={save} isDisabled={!name.trim() || itemNames.length === 0 || saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create group"}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onPress={onCancel}>
            Cancel
          </Button>
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
      await optimisticUpdate<{ itemGroups: ItemGroup[] }>(
        queryClient,
        adminQueryKeys.itemGroups,
        (d) => ({ itemGroups: d.itemGroups.filter((g) => g.id !== group.id) }),
        () => adminApi.deleteItemGroup(group.id),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete item group");
    }
  }

  return (
    <li className="space-y-2 px-4 py-3">
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
              <div className="text-sm font-semibold text-on-surface">{group.name}</div>
              {group.description && <div className="text-xs text-on-surface-muted">{group.description}</div>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onPress={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-danger" onPress={remove}>
                Delete
              </Button>
            </div>
          </div>
          <div className="text-xs text-on-surface-muted">{group.itemNames.join(", ")}</div>
          {error && <Notice tone="danger">{error}</Notice>}
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
    <Card className="w-full max-w-2xl">
      <CardHeader title="Item groups" description="Named sets of item names reusable in any bingo's tile requirements." />
      <div className="p-5">
        <GroupForm
          onSave={async (payload) => {
            await adminApi.createItemGroup(payload);
            await queryClient.invalidateQueries({ queryKey: adminQueryKeys.itemGroups });
          }}
        />
      </div>
      {isLoading ? (
        <p className="px-5 pb-5 text-sm text-on-surface-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-on-surface-subtle">No item groups yet.</p>
      ) : (
        <ul className="divide-y divide-outline border-t border-outline">
          {groups.map((g) => <GroupRow key={g.id} group={g} />)}
        </ul>
      )}
    </Card>
  );
}
