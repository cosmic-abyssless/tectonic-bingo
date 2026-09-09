import { useState } from "react";
import { MenuTrigger } from "react-aria-components";
import type { ItemGroup, NodeKind, GraphNode, GraphNodeInput } from "@bingo/shared";
import { ItemSearchInput, iconUrlFor } from "../ui/ItemSearchInput";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Button, IconButton } from "../ui/Button";
import { inputClass } from "../ui/Field";
import { Menu, MenuItem } from "../ui/Menu";
import { ChevronDownIcon, LinkIcon, PlusIcon, XIcon } from "../ui/icons";
import { toGraphNodeInput, collectLabeledConditions } from "../board/requirementTree";

/** An ITEM leaf that already exists elsewhere on the same tile — offered as a reference, not retyped. */
export interface ExistingLeaf {
  id: string;
  itemName: string;
  taskLabel: string;
}

/**
 * An ALL/ANY/COUNT/SUM block that already exists elsewhere on the same tile
 * (including a whole sibling task's own root) — offered as a reference, so
 * the entire nested requirement can be reused as-is instead of flattened
 * into plain items or rebuilt by hand. `label` is a display-only dot-notation
 * index ("Condition 1.2"), computed fresh per render (see TileEditorPanel)
 * — nothing here is persisted.
 */
export interface ExistingCondition {
  id: string;
  taskLabel: string;
  label: string;
  node: GraphNode;
}

// Best-effort wiki icon for a row — many names here are bingo-specific
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

// Marks a row whose id is shared with another task's leaf (added via
// "+ existing item"/"+ existing condition", or the original side of one) —
// the same claim counts toward both tasks, which isn't visible from the name
// alone.
function SharedMark({ tasks }: { tasks: string[] }) {
  const title = `Shared with ${tasks.length > 0 ? tasks.join(", ") : "another task"} — removing it here only unlinks it from this task`;
  return (
    <span title={title} role="img" aria-label={title} className="shrink-0 text-info">
      <LinkIcon size={14} />
    </span>
  );
}

// One primary "+ Item" action plus a caret revealing the less-common adds
// (a new nested condition, or a reference to something that already exists
// elsewhere on the tile) — keeps a GroupNode's header to two controls
// instead of up to four separate buttons.
function SplitAddButton({ primaryLabel, onPrimary, options }: { primaryLabel: string; onPrimary: () => void; options: { label: string; onClick: () => void }[] }) {
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-line-strong">
      <Button variant="ghost" size="sm" onPress={onPrimary} className="rounded-none border-0">
        <PlusIcon size={12} /> {primaryLabel}
      </Button>
      {options.length > 0 && (
        <MenuTrigger>
          <Button variant="ghost" size="sm" aria-label="More add options" className="rounded-none border-0 border-l border-line-strong px-1.5">
            <ChevronDownIcon size={12} />
          </Button>
          <Menu onAction={(key) => options.find((o) => o.label === key)?.onClick()}>
            {options.map((o) => (
              <MenuItem key={o.label} id={o.label}>
                <PlusIcon size={12} /> {o.label}
              </MenuItem>
            ))}
          </Menu>
        </MenuTrigger>
      )}
    </div>
  );
}

// Every composite kind a requirement can be, uniformly: ALL/ANY are plain
// booleans over children, COUNT needs a minimum number of complete children,
// SUM needs a summed quantity across ITEM children. One dropdown, one set of
// children (items or nested composites) — no separate "item row" shape.
const GROUP_KINDS: { kind: NodeKind; label: string }[] = [
  { kind: "ALL", label: "All of" },
  { kind: "ANY", label: "Any one of" },
  { kind: "COUNT", label: "At least N of" },
  { kind: "SUM", label: "Sum to N across" },
];

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

const NEW_GROUP: GraphNodeInput = { kind: "ALL", children: [] };

// Labels every ALL/ANY/COUNT/SUM block in this tree with the same
// dot-notation index (1, 1.1, 1.2, 1.1.1, ...) TileEditorPanel's
// existingConditionsExcluding() uses for a sibling task's "+ existing
// condition" picker — so an admin looking at this task's own tree can tell
// which entry there refers to which block. Keyed by node reference rather
// than id: a freshly added, unsaved condition has no id yet, and `root` is
// the same object graph rendered below within one render pass, so identity
// holds.
function labelConditions(root: GraphNodeInput): Map<GraphNodeInput, string> {
  return new Map(collectLabeledConditions(root).map(({ node, label }) => [node, label]));
}

export interface RequirementTreeEditorProps {
  root: GraphNodeInput;
  itemGroups: ItemGroup[];
  onChange: (root: GraphNodeInput) => void;
  /** Persists a set of item names as a new reusable group. Does not affect the row that called it — groups are a one-time authoring template, not a live reference (see docs/item-quantity-model.md §6). */
  onSaveAsGroup?: (itemNames: string[]) => Promise<ItemGroup | null>;
  /**
   * ITEM leaves already present on other tasks of this same tile — lets an
   * admin reference one as a shared requirement (multi-parent: the same
   * claim then counts toward both tasks) instead of only ever being able to
   * create new leaves. The underlying node graph already supports a leaf
   * having several parents (see docs/node-graph-model.md); this is just the
   * missing UI for it, not a new write path — reusing an id here goes
   * through the exact same PATCH this editor already does.
   */
  existingLeaves?: ExistingLeaf[];
  /** Same idea as `existingLeaves`, but whole ALL/ANY/COUNT/SUM blocks — see ExistingCondition. */
  existingConditions?: ExistingCondition[];
  /**
   * Every node id on this tile with 2+ direct parents — i.e. genuinely
   * shared, at whatever level the sharing happens (see
   * requirementTree.ts's collectSharedNodeIds). Distinct from
   * existingLeaves/existingConditions (which list what's *available to
   * link*, including everything nested inside an already-shared block):
   * this instead says which row *is itself* a link, so its remove button
   * can read "unlink" and its icon shows only there, not on every item
   * inside a shared condition too.
   */
  sharedNodeIds: Set<string>;
}

// Recursive editor for a task's requirement tree. Every composite node
// (ALL/ANY/COUNT/SUM) can hold any number of single-item rows or nested
// composites. The root is usually a composite (every task created via "+ Add
// task" starts as ALL), but hand-authored data (e.g. seed-dev.ts) can make
// the task itself a bare ITEM leaf — dispatch on kind here exactly like
// GroupNode does for its own children, or such a task would render as an
// empty composite instead of its actual item row.
export function RequirementTreeEditor({ root, itemGroups, onChange, onSaveAsGroup, existingLeaves, existingConditions, sharedNodeIds }: RequirementTreeEditorProps) {
  const conditionLabels = labelConditions(root);
  const props: NodeProps = {
    node: root,
    path: [],
    itemGroups,
    onSaveAsGroup,
    existingLeaves,
    existingConditions,
    sharedNodeIds,
    conditionLabels,
    update: (path, fn) => onChange(updateAt(root, path, fn)),
    remove: (path) => onChange(removeAt(root, path)),
    add: (path, child) => onChange(appendChild(root, path, child)),
    // Batched sibling of `add`: folds every child onto `root` in one
    // onChange call. Calling `add` in a loop instead would have each call
    // close over the same pre-update `root`, so only the last child would
    // survive — this is the "+ item" (group-pick) path.
    addMany: (path, children) => onChange(children.reduce((r, child) => appendChild(r, path, child), root)),
  };
  return root.kind === "ITEM" ? <ItemLeafRow {...props} /> : <GroupNode {...props} />;
}

interface NodeProps {
  node: GraphNodeInput;
  path: Path;
  itemGroups: ItemGroup[];
  onSaveAsGroup?: (itemNames: string[]) => Promise<ItemGroup | null>;
  existingLeaves?: ExistingLeaf[];
  existingConditions?: ExistingCondition[];
  sharedNodeIds: Set<string>;
  conditionLabels: Map<GraphNodeInput, string>;
  update: (path: Path, fn: (node: GraphNodeInput) => GraphNodeInput) => void;
  remove: (path: Path) => void;
  add: (path: Path, child: GraphNodeInput) => void;
  addMany: (path: Path, children: GraphNodeInput[]) => void;
}

function GroupNode(props: NodeProps) {
  const { node, path, itemGroups, update, remove, add, addMany, onSaveAsGroup, existingLeaves, existingConditions, sharedNodeIds, conditionLabels } = props;
  const isRoot = path.length === 0;
  const children = node.children ?? [];
  const ownLabel = conditionLabels.get(node);
  // This block *itself* has 2+ direct parents (not merely "something inside
  // it is reachable from another task") — see sharedNodeIds' doc comment.
  const isShared = !!node.id && sharedNodeIds.has(node.id);
  const sharedWithTasks = isShared ? Array.from(new Set((existingConditions ?? []).filter((c) => c.id === node.id).map((c) => c.taskLabel))) : [];
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [pickingExisting, setPickingExisting] = useState(false);
  const [pickingExistingCondition, setPickingExistingCondition] = useState(false);
  // Offer a leaf/condition already on this group only once — re-adding the
  // same id as a second direct child of the same parent isn't meaningful.
  const childIds = new Set(children.map((c) => c.id).filter(Boolean));
  const pickableLeaves = (existingLeaves ?? []).filter((l) => !childIds.has(l.id));
  // "+ existing condition" references a whole ALL/ANY/COUNT/SUM block from a
  // sibling task as-is (its own kind/quantity/children, not decomposed into
  // items) — e.g. reuse Part A's "at least 2 of these 5 bosses" verbatim in
  // Part B, rather than rebuilding the same COUNT by hand.
  const pickableConditions = (existingConditions ?? []).filter((c) => !childIds.has(c.id));

  // Committing (blur, or picking a suggestion) adds one plain ITEM leaf and
  // closes the picker — mirrors "+ existing item"'s reveal-then-commit flow.
  function commitNewItem(raw: string) {
    const trimmed = raw.trim();
    if (trimmed) add(path, { kind: "ITEM", itemName: trimmed });
    setNewItemName("");
    setAddingItem(false);
  }
  // The same search box surfaces item groups by name (ItemSearchInput merges
  // them into its dropdown). Picking one drops every member in as its own
  // sibling item row — a one-time expansion, not a live reference
  // (docs/item-quantity-model.md §6).
  function commitNewItemGroup(group: ItemGroup) {
    addMany(path, group.itemNames.map((itemName): GraphNodeInput => ({ kind: "ITEM", itemName })));
    setAddingItem(false);
  }

  // Offered only when every direct child is a plain item (a flat set, like
  // what a saved group expands into) — nested composites have no flat name
  // list to save.
  const itemChildren = children.filter((c) => c.kind === "ITEM" && c.itemName);
  const canSaveAsGroup = onSaveAsGroup && itemChildren.length > 1 && itemChildren.length === children.length;
  async function saveAsGroup() {
    const names = itemChildren.map((c) => c.itemName!).filter(Boolean);
    await onSaveAsGroup!(names);
  }

  return (
    <div className={isRoot ? "" : "border-l-2 border-line pl-3"}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {isShared && <SharedMark tasks={sharedWithTasks} />}
        {ownLabel && (
          <span className="num shrink-0 text-xs text-fg-subtle" title="Shown in this task's own tree, and in other tasks' &quot;+ existing condition&quot; picker once saved">
            Condition {ownLabel}
          </span>
        )}
        <select
          aria-label="Requirement kind"
          value={node.kind}
          onChange={(e) => {
            const kind = e.target.value as NodeKind;
            update(path, (n) => ({
              ...n,
              kind,
              minCount: kind === "COUNT" ? n.minCount ?? 1 : undefined,
              quantity: kind === "SUM" ? n.quantity ?? 1 : undefined,
            }));
          }}
          className={`${inputClass} h-8 w-auto text-xs`}
        >
          {GROUP_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        {node.kind === "COUNT" && (
          <input
            aria-label="Minimum count"
            type="number"
            min={1}
            defaultValue={node.minCount ?? 1}
            onBlur={(e) => update(path, (n) => ({ ...n, minCount: Math.max(1, Number(e.target.value) || 1) }))}
            className={`${inputClass} num h-8 w-16 text-xs`}
          />
        )}
        {node.kind === "SUM" && (
          <input
            aria-label="Target quantity"
            type="number"
            min={1}
            defaultValue={node.quantity ?? 1}
            onBlur={(e) => update(path, (n) => ({ ...n, quantity: Math.max(1, Number(e.target.value) || 1) }))}
            className={`${inputClass} num h-8 w-16 text-xs`}
          />
        )}
        <SplitAddButton
          primaryLabel="Item"
          onPrimary={() => setAddingItem((v) => !v)}
          options={[
            { label: "Condition", onClick: () => add(path, NEW_GROUP) },
            ...(pickableLeaves.length > 0 ? [{ label: "Existing item", onClick: () => setPickingExisting((v) => !v) }] : []),
            ...(pickableConditions.length > 0 ? [{ label: "Existing condition", onClick: () => setPickingExistingCondition((v) => !v) }] : []),
          ]}
        />
        {!isRoot && <RemoveButton shared={isShared} label={isShared ? "Unlink condition" : "Remove group"} what="condition" onPress={() => remove(path)} className="ml-auto" />}
      </div>
      {addingItem && (
        <div className="mb-2 max-w-xs">
          <ItemSearchInput value={newItemName} onChange={setNewItemName} onCommit={commitNewItem} itemGroups={itemGroups} onPickGroup={commitNewItemGroup} placeholder="Add item or group…" ariaLabel="New item name" />
        </div>
      )}
      {pickingExisting && (
        <div className="mb-2 max-w-xs">
          <SearchableSelect
            value=""
            options={pickableLeaves.map((l) => ({ id: l.id, label: l.itemName, group: l.taskLabel }))}
            placeholder="Search items elsewhere on this tile…"
            onChange={(id) => {
              const leaf = pickableLeaves.find((l) => l.id === id);
              if (leaf) add(path, { id: leaf.id, kind: "ITEM", itemName: leaf.itemName });
              setPickingExisting(false);
            }}
          />
        </div>
      )}
      {pickingExistingCondition && (
        <div className="mb-2 max-w-xs">
          <SearchableSelect
            value=""
            options={pickableConditions.map((c) => ({ id: c.id, label: c.label, group: c.taskLabel }))}
            placeholder="Search conditions elsewhere on this tile…"
            onChange={(id) => {
              const condition = pickableConditions.find((c) => c.id === id);
              if (condition) add(path, toGraphNodeInput(condition.node));
              setPickingExistingCondition(false);
            }}
          />
        </div>
      )}
      {children.length === 0 && <p className="mb-2 text-xs text-fg-subtle">No requirements yet — add an item or a condition.</p>}
      <ul className="space-y-1.5">
        {children.map((child, i) => (
          // Inputs are uncontrolled (save on blur); include length so removing a sibling remounts the rest.
          <li key={`${i}-${children.length}`}>
            {child.kind === "ITEM" ? <ItemLeafRow {...props} node={child} path={[...path, i]} /> : <GroupNode {...props} node={child} path={[...path, i]} />}
          </li>
        ))}
      </ul>
      {canSaveAsGroup && (
        <Button variant="ghost" size="sm" onPress={saveAsGroup} className="mt-1.5 -ml-2.5">
          Save these names as a new group…
        </Button>
      )}
    </div>
  );
}

// "✕" for a plain row, "unlink" for a shared one — the latter is only removed
// from this task, not deleted (see sharedNodeIds).
function RemoveButton({ shared, label, what, onPress, className }: { shared: boolean; label: string; what: string; onPress: () => void; className?: string }) {
  const title = shared ? `Unlink from this task — the ${what} itself is only deleted if this was its last use` : undefined;
  return shared ? (
    <Button variant="ghost" size="sm" aria-label={label} onPress={onPress} className={`h-7 px-2 text-fg-subtle hover:text-danger ${className ?? ""}`}>
      <span title={title}>unlink</span>
    </Button>
  ) : (
    <IconButton size="sm" label={label} onPress={onPress} className={`hover:text-danger ${className ?? ""}`}>
      <XIcon size={12} />
    </IconButton>
  );
}

// One item requirement: a single row, one name, no quantity of its own —
// quantity always lives on the enclosing SUM/COUNT (see
// docs/item-quantity-model.md §2). Renaming isn't supported here; remove and
// re-add (or "+ existing item") instead, matching the read-only-once-added
// behavior a chip always had.
function ItemLeafRow({ node, path, remove, existingLeaves, sharedNodeIds }: NodeProps) {
  const isRoot = path.length === 0;
  const name = node.itemName ?? "";
  // This leaf *itself* has 2+ direct parents — not just "reachable somewhere
  // under a sibling task," which would also be true of every other leaf
  // nested inside a condition block that's shared one level up. Only the
  // node that's actually the link gets the icon (see sharedNodeIds).
  const isShared = !!node.id && sharedNodeIds.has(node.id);
  const sharedWithTasks = isShared ? Array.from(new Set((existingLeaves ?? []).filter((l) => l.id === node.id).map((l) => l.taskLabel))) : [];

  return (
    <div className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2">
      {isShared && <SharedMark tasks={sharedWithTasks} />}
      <ChipIcon name={name} className="size-4" />
      <span className="flex-1 truncate text-xs text-fg">{name}</span>
      {!isRoot && <RemoveButton shared={isShared} label={isShared ? `Unlink ${name}` : `Remove ${name}`} what="item" onPress={() => remove(path)} />}
    </div>
  );
}
