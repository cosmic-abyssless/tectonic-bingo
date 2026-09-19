import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GraphNode, Tile, TileCategory } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field, Input, Select } from "../ui/Field";
import { ImageIcon, LockIcon, PlusIcon } from "../ui/icons";
import { TaskEditor, optimisticTasks } from "./TaskEditor";
import type { ExistingLeaf, ExistingCondition } from "./RequirementTreeEditor";
import { collectLeaves, collectLabeledConditions, collectSharedNodeIds } from "../board/requirementTree";
import { thumbUrl } from "../../api/imageVariants";

// Every ITEM leaf on this tile, labeled by which task it's currently under —
// offered to every OTHER task as a reference (see RequirementTreeEditor's
// "+ existing item"), so two tasks can share the same requirement (a claim
// then counts toward both) without retyping the name.
function existingLeavesExcluding(tasks: GraphNode[], excludeTaskIndex: number): ExistingLeaf[] {
  return tasks
    .filter((_, i) => i !== excludeTaskIndex)
    .flatMap((task) =>
      collectLeaves(task)
        .filter((leaf) => leaf.kind === "ITEM" && leaf.itemName)
        .map((leaf) => ({ id: leaf.id, itemName: leaf.itemName!, taskLabel: task.label ?? "Task" })),
    );
}

// Every ALL/ANY/COUNT/SUM block on this tile (including a whole task's own
// root), labeled by which task it's under and a dot-notation index within it
// (1, 1.1, 1.2, 1.1.1, ...) — offered to every OTHER task as a reference (see
// RequirementTreeEditor's "+ existing condition"), so a whole nested
// requirement (not just one item) can be reused as-is instead of rebuilt.
// The label is display-only, computed fresh each render — nothing here is
// persisted.
function existingConditionsExcluding(tasks: GraphNode[], excludeTaskIndex: number): ExistingCondition[] {
  return tasks
    .filter((_, i) => i !== excludeTaskIndex)
    .flatMap((task) =>
      collectLabeledConditions(task).map(({ node, label }) => ({
        id: node.id,
        taskLabel: task.label ?? "Task",
        label: `Condition ${label}`,
        node,
      })),
    );
}

export function TileEditorPanel({ slug, tile, categories, locked, onClose }: { slug: string; tile: Tile | null; categories: TileCategory[]; locked: boolean; onClose: () => void }) {
  return (
    <Dialog isOpen={tile !== null} onClose={onClose} size="lg">
      {tile && <TileEditor slug={slug} tile={tile} categories={categories} locked={locked} onClose={onClose} />}
    </Dialog>
  );
}

function TileEditor({ slug, tile, categories, locked, onClose }: { slug: string; tile: Tile; categories: TileCategory[]; locked: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every mutation funnels through here so a server rejection (e.g. the
  // stage lock) is shown instead of silently reverting the input on refetch.
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }
  async function patch(fields: Partial<Tile>) {
    await run(() => adminApi.updateTile(slug, tile.id, fields));
  }
  async function deleteTile() {
    if (!confirm(`Delete "${tile.name}" and everything on it? This can't be undone.`)) return;
    await run(async () => {
      await adminApi.deleteTile(slug, tile.id);
      onClose();
    });
  }
  async function addTask() {
    const tasks = tile.node.children;
    await run(() => adminApi.createTask(slug, tile.id, { kind: "ALL", label: `Part ${String.fromCharCode(65 + tasks.length)}`, points: 10, description: "Describe the challenge…", children: [] }, tasks.length));
  }
  // Deleting unmounts the task's editor, so its error surfaces here instead.
  async function deleteTask(task: GraphNode) {
    await run(() =>
      optimisticTasks(
        queryClient,
        slug,
        tile.id,
        (tasks) => tasks.filter((t) => t.id !== task.id),
        () => adminApi.deleteTask(slug, task.id),
      ),
    );
  }
  // Local, optimistic like the checkbox/fields above (uncontrolled elsewhere
  // in this form) — bonusEnabled toggles instantly instead of waiting on the
  // refetch, and bonusDraft remembers the last non-zero value so unchecking
  // then re-checking doesn't lose what the mod had typed in.
  const [bonusEnabled, setBonusEnabled] = useState(tile.node.points > 0);
  const [bonusDraft, setBonusDraft] = useState(tile.node.points || 25);
  async function updateBonusPoints(points: number) {
    setBonusEnabled(points > 0);
    if (points > 0) setBonusDraft(points);
    await run(() => adminApi.updateTileBonusPoints(slug, tile.id, points));
  }
  async function uploadImage(file: File) {
    setUploading(true);
    try {
      await run(() => adminApi.uploadTileImage(slug, tile.id, file));
    } finally {
      setUploading(false);
    }
  }
  // Tile-wide (not per-task, unlike existingLeaves/existingConditions —
  // there's no "self" to exclude here): every node with 2+ direct parents
  // anywhere on this tile, so a task's own editor can tell a genuinely
  // shared row apart from one that merely sits inside a shared block.
  const sharedNodeIds = collectSharedNodeIds(tile.node);
  return (
    <>
      <DialogHeader title={tile.name} subtitle={`Row ${tile.boardRow}, Col ${tile.boardCol}`} onClose={onClose} />
      {/* A disabled fieldset inertly disables every control inside it,
          including the nested task/requirement editors. */}
      <fieldset disabled={locked} className="min-w-0 space-y-5 px-5 pb-5 disabled:opacity-60">
        {locked && (
          <Notice tone="warn" icon={<LockIcon />}>
            The board is locked because the bingo is complete. Step the stage back to edit it.
          </Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}

        <div className="flex items-start gap-4">
          <button
            type="button"
            aria-label="Upload tile image"
            onClick={() => fileInputRef.current?.click()}
            className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-outline-strong bg-background text-on-surface-subtle transition-colors hover:border-on-surface/60 hover:text-on-surface-muted disabled:cursor-not-allowed"
          >
            {tile.imageUrl ? <img src={thumbUrl(tile.imageUrl)} alt="" className="size-full object-contain" /> : uploading ? <span className="text-xs">…</span> : <ImageIcon size={20} />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />

          <div className="grid flex-1 grid-cols-2 gap-3">
            <Field label="Name" className="col-span-2">
              <Input defaultValue={tile.name} onBlur={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label="Category">
              <Select defaultValue={tile.categoryId ?? ""} onChange={(e) => patch({ categoryId: e.target.value || null })}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="mt-6 flex h-10 items-center gap-2 text-sm text-on-surface-muted">
              <input type="checkbox" defaultChecked={tile.hasFreezePeriod} onChange={(e) => patch({ hasFreezePeriod: e.target.checked })} className="size-4 accent-accent" />
              Freeze period
            </label>
            {tile.hasFreezePeriod && (
              <Field label="Freeze duration (minutes)" className="col-span-2">
                <Input type="number" className="num w-32" defaultValue={tile.freezeDurationMinutes} onBlur={(e) => patch({ freezeDurationMinutes: Number(e.target.value) || 0 })} />
              </Field>
            )}
            <label className="mt-6 flex h-10 items-center gap-2 text-sm text-on-surface-muted">
              <input
                type="checkbox"
                checked={bonusEnabled}
                onChange={(e) => updateBonusPoints(e.target.checked ? bonusDraft : 0)}
                className="size-4 accent-accent"
              />
              Bonus for full completion
            </label>
            {bonusEnabled && (
              <Field label="Bonus points">
                <Input type="number" className="num w-32" defaultValue={bonusDraft} onBlur={(e) => updateBonusPoints(Number(e.target.value) || 0)} />
              </Field>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-on-surface">
              Tasks <span className="num text-on-surface-subtle">({tile.node.children.length})</span>
            </p>
            <Button size="sm" onPress={addTask}>
              <PlusIcon size={14} /> Add task
            </Button>
          </div>
          <div className="space-y-2">
            {tile.node.children.map((task, i) => (
              <TaskEditor
                key={task.id}
                slug={slug}
                tileId={tile.id}
                task={task}
                previousTaskId={tile.node.children[i - 1]?.id}
                existingLeaves={existingLeavesExcluding(tile.node.children, i)}
                existingConditions={existingConditionsExcluding(tile.node.children, i)}
                sharedNodeIds={sharedNodeIds}
                onDelete={() => deleteTask(task)}
              />
            ))}
          </div>
        </div>

        <Field label="Notes (admin-only)">
          <Input defaultValue={tile.notes ?? ""} onBlur={(e) => patch({ notes: e.target.value || null })} />
        </Field>

        <Button variant="danger" size="sm" onPress={deleteTile}>
          Delete tile
        </Button>
      </fieldset>
    </>
  );
}
