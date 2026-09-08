import { useState } from "react";
import type { ItemGroup, NodeKind, GraphNodeInput } from "@bingo/shared";
import { ItemSearchInput } from "../ui/ItemSearchInput";

const GROUP_KINDS: { kind: NodeKind; label: string }[] = [
  { kind: "ALL", label: "All of" },
  { kind: "ANY", label: "Any one of" },
  { kind: "COUNT", label: "At least N of" },
];

const INPUT = "bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600";
const SMALL_BTN = "text-xs text-slate-400 hover:text-white cursor-pointer";

type Path = number[];

function updateAt(root: GraphNodeInput, path: Path, fn: (node: GraphNodeInput) => GraphNodeInput): GraphNodeInput {
  if (path.length === 0) return fn(root);
  const [head, ...rest] = path;
  const children = root.children ?? [];
  return { ...root, children: children.map((child, i) => (i === head ? updateAt(child, rest, fn) : child)) };
}

function removeAt(root: GraphNodeInput, path: Path): GraphNodeInput {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  return updateAt(root, parentPath, (parent) => ({ ...parent, children: (parent.children ?? []).filter((_, i) => i !== index) }));
}

function appendChild(root: GraphNodeInput, path: Path, child: GraphNodeInput): GraphNodeInput {
  return updateAt(root, path, (parent) => ({ ...parent, children: [...(parent.children ?? []), child] }));
}

const NEW_LEAF: GraphNodeInput = { kind: "ITEM", itemNames: [], quantity: 1 };
const NEW_GROUP: GraphNodeInput = { kind: "ALL", children: [] };

export interface RequirementTreeEditorProps {
  root: GraphNodeInput;
  itemGroups: ItemGroup[];
  onChange: (root: GraphNodeInput) => void;
  /** Creates a global item group from inline names; resolves null if cancelled. */
  onSaveAsGroup?: (itemNames: string[]) => Promise<ItemGroup | null>;
}

// Recursive editor for a task's requirement tree. Every group node (ALL/ANY/
// COUNT) can hold any number of item leaves or nested groups. The root is a
// group and cannot be removed; leaves and nested groups can.
export function RequirementTreeEditor({ root, itemGroups, onChange, onSaveAsGroup }: RequirementTreeEditorProps) {
  return <GroupNode node={root} path={[]} itemGroups={itemGroups} onSaveAsGroup={onSaveAsGroup} update={(path, fn) => onChange(updateAt(root, path, fn))} remove={(path) => onChange(removeAt(root, path))} add={(path, child) => onChange(appendChild(root, path, child))} />;
}

interface NodeProps {
  node: GraphNodeInput;
  path: Path;
  itemGroups: ItemGroup[];
  onSaveAsGroup?: (itemNames: string[]) => Promise<ItemGroup | null>;
  update: (path: Path, fn: (node: GraphNodeInput) => GraphNodeInput) => void;
  remove: (path: Path) => void;
  add: (path: Path, child: GraphNodeInput) => void;
}

function GroupNode(props: NodeProps) {
  const { node, path, update, remove, add } = props;
  const isRoot = path.length === 0;
  const children = node.children ?? [];
  return (
    <div className={isRoot ? "" : "border-l-2 border-slate-700 pl-3"}>
      <div className="flex items-center gap-2 mb-1.5">
        <select
          aria-label="Requirement kind"
          value={node.kind}
          onChange={(e) => update(path, (n) => ({ ...n, kind: e.target.value as NodeKind, minCount: e.target.value === "COUNT" ? n.minCount ?? 1 : undefined }))}
          className={INPUT}
        >
          {GROUP_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>{k.label}</option>
          ))}
        </select>
        {node.kind === "COUNT" && (
          <input
            aria-label="Minimum count"
            type="number"
            min={1}
            defaultValue={node.minCount ?? 1}
            onBlur={(e) => update(path, (n) => ({ ...n, minCount: Math.max(1, Number(e.target.value) || 1) }))}
            className={`w-16 ${INPUT}`}
          />
        )}
        <button type="button" onClick={() => add(path, NEW_LEAF)} className={SMALL_BTN}>+ item</button>
        <button type="button" onClick={() => add(path, NEW_GROUP)} className={SMALL_BTN}>+ group</button>
        {!isRoot && (
          <button type="button" aria-label="Remove group" onClick={() => remove(path)} className="ml-auto text-slate-500 hover:text-red-400 text-xs cursor-pointer">✕</button>
        )}
      </div>
      {children.length === 0 && <p className="text-xs text-slate-500 italic mb-1.5">No requirements yet — add an item or a group.</p>}
      <ul className="space-y-1.5">
        {children.map((child, i) => (
          // Inputs are uncontrolled (save on blur); include length so removing a sibling remounts the rest.
          <li key={`${i}-${children.length}`}>
            {child.kind === "ITEM" ? <LeafNode {...props} node={child} path={[...path, i]} /> : <GroupNode {...props} node={child} path={[...path, i]} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeafNode({ node, path, itemGroups, update, remove, onSaveAsGroup }: NodeProps) {
  const itemNames = node.itemNames ?? [];
  const group = itemGroups.find((g) => g.id === node.itemGroupId);
  const [newName, setNewName] = useState("");

  // Each name is its own chip (not a comma-separated blob) so the wiki
  // search/icon lookup — which resolves one item at a time — can drive
  // adding them. Committing (blur, or picking a suggestion) appends the
  // name and clears the box for the next one; re-adding an existing name
  // (case-insensitive) is a no-op rather than a silent duplicate.
  function addName(raw: string) {
    const trimmed = raw.trim();
    if (trimmed && !itemNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      update(path, (n) => ({ ...n, itemNames: [...(n.itemNames ?? []), trimmed] }));
    }
    setNewName("");
  }
  function removeName(name: string) {
    update(path, (n) => ({ ...n, itemNames: (n.itemNames ?? []).filter((existing) => existing !== name) }));
  }

  async function saveAsGroup() {
    const created = await onSaveAsGroup!(itemNames);
    if (created) update(path, (n) => ({ ...n, itemNames: [], itemGroupId: created.id }));
  }
  return (
    <div className="bg-slate-800 rounded px-2 py-1.5 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {itemNames.map((name) => (
          <span key={name} className="flex items-center gap-1 bg-slate-700 text-slate-200 text-xs rounded-full pl-2 pr-1 py-0.5">
            {name}
            <button type="button" aria-label={`Remove ${name}`} onClick={() => removeName(name)} className="text-slate-400 hover:text-red-400 cursor-pointer leading-none">✕</button>
          </span>
        ))}
        <ItemSearchInput
          value={newName}
          onChange={setNewName}
          onCommit={addName}
          placeholder="Add item name…"
          ariaLabel="Item names"
          containerClassName="flex-1 min-w-36"
          className={INPUT}
        />
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label="Item group"
          value={node.itemGroupId ?? ""}
          onChange={(e) => update(path, (n) => ({ ...n, itemGroupId: e.target.value || undefined }))}
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
          defaultValue={node.quantity ?? 1}
          onBlur={(e) => update(path, (n) => ({ ...n, quantity: Math.max(1, Number(e.target.value) || 1) }))}
          className={`w-14 ${INPUT}`}
        />
        <label title="Count distinct item names instead of total quantity" className="flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
          <input type="checkbox" checked={node.distinctItems ?? false} onChange={(e) => update(path, (n) => ({ ...n, distinctItems: e.target.checked }))} className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer" />
          distinct
        </label>
        <button type="button" aria-label="Remove item" onClick={() => remove(path)} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer">✕</button>
      </div>
      {(group || (onSaveAsGroup && itemNames.length > 1)) && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {group && <span className="truncate" title={group.itemNames.join(", ")}>{group.name}: {group.itemNames.join(", ")}</span>}
          {onSaveAsGroup && itemNames.length > 1 && !group && (
            <button type="button" onClick={saveAsGroup} className="text-indigo-400 hover:text-indigo-300 cursor-pointer">Save these names as a group…</button>
          )}
        </div>
      )}
    </div>
  );
}
