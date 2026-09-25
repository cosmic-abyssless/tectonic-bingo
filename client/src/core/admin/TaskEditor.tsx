import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BoardResponse, GraphNode, GraphNodeInput } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { queryKeys } from "../../api/queries";
import { adminQueryKeys, useItemGroups } from "../../api/adminQueries";
import { previewGraphNode, toGraphNodeInput as toInput } from "../board/requirementTree";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field, Input, Textarea } from "../ui/Field";
import { ChevronDownIcon, ChevronRightIcon } from "../ui/icons";
import { RequirementTreeEditor, type ExistingLeaf, type ExistingCondition } from "./RequirementTreeEditor";

const CHECKBOX = "size-4 accent-accent disabled:opacity-40";

// Edits to a tile's tasks show up in the cached board immediately and roll
// back if the server rejects them, so tree edits and deletes don't wait on
// the round trip.
export function optimisticTasks(queryClient: QueryClient, slug: string, tileId: string, update: (tasks: GraphNode[]) => GraphNode[], request: () => Promise<unknown>) {
  return optimisticUpdate<BoardResponse>(
    queryClient,
    queryKeys.board(slug),
    (board) => ({ ...board, tiles: board.tiles.map((tile) => (tile.id === tileId ? { ...tile, node: { ...tile.node, children: update(tile.node.children) } } : tile)) }),
    request,
  );
}

// A task is a node that's a direct child of its tile's node. `previousTaskId`
// is the sibling immediately before this one (per the tile's current child
// order) — "requires/withholds until previous" resolves to that specific
// node id, per docs/node-graph-model.md §6.
export function TaskEditor({
  slug,
  tileId,
  task,
  previousTaskId,
  existingLeaves,
  existingConditions,
  sharedNodeIds,
  onDelete,
}: {
  slug: string;
  tileId: string;
  task: GraphNode;
  previousTaskId?: string;
  existingLeaves?: ExistingLeaf[];
  existingConditions?: ExistingCondition[];
  sharedNodeIds: Set<string>;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemGroups = useItemGroups().data?.itemGroups ?? [];

  // The server replaces the whole node (fields + subtree) on every PATCH —
  // always send the full current input, overridden with just the changed
  // field(s), so editing one field can't wipe another (e.g. a label edit
  // wiping the requirement tree, or a tree edit resetting points to 0).
  // Resolves whether it saved (a failure shows in the editor), so a caller can act once the change is in.
  async function patch(fields: Partial<GraphNodeInput>): Promise<boolean> {
    const input = { ...toInput(task), ...fields };
    setError(null);
    try {
      await optimisticTasks(
        queryClient,
        slug,
        tileId,
        (tasks) => tasks.map((t) => (t.id === task.id ? previewGraphNode(task.bingoId, input) : t)),
        () => adminApi.updateTask(slug, task.id, input),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    }
  }
  async function saveAsGroup(itemNames: string[]) {
    const name = prompt("Name for the new item group:", "");
    if (!name?.trim()) return null;
    const { itemGroup } = await adminApi.createItemGroup({ name: name.trim(), itemNames });
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.itemGroups });
    return itemGroup;
  }

  const isManual = task.kind === "MANUAL";
  const requiresPrevious = task.submitGateNodeId != null;
  const withholdsPoints = task.pointsGateNodeId != null;

  return (
    <div className="overflow-hidden rounded-md border border-outline bg-background">
      <button
        type="button"
        aria-label={`${expanded ? "Collapse" : "Expand"} task: ${task.label}`}
        onClick={() => setExpanded((e) => !e)}
        className="flex h-10 w-full items-center justify-between px-3 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="text-sm font-medium text-on-surface">
          {task.label}{" "}
          <span className="font-normal text-on-surface-subtle">
            — <span className="num">{task.points}</span> pts{isManual ? " · manual" : ""}
          </span>
        </span>
        <span className="text-on-surface-subtle">{expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-outline px-3 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Label">
              <Input defaultValue={task.label ?? ""} onBlur={(e) => patch({ label: e.target.value })} />
            </Field>
            <Field label="Points">
              <Input type="number" className="num" defaultValue={task.points} onBlur={(e) => patch({ points: Number(e.target.value) || 0 })} />
            </Field>
          </div>

          <Field label="Description">
            <Textarea defaultValue={task.description ?? ""} onBlur={(e) => patch({ description: e.target.value })} rows={2} className="resize-none" />
          </Field>

          <Field label="Scoring mode" as="div">
            <div className="flex w-fit overflow-hidden rounded-md border border-outline-strong">
              {(
                [
                  ["Automatic", false],
                  ["Manual (mod judges)", true],
                ] as const
              ).map(([label, manual], i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => patch({ kind: manual ? "MANUAL" : "ALL", children: [] })}
                  className={`h-8 px-3 text-xs font-medium transition-colors ${i > 0 ? "border-l border-outline-strong" : ""} ${
                    isManual === manual ? "bg-accent text-on-accent" : "bg-background text-on-surface-muted hover:text-on-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <label title="Can't submit until the previous task is completed" className="flex items-center gap-2 text-xs text-on-surface-muted">
              <input type="checkbox" checked={requiresPrevious} disabled={!previousTaskId} onChange={(e) => patch({ submitGateNodeId: e.target.checked ? previousTaskId : null })} className={CHECKBOX} />
              Requires previous task
            </label>
            <label title="Can complete early, but points stay 0 until the previous task completes" className="flex items-center gap-2 text-xs text-on-surface-muted">
              <input type="checkbox" checked={withholdsPoints} disabled={!previousTaskId} onChange={(e) => patch({ pointsGateNodeId: e.target.checked ? previousTaskId : null })} className={CHECKBOX} />
              Withhold points until previous
            </label>
            <label title="Player may submit an empty-state screenshot beforehand" className="flex items-center gap-2 text-xs text-on-surface-muted">
              <input type="checkbox" checked={task.allowsPreLoad} onChange={(e) => patch({ allowsPreLoad: e.target.checked })} className={CHECKBOX} />
              Allows pre-load screenshot
            </label>
          </div>

          {!isManual && (
            <Field label="Requirement" as="div">
              <RequirementTreeEditor
                slug={slug}
                root={toInput(task)}
                itemGroups={itemGroups}
                onChange={(updated) => patch(updated)}
                onSaveAsGroup={saveAsGroup}
                existingLeaves={existingLeaves}
                existingConditions={existingConditions}
                sharedNodeIds={sharedNodeIds}
              />
            </Field>
          )}

          <Field label="Notes (shown to players)">
            <Input defaultValue={task.notes ?? ""} onBlur={(e) => patch({ notes: e.target.value || null })} />
          </Field>

          {error && <Notice tone="danger">{error}</Notice>}

          <Button variant="danger" size="sm" onPress={onDelete}>
            Delete task
          </Button>
        </div>
      )}
    </div>
  );
}
