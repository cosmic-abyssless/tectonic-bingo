import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { GraphNode, GraphNodeInput } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, optimisticDraftBoard, useItemGroups } from "../../api/adminQueries";
import { previewGraphNode, toGraphNodeInput as toInput } from "../board/requirementTree";
import { buildLeafClaimMaps } from "../board/taskClaims";
import { buildRequirementTree } from "../../headless/boardModel";
import { ThemeProvider } from "../../themes/ThemeProvider";
import { useSlot } from "../../themes/context";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field, Input, Textarea } from "../ui/Field";
import { RequirementTreeEditor, type ExistingLeaf, type ExistingCondition } from "./RequirementTreeEditor";
import { Disclosure } from "../ui/Disclosure";
import { Checkbox } from "../ui/Checkbox";
import { SegmentedControl } from "../ui/SegmentedControl";
import { TagsField } from "./TagsField";


const SCORING_MODES = [
  { id: "automatic", label: "Automatic" },
  { id: "manual", label: "Manual (mod judges)" },
] as const;

// Edits to a tile's tasks show up in the cached board immediately and roll
// back if the server rejects them, so tree edits and deletes don't wait on
// the round trip.
export function optimisticTasks(queryClient: QueryClient, slug: string, tileId: string, update: (tasks: GraphNode[]) => GraphNode[], request: () => Promise<unknown>) {
  return optimisticDraftBoard(
    queryClient,
    slug,
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
  themeKey,
  tileId,
  task,
  previousTaskId,
  existingLeaves,
  existingConditions,
  sharedNodeIds,
  tileRequiresProof,
  locked,
  onDelete,
}: {
  slug: string;
  /** The bingo's own theme, for the "Preview for Players". */
  themeKey: string;
  tileId: string;
  task: GraphNode;
  /** The Tile requires a Proof screenshot Tile-wide, so no Task has its own (the setting is hidden). */
  tileRequiresProof: boolean;
  previousTaskId?: string;
  existingLeaves?: ExistingLeaf[];
  existingConditions?: ExistingCondition[];
  sharedNodeIds: Set<string>;
  /** The board is locked: the task still opens, to be looked through, but nothing in it can be changed. */
  locked: boolean;
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

  // Controlled, so the editor itself mounts only once the Task is opened.
  return (
    <Disclosure
      variant="nested"
      isExpanded={expanded}
      onExpandedChange={setExpanded}
      triggerLabel={`${expanded ? "Collapse" : "Expand"} task: ${task.label}`}
      title={
        <span className="flex-1 text-sm font-medium text-on-surface">
          {task.label}{" "}
          <span className="font-normal text-on-surface-subtle">
            — <span className="num">{task.points}</span> pts{isManual ? " · manual" : ""}
          </span>
        </span>
      }
    >
      {expanded && (
        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
          {/* Locked, the editing controls are disabled in fieldsets, leaving "Preview for Players" between them open. */}
          <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
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

            <TagsField slug={slug} owner={{ partId: task.id }} locked={locked} hint="Words the board's search finds this tile by, for this task. Players never see them." />

            <Field label="Scoring mode" as="div">
              <SegmentedControl
                size="sm"
                aria-label="Scoring mode"
                options={SCORING_MODES}
                value={isManual ? "manual" : "automatic"}
                onChange={(mode) => patch({ kind: mode === "manual" ? "MANUAL" : "ALL", children: [] })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Checkbox size="xs" muted checked={requiresPrevious} disabled={!previousTaskId} onChange={(on) => patch({ submitGateNodeId: on ? previousTaskId : null })} hint="Can't submit until the previous task is completed">
                Requires previous task
              </Checkbox>
              <Checkbox size="xs" muted checked={withholdsPoints} disabled={!previousTaskId} onChange={(on) => patch({ pointsGateNodeId: on ? previousTaskId : null })} hint="Can complete early; points stay 0 until the previous task completes">
                Withhold points until previous
              </Checkbox>
              <Checkbox size="xs" muted checked={task.allowsPreLoad} onChange={(allowsPreLoad) => patch({ allowsPreLoad })} hint="Players may prepare it before the bingo is live, e.g. pre-load a chest">
                Allows pre-load
              </Checkbox>
              {!tileRequiresProof && (
                <Checkbox
                  size="xs"
                  muted
                  checked={task.requiresProof}
                  onChange={(requiresProof) => patch({ requiresProof, proofNote: requiresProof ? task.proofNote : null })}
                  hint="Each player posts a screenshot of the starting state before their drops on this task count"
                >
                  Needs a Proof screenshot
                </Checkbox>
              )}
            </div>

            {!tileRequiresProof && task.requiresProof && (
              <Field label="Proof screenshot message" hint="Optional, shown to Players as written, e.g. Show an empty pool before your drops count.">
                <Input key={`proof-note-${task.id}`} defaultValue={task.proofNote ?? ""} maxLength={200} onBlur={(e) => patch({ proofNote: e.target.value || null })} />
              </Field>
            )}
          </fieldset>

          {!isManual && (
            <Field label="Requirement" as="div">
              <fieldset disabled={locked} className="min-w-0 disabled:opacity-60">
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
              </fieldset>
              <PlayerPreview task={task} themeKey={themeKey} />
            </Field>
          )}

          <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
            <Field label="Notes (shown to players)">
              <Input defaultValue={task.notes ?? ""} onBlur={(e) => patch({ notes: e.target.value || null })} />
            </Field>

            {error && <Notice tone="danger">{error}</Notice>}

            <Button variant="danger" size="sm" onPress={onDelete}>
              Delete task
            </Button>
          </fieldset>
        </div>
      )}
    </Disclosure>
  );
}

// "Preview for Players": the task as a player's checklist draws it, in the bingo's own theme, before any progress (every
// row reads as not done). `task` already carries each tree edit (optimisticTasks), so this follows the editor as it's
// changed. Collapsed by default; the theme only loads once it's opened.
function PlayerPreview({ task, themeKey }: { task: GraphNode; themeKey: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure variant="nested" isExpanded={open} onExpandedChange={setOpen} className="mt-3" title={<span className="flex-1 text-xs font-medium text-on-surface-muted">Preview for Players</span>}>
      {open && (
        <ThemeProvider themeKey={themeKey} fallback={<p className="text-xs text-on-surface-subtle">Loading the bingo's theme…</p>}>
          <PreviewTree task={task} />
        </ThemeProvider>
      )}
    </Disclosure>
  );
}

const NO_CLAIMS = buildLeafClaimMaps([]);

function PreviewTree({ task }: { task: GraphNode }) {
  const RequirementTree = useSlot("RequirementTree");
  const tree = buildRequirementTree(task, NO_CLAIMS, new Map());
  return (
    <div className="rounded-md border border-outline bg-surface p-3 text-on-surface">
      {tree ? <RequirementTree node={tree} root /> : <p className="text-xs text-on-surface-subtle">Nothing to preview.</p>}
    </div>
  );
}
