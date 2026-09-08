import { useState } from "react";
import type { ItemGroup, NodeKind, GraphNodeInput } from "@bingo/shared";
import { ItemSearchInput, iconUrlFor } from "../ui/ItemSearchInput";

// Best-effort wiki icon for a chip — many names here are bingo-specific
// labels ("Any Cerberus drop") with no real wiki icon, so a 404 just hides
// the <img> rather than leaving a broken-image glyph.
function ChipIcon({ name, className }: { name: string; className: string }) {
  return (
    <img
      src={iconUrlFor(name)}
      alt=""
      className={`${className} object-contain shrink-0`}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

// Structural composites only — a SUM is never chosen here. Every SUM in this
// editor is an "item row" (see ItemRowNode) created via "+ item"; its
// children are always ITEM leaves, so it never needs the generic
// nested-group UI (see docs/item-quantity-model.md §9).
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

// An "item row" is always a SUM, even at quantity 1 — one write-path shape,
// no bare-leaf-sometimes/wrapped-sometimes special case. See
// docs/item-quantity-model.md §2.
const NEW_ITEM_ROW: GraphNodeInput = { kind: "SUM", quantity: 1, children: [] };
const NEW_GROUP: GraphNodeInput = { kind: "ALL", children: [] };

export interface RequirementTreeEditorProps {
  root: GraphNodeInput;
  itemGroups: ItemGroup[];
  onChange: (root: GraphNodeInput) => void;
  /** Persists a set of item names as a new reusable group. Does not affect the row that called it — groups are a one-time authoring template, not a live reference (see docs/item-quantity-model.md §6). */
  onSaveAsGroup?: (itemNames: string[]) => Promise<ItemGroup | null>;
}

// Recursive editor for a task's requirement tree. Every group node (ALL/ANY/
// COUNT) can hold any number of item rows or nested groups. The root is a
// group and cannot be removed; rows and nested groups can.
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
        <button type="button" onClick={() => add(path, NEW_ITEM_ROW)} className={SMALL_BTN}>+ item</button>
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
            {child.kind === "ITEM" || child.kind === "SUM" ? <ItemRowNode {...props} node={child} path={[...path, i]} /> : <GroupNode {...props} node={child} path={[...path, i]} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

// One item requirement: a chip per accepted name, a search box to add more
// (typed or picked from a group), and the row's own quantity target. Always
// written back as a SUM — a bare ITEM child (from hand-authored data, e.g.
// the seed script) is displayed as a 1-chip row and upgrades to a real SUM
// the moment it's edited.
function ItemRowNode({ node, path, itemGroups, update, remove, onSaveAsGroup }: NodeProps) {
  const children = node.kind === "ITEM" ? [node] : node.children ?? [];
  const quantity = node.kind === "SUM" ? node.quantity ?? 1 : 1;
  const [newName, setNewName] = useState("");

  function writeChildren(nextChildren: GraphNodeInput[], nextQuantity: number = quantity) {
    // Upgrading a bare ITEM into a SUM wrapper must NOT reuse the item's own
    // id for the wrapper — that id may already have claims pointing at it,
    // and it's carried forward on the child (still in nextChildren, since
    // `children` above is `[node]` itself for the ITEM case). The wrapper
    // gets a fresh id instead; an already-SUM row keeps its own id as usual.
    const wrapperId = node.kind === "SUM" ? node.id : undefined;
    update(path, (n) => ({ ...n, id: wrapperId, kind: "SUM", quantity: nextQuantity, children: nextChildren }));
  }

  // Each name is its own chip (not a comma-separated blob) so the wiki
  // search/icon lookup — which resolves one item at a time — can drive
  // adding them. Committing (blur, or picking a suggestion) appends the
  // name and clears the box for the next one; re-adding an existing name
  // (case-insensitive) is a no-op rather than a silent duplicate.
  function addName(raw: string) {
    const trimmed = raw.trim();
    if (trimmed && !children.some((c) => (c.itemName ?? "").toLowerCase() === trimmed.toLowerCase())) {
      writeChildren([...children, { kind: "ITEM", itemName: trimmed }]);
    }
    setNewName("");
  }
  function removeName(itemName: string) {
    writeChildren(children.filter((c) => c.itemName !== itemName));
  }

  // The same search box also surfaces item groups by name (ItemSearchInput
  // merges them into its dropdown). Picking one drops every member in as its
  // own plain item chip, deduped against names already on the row — a
  // one-time expansion, not a live reference (docs/item-quantity-model.md §6).
  function addGroup(group: ItemGroup) {
    const existing = new Set(children.map((c) => (c.itemName ?? "").toLowerCase()));
    const additions = group.itemNames.filter((n) => !existing.has(n.toLowerCase())).map((itemName): GraphNodeInput => ({ kind: "ITEM", itemName }));
    if (additions.length > 0) writeChildren([...children, ...additions]);
  }

  // Persists the row's current names as a new reusable group for future
  // picks — the row itself is untouched (see the type's own doc comment).
  async function saveAsGroup() {
    const names = children.map((c) => c.itemName).filter((n): n is string => !!n);
    await onSaveAsGroup!(names);
  }
  const canSaveAsGroup = onSaveAsGroup && children.length > 1;

  return (
    <div className="bg-slate-800 rounded px-2 py-1.5 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {children.map((child) => {
          const name = child.itemName;
          if (!name) return null;
          return (
            <span key={name} className="flex items-center gap-1 bg-slate-700 text-slate-200 text-xs rounded-full pl-1.5 pr-1 py-0.5">
              <ChipIcon name={name} className="w-3.5 h-3.5" />
              {name}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => removeName(name)} className="text-slate-400 hover:text-red-400 cursor-pointer leading-none">✕</button>
            </span>
          );
        })}
        <ItemSearchInput
          value={newName}
          onChange={setNewName}
          onCommit={addName}
          itemGroups={itemGroups}
          onPickGroup={addGroup}
          placeholder="Add item or group…"
          ariaLabel="Item names"
          containerClassName="flex-1 min-w-36"
          className={INPUT}
        />
        <input
          aria-label="Quantity"
          type="number"
          min={1}
          defaultValue={quantity}
          onBlur={(e) => writeChildren(children, Math.max(1, Number(e.target.value) || 1))}
          className={`w-14 ${INPUT}`}
        />
        <button type="button" aria-label="Remove item" onClick={() => remove(path)} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer">✕</button>
      </div>
      {canSaveAsGroup && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <button type="button" onClick={saveAsGroup} className="text-indigo-400 hover:text-indigo-300 cursor-pointer">Save these names as a new group…</button>
        </div>
      )}
    </div>
  );
}
