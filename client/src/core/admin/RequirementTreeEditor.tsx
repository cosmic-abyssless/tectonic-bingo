import { createContext, Fragment, useContext, useRef, useState, type ReactNode } from "react";
import { DragPreview, mergeProps, useButton, useDrag, useDrop, type DragPreviewRenderer } from "react-aria";
import { MenuTrigger } from "react-aria-components";
import { describeValuedAs, type ItemGroup, type NodeKind, type GraphNode, type GraphNodeInput, type ValuedAs } from "@bingo/shared";
import { ItemSearchInput, iconUrlFor } from "../ui/ItemSearchInput";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Button, IconButton } from "../ui/Button";
import { controlClass } from "../ui/Field";
import { Menu, MenuItem } from "../ui/Menu";
import { Select } from "../ui/Select";
import { ChevronDownIcon, GripIcon, LinkIcon, PlusIcon, XIcon } from "../ui/icons";
import { Dialog, DialogHeader } from "../ui/Dialog";
import * as adminApi from "../../api/adminApi";
import { toGraphNodeInput, collectLabeledConditions } from "../board/requirementTree";
import { describeRules, useRulesFor } from "./exclusiveItems";
import { canMove, moveNode, type Path } from "./requirementMoves";

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
    <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-outline-strong">
      <Button variant="ghost" size="sm" onPress={onPrimary} className="rounded-none border-0">
        <PlusIcon size={12} /> {primaryLabel}
      </Button>
      {options.length > 0 && (
        <MenuTrigger>
          <Button variant="ghost" size="sm" aria-label="More add options" className="rounded-none border-0 border-l border-outline-strong px-1.5">
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
  { kind: "ALL", label: "Complete all of" },
  { kind: "ANY", label: "Complete any one of" },
  { kind: "COUNT", label: "Complete at least N of" },
  { kind: "SUM", label: "Collect N in total across" },
];

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

// Drag and drop, to reorder a task's items and conditions or move one into another condition of the same task: every
// row but the task's own has a handle (DragHandle), and there's a drop spot (DropGap) between rows, before the first
// and after the last, at every level. Keyboard too (React Aria's): Enter on a handle, Tab to a spot, Enter to drop,
// Escape to cancel. The row being dragged is tracked here, so the spots it can't go to (inside itself, where it
// already is) stay out of the way; the move itself is a normal tree edit, saved like any other.
const DRAG_TYPE = "application/x-bingo-requirement";

interface Moves {
  dragging: Path | null;
  setDragging: (path: Path | null) => void;
  canDrop: (parent: Path, index: number) => boolean;
  drop: (parent: Path, index: number) => void;
}
const MovesContext = createContext<Moves | null>(null);

// What a row is called in a drag's labels: its item, or its condition's number.
function rowName(node: GraphNodeInput, labels?: Map<GraphNodeInput, string>): string {
  if (node.kind === "ITEM") return node.itemName ?? "item";
  const label = labels?.get(node);
  return label ? `Condition ${label}` : "condition";
}

function samePath(a: Path | null, b: Path): boolean {
  return !!a && a.length === b.length && a.every((v, i) => v === b[i]);
}

// React Aria calls a drag's handlers from outside React's render, so they read the current moves through a ref.
function useMoves() {
  const moves = useContext(MovesContext)!;
  const ref = useRef(moves);
  ref.current = moves;
  return [moves, ref] as const;
}

function DragHandle({ path, label }: { path: Path; label: string }) {
  const [, moves] = useMoves();
  const ref = useRef<HTMLDivElement>(null);
  const preview = useRef<DragPreviewRenderer>(null);
  const { dragProps, dragButtonProps } = useDrag({
    getItems: () => [{ [DRAG_TYPE]: JSON.stringify(path) }],
    getAllowedDropOperations: () => ["move"],
    hasDragButton: true,
    preview,
    onDragStart: () => moves.current.setDragging(path),
    onDragEnd: () => moves.current.setDragging(null),
  });
  const { buttonProps } = useButton({ ...dragButtonProps, elementType: "div", "aria-label": `Move ${label}` }, ref);
  return (
    <>
      <div
        ref={ref}
        {...mergeProps(dragProps, buttonProps)}
        title="Drag to move"
        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded-sm text-on-surface-subtle outline-none hover:text-on-surface focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
      >
        <GripIcon size={12} />
      </div>
      <DragPreview ref={preview}>
        {() => <div className="rounded-md border border-accent bg-surface px-2 py-1 text-xs text-on-surface">{label}</div>}
      </DragPreview>
    </>
  );
}

// A place a dragged row can go: index `index` of the condition at `parent`. A strip the height of the gap between rows,
// with a line across it while a drag is over it; its hit area reaches a little into the rows either side during a drag,
// so it doesn't take pixel-perfect aim. With `children` (an empty condition's "no requirements yet"), that's the spot.
// Focusable (though never in the tab order): a keyboard drag moves focus from spot to spot, and `label` says where each is.
function DropGap({ parent, index, label, children }: { parent: Path; index: number; label: string; children?: ReactNode }) {
  const [current, moves] = useMoves();
  const ref = useRef<HTMLDivElement>(null);
  const { dropProps, isDropTarget } = useDrop({
    ref,
    getDropOperation: (types) => (types.has(DRAG_TYPE) && moves.current.canDrop(parent, index) ? "move" : "cancel"),
    onDrop: () => moves.current.drop(parent, index),
  });
  const open = !!current.dragging && current.canDrop(parent, index);
  if (children) {
    return (
      <div
        ref={ref}
        {...dropProps}
        role="button"
        tabIndex={-1}
        aria-label={label}
        className={`mb-2 rounded-md border border-dashed px-2 py-1.5 outline-none ${isDropTarget ? "border-accent bg-accent/10" : open ? "border-outline-strong" : "border-transparent"}`}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      {...dropProps}
      role="button"
      tabIndex={-1}
      aria-label={label}
      className={`relative h-1.5 outline-none ${open ? "z-10 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']" : ""}`}
    >
      {isDropTarget && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent" />}
    </div>
  );
}

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
  /** The bingo, for the few rows that talk to the server themselves (re-pricing after a Valued as changes). */
  slug: string;
  root: GraphNodeInput;
  itemGroups: ItemGroup[];
  /** Saves the tree; resolves whether it saved, when the caller can tell. */
  onChange: (root: GraphNodeInput) => void | Promise<boolean>;
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
export function RequirementTreeEditor({ slug, root, itemGroups, onChange, onSaveAsGroup, existingLeaves, existingConditions, sharedNodeIds }: RequirementTreeEditorProps) {
  const conditionLabels = labelConditions(root);
  // The dragged row is kept in a ref as well as state: React Aria asks every drop spot whether it takes the drag as the
  // drag starts, before a re-render could have shown them the new state (and a keyboard drag only visits the spots
  // that said yes).
  const [dragging, setDraggingState] = useState<Path | null>(null);
  const draggingRef = useRef<Path | null>(null);
  const setDragging = (path: Path | null) => {
    draggingRef.current = path;
    setDraggingState(path);
  };
  const moves: Moves = {
    dragging,
    setDragging,
    canDrop: (parent, index) => !!draggingRef.current && canMove(root, draggingRef.current, parent, index),
    drop: (parent, index) => {
      const from = draggingRef.current;
      if (from && canMove(root, from, parent, index)) onChange(moveNode(root, from, parent, index));
      setDragging(null);
    },
  };
  const props: NodeProps = {
    slug,
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
  return <MovesContext.Provider value={moves}>{root.kind === "ITEM" ? <ItemLeafRow {...props} /> : <GroupNode {...props} />}</MovesContext.Provider>;
}

interface NodeProps {
  slug: string;
  node: GraphNodeInput;
  path: Path;
  itemGroups: ItemGroup[];
  onSaveAsGroup?: (itemNames: string[]) => Promise<ItemGroup | null>;
  existingLeaves?: ExistingLeaf[];
  existingConditions?: ExistingCondition[];
  sharedNodeIds: Set<string>;
  conditionLabels: Map<GraphNodeInput, string>;
  update: (path: Path, fn: (node: GraphNodeInput) => GraphNodeInput) => void | Promise<boolean>;
  remove: (path: Path) => void;
  add: (path: Path, child: GraphNodeInput) => void;
  addMany: (path: Path, children: GraphNodeInput[]) => void;
}

function GroupNode(props: NodeProps) {
  const { node, path, itemGroups, update, remove, add, addMany, onSaveAsGroup, existingLeaves, existingConditions, sharedNodeIds, conditionLabels } = props;
  const isRoot = path.length === 0;
  const children = node.children ?? [];
  const ownLabel = conditionLabels.get(node);
  const dragging = samePath(useContext(MovesContext)!.dragging, path);
  const conditionName = ownLabel ? `Condition ${ownLabel}` : "the task";
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

  function addItem(name: string) {
    const trimmed = name.trim();
    if (trimmed) add(path, { kind: "ITEM", itemName: trimmed });
  }
  // Picking a suggestion adds the item and keeps the (now empty, still
  // focused) search box open so several items can be added in a row.
  // Blurring commits any freeform text and closes the picker.
  function commitNewItem(raw: string) {
    addItem(raw);
    setNewItemName("");
    setAddingItem(false);
  }
  // The same search box surfaces item groups by name (ItemSearchInput merges
  // them into its dropdown). Picking one drops every member in as its own
  // sibling item row — a one-time expansion, not a live reference
  // (docs/item-quantity-model.md §6).
  function commitNewItemGroup(group: ItemGroup) {
    addMany(path, group.itemNames.map((itemName): GraphNodeInput => ({ kind: "ITEM", itemName })));
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
    <div className={`${isRoot ? "" : "border-l-2 border-outline pl-3"} ${dragging ? "opacity-40" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {!isRoot && <DragHandle path={path} label={conditionName} />}
        {isShared && <SharedMark tasks={sharedWithTasks} />}
        {ownLabel && (
          <span className="num shrink-0 text-xs text-on-surface-subtle" title="Shown in this task's own tree, and in other tasks' &quot;+ existing condition&quot; picker once saved">
            Condition {ownLabel}
          </span>
        )}
        <Select
          aria-label="Requirement kind"
          value={node.kind}
          onChange={(value) => {
            const kind = value as NodeKind;
            update(path, (n) => ({
              ...n,
              kind,
              minCount: kind === "COUNT" ? n.minCount ?? 1 : undefined,
              quantity: kind === "SUM" ? n.quantity ?? 1 : undefined,
            }));
          }}
          size="sm"
          className="w-auto!"
          options={GROUP_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
        />
        {node.kind === "COUNT" && (
          <input
            aria-label="Minimum count"
            type="number"
            min={1}
            defaultValue={node.minCount ?? 1}
            onBlur={(e) => update(path, (n) => ({ ...n, minCount: Math.max(1, Number(e.target.value) || 1) }))}
            className={`${controlClass("sm")} num w-16`}
          />
        )}
        {node.kind === "SUM" && (
          <input
            aria-label="Target quantity"
            type="number"
            min={1}
            defaultValue={node.quantity ?? 1}
            onBlur={(e) => update(path, (n) => ({ ...n, quantity: Math.max(1, Number(e.target.value) || 1) }))}
            className={`${controlClass("sm")} num w-16`}
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
          <ItemSearchInput
            value={newItemName}
            onChange={setNewItemName}
            onCommit={commitNewItem}
            onPickItem={addItem}
            itemGroups={itemGroups}
            onPickGroup={commitNewItemGroup}
            placeholder="Add item or group…"
            ariaLabel="New item name"
          />
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
      {children.length === 0 ? (
        <DropGap parent={path} index={0} label={`Into ${conditionName}`}>
          <p className="text-xs text-on-surface-subtle">No requirements yet — add an item or a condition.</p>
        </DropGap>
      ) : (
        // A drop spot before, between and after the rows; the first sits in the header's bottom margin.
        <div role="list" className="-mt-1.5">
          {children.map((child, i) => (
            // Keyed by id where there is one, so a row's own state (an open picker, an unsaved number) moves with it.
            // Inputs are uncontrolled (save on blur); a new row's key includes length so removing a sibling remounts the rest.
            <Fragment key={child.id ?? `new-${i}-${children.length}`}>
              <DropGap parent={path} index={i} label={`Before ${rowName(child, conditionLabels)}`} />
              <div role="listitem">
                {child.kind === "ITEM" ? <ItemLeafRow {...props} node={child} path={[...path, i]} /> : <GroupNode {...props} node={child} path={[...path, i]} />}
              </div>
            </Fragment>
          ))}
          <DropGap parent={path} index={children.length} label={`At the end of ${conditionName}`} />
        </div>
      )}
      {canSaveAsGroup && (
        <Button variant="ghost" size="sm" onPress={saveAsGroup} className="-ml-2.5">
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
    <Button variant="ghost" size="sm" aria-label={label} onPress={onPress} className={`h-7 px-2 text-on-surface-subtle hover:text-danger ${className ?? ""}`}>
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
function ItemLeafRow({ slug, node, path, remove, update, existingLeaves, sharedNodeIds }: NodeProps) {
  const isRoot = path.length === 0;
  const name = node.itemName ?? "";
  // This leaf *itself* has 2+ direct parents — not just "reachable somewhere
  // under a sibling task," which would also be true of every other leaf
  // nested inside a condition block that's shared one level up. Only the
  // node that's actually the link gets the icon (see sharedNodeIds).
  const isShared = !!node.id && sharedNodeIds.has(node.id);
  const sharedWithTasks = isShared ? Array.from(new Set((existingLeaves ?? []).filter((l) => l.id === node.id).map((l) => l.taskLabel))) : [];
  const exclusiveRules = useRulesFor(name);
  const [editingValue, setEditingValue] = useState(false);
  const valuedAs = node.valuedAs ?? null;
  // A changed Valued as on a Task that already has priced submissions (mid-bingo): the new value waits here while
  // the admin picks whether to re-price them too.
  const [pending, setPending] = useState<{ next: ValuedAs | null; count: number } | null>(null);
  const [repriceNote, setRepriceNote] = useState<string | null>(null);
  const dragging = samePath(useContext(MovesContext)!.dragging, path);

  async function saveValuedAs(next: ValuedAs | null) {
    setRepriceNote(null);
    const changed = JSON.stringify(next) !== JSON.stringify(valuedAs);
    if (!changed) return setEditingValue(false);
    const count = node.id ? (await adminApi.countPricedSubmissions(slug, node.id).catch(() => ({ count: 0 }))).count : 0;
    if (count > 0) return setPending({ next, count });
    setEditingValue(false);
    await update(path, (n) => ({ ...n, valuedAs: next }));
  }

  async function applyPending(reprice: boolean) {
    if (!pending) return;
    const { next } = pending;
    setPending(null);
    setEditingValue(false);
    const saved = await update(path, (n) => ({ ...n, valuedAs: next }));
    if (!reprice || saved === false || !node.id) return;
    try {
      const { repriced } = await adminApi.repriceNodeClaims(slug, node.id);
      setRepriceNote(`Re-priced ${repriced} submission${repriced === 1 ? "" : "s"}`);
    } catch (e) {
      setRepriceNote(e instanceof Error ? e.message : "Couldn't re-price");
    }
  }

  return (
    <div className={`space-y-1 ${dragging ? "opacity-40" : ""}`}>
      <div className={`flex h-8 items-center gap-2 rounded-md border border-outline bg-surface px-2 ${isRoot ? "" : "pl-1"}`}>
        {!isRoot && <DragHandle path={path} label={name} />}
        {isShared && <SharedMark tasks={sharedWithTasks} />}
        <ChipIcon name={name} className="size-4" />
        <span className="flex-1 truncate text-xs text-on-surface">{name}</span>
        {exclusiveRules.length > 0 && (
          <span
            title={`A team can use this item in one place only (${describeRules(exclusiveRules)}). Set in the bingo's settings, under Exclusive items.`}
            className="shrink-0 rounded border border-outline px-1 text-[10px] uppercase tracking-wide text-on-surface-subtle"
          >
            exclusive
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditingValue((open) => !open)}
          title={
            valuedAs
              ? `Claims here get their GP value from ${describeValuedAs(valuedAs)}, not from ${name}'s own price`
              : `Price claims here as another item instead of ${name} (e.g. a gold ring from a DT2 boss as a third of its vestige)`
          }
          className={`shrink-0 rounded px-1 text-[10px] tracking-wide ${valuedAs ? "border border-outline text-on-surface-muted" : "text-on-surface-subtle hover:text-on-surface"}`}
        >
          {valuedAs ? `valued as ${describeValuedAs(valuedAs)}${valuedAs.source ? ` · ${valuedAs.source}` : ""}` : "GP value…"}
        </button>
        {!isRoot && <RemoveButton shared={isShared} label={isShared ? `Unlink ${name}` : `Remove ${name}`} what="item" onPress={() => remove(path)} />}
      </div>
      {editingValue && <ValuedAsEditor itemName={name} valuedAs={valuedAs} onSave={(next) => void saveValuedAs(next)} onCancel={() => setEditingValue(false)} />}
      {repriceNote && <p className="px-2 text-[11px] text-on-surface-muted">{repriceNote}</p>}

      <Dialog isOpen={!!pending} onClose={() => setPending(null)}>
        <DialogHeader title="Re-price the submissions already made?" onClose={() => setPending(null)} />
        <div className="space-y-3 p-5 text-sm text-on-surface-muted">
          <p>
            {pending?.count} submission{pending?.count === 1 ? " already has" : "s already have"} a GP value from {name} on this Task. Re-pricing prices{" "}
            {pending?.count === 1 ? "it" : "them"} again with the new value at today's prices (only this Task's items); saving only leaves{" "}
            {pending?.count === 1 ? "it" : "them"} as {pending?.count === 1 ? "it is" : "they are"} and applies the new value to new submissions.
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onPress={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" onPress={() => void applyPending(false)}>
              Save only
            </Button>
            <Button variant="primary" size="sm" onPress={() => void applyPending(true)}>
              Save and re-price {pending?.count}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// A Task's "Valued as" (CONTEXT.md): its claims are priced as another item ÷ N instead of their own item. For the
// rare item whose worth depends on where it's claimed, like a DT2 boss's gold ring (a third of that boss's vestige).
function ValuedAsEditor({ itemName, valuedAs, onSave, onCancel }: { itemName: string; valuedAs: ValuedAs | null; onSave: (valuedAs: ValuedAs | null) => void; onCancel: () => void }) {
  const [item, setItem] = useState(valuedAs?.itemName ?? "");
  const [divisor, setDivisor] = useState(String(valuedAs?.divisor ?? 1));
  const [source, setSource] = useState(valuedAs?.source ?? "");
  const n = Number(divisor);
  const valid = item.trim() !== "" && Number.isInteger(n) && n >= 1;

  return (
    <div className="space-y-2 rounded-md border border-outline bg-surface px-2 py-2">
      <p className="text-[11px] text-on-surface-muted">Price {itemName} claimed here as:</p>
      <div className="flex items-center gap-2">
        <ItemSearchInput ariaLabel="Valued as item" placeholder="e.g. Magus vestige" containerClassName="min-w-0 flex-1" value={item} onChange={setItem} onPickItem={setItem} />
        <span className="text-xs text-on-surface-muted">÷</span>
        {/* controlClass is w-full, so the wrapper sets the width. */}
        <div className="w-16 shrink-0">
          <input aria-label="Divided by" type="number" min={1} step={1} value={divisor} onChange={(e) => setDivisor(e.target.value)} className={controlClass("sm")} />
        </div>
      </div>
      <input
        aria-label="Source"
        placeholder="Source, shown next to the item (optional, e.g. Vardorvis)"
        maxLength={40}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className={controlClass("sm")}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" isDisabled={!valid} onPress={() => onSave({ itemName: item.trim(), divisor: n, source: source.trim() || null })}>
          Save
        </Button>
        {valuedAs && (
          <Button size="sm" variant="ghost" onPress={() => onSave(null)}>
            Use {itemName}'s own price
          </Button>
        )}
        <Button size="sm" variant="ghost" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
