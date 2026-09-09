import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GraphNode, GraphNodeInput } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { adminQueryKeys, useItemGroups } from "../../api/adminQueries";
import { toGraphNodeInput as toInput } from "../board/requirementTree";
import { Button } from "../ui/Button";
import { Field, Input, Textarea } from "../ui/Field";
import { ChevronDownIcon, ChevronRightIcon } from "../ui/icons";
import { RequirementTreeEditor, type ExistingLeaf, type ExistingCondition } from "./RequirementTreeEditor";

const CHECKBOX = "size-4 accent-accent disabled:opacity-40";

// A task is a node that's a direct child of its tile's node. `previousTaskId`
// is the sibling immediately before this one (per the tile's current child
// order) — "requires/withholds until previous" resolves to that specific
// node id, per docs/node-graph-model.md §6.
export function TaskEditor({
  slug,
  task,
  previousTaskId,
  existingLeaves,
  existingConditions,
  sharedNodeIds,
  onDeleted,
}: {
  slug: string;
  task: GraphNode;
  previousTaskId?: string;
  existingLeaves?: ExistingLeaf[];
  existingConditions?: ExistingCondition[];
  sharedNodeIds: Set<string>;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const itemGroups = useItemGroups().data?.itemGroups ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });

  // The server replaces the whole node (fields + subtree) on every PATCH —
  // always send the full current input, overridden with just the changed
  // field(s), so editing one field can't wipe another (e.g. a label edit
  // wiping the requirement tree, or a tree edit resetting points to 0).
  async function patch(fields: Partial<GraphNodeInput>) {
    await adminApi.updateTask(slug, task.id, { ...toInput(task), ...fields });
    invalidate();
  }
  async function deleteTask() {
    await adminApi.deleteTask(slug, task.id);
    invalidate();
    onDeleted();
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
    <div className="overflow-hidden rounded-md border border-line bg-bg">
      <button
        type="button"
        aria-label={`${expanded ? "Collapse" : "Expand"} task: ${task.label}`}
        onClick={() => setExpanded((e) => !e)}
        className="flex h-10 w-full items-center justify-between px-3 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="text-sm font-medium text-fg">
          {task.label}{" "}
          <span className="font-normal text-fg-subtle">
            — <span className="num">{task.points}</span> pts{isManual ? " · manual" : ""}
          </span>
        </span>
        <span className="text-fg-subtle">{expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-line px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
            <div className="flex w-fit overflow-hidden rounded-md border border-line-strong">
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
                  className={`h-8 px-3 text-xs font-medium transition-colors ${i > 0 ? "border-l border-line-strong" : ""} ${
                    isManual === manual ? "bg-accent text-accent-fg" : "bg-bg text-fg-muted hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <label title="Can't submit until the previous task is completed" className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" checked={requiresPrevious} disabled={!previousTaskId} onChange={(e) => patch({ submitGateNodeId: e.target.checked ? previousTaskId : null })} className={CHECKBOX} />
              Requires previous task
            </label>
            <label title="Can complete early, but points stay 0 until the previous task completes" className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" checked={withholdsPoints} disabled={!previousTaskId} onChange={(e) => patch({ pointsGateNodeId: e.target.checked ? previousTaskId : null })} className={CHECKBOX} />
              Withhold points until previous
            </label>
            <label title="Player may submit an empty-state screenshot beforehand" className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" checked={task.allowsPreLoad} onChange={(e) => patch({ allowsPreLoad: e.target.checked })} className={CHECKBOX} />
              Allows pre-load screenshot
            </label>
          </div>

          {!isManual && (
            <Field label="Requirement" as="div">
              <RequirementTreeEditor
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

          <Button variant="danger" size="sm" onPress={deleteTask}>
            Delete task
          </Button>
        </div>
      )}
    </div>
  );
}
