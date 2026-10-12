import { useState } from "react";
import { isScreenshotPending, type EditSubmissionRefusal, type EditWarning, type ModSubmissionRow, type SubmissionKind, type SubmissionStatus } from "@bingo/shared";
import { fullBoard, useBingo, useBoard, useEditSubmission } from "../../api/queries";
import { ApiError } from "../../api/client";
import { tileMatchesSearch } from "../board/tileSearch";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Button, IconButton } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field, Input, Textarea } from "../ui/Field";
import { PlusIcon, TrashIcon } from "../ui/icons";
import { SearchableSelect } from "../ui/SearchableSelect";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Select } from "../ui/Select";
import { displayName } from "../ui/user";
import { toLocalInput } from "../ui/timeRange";
import { ScreenshotThumb } from "../submissions/ScreenshotThumb";
import {
  claimOptions,
  editRequest,
  formProblem,
  initialEditForm,
  isEdited,
  proofTaskOptions,
  withClaim,
  withClaimAdded,
  withClaimRemoved,
  withTile,
  type EditForm,
} from "./editSubmissionForm";

const KINDS: { id: SubmissionKind; label: string }[] = [
  { id: "drop", label: "Drop" },
  { id: "proof", label: "Proof screenshot" },
];

const STATUSES: { id: SubmissionStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

/**
 * Edits a Submission from the mod queue (CONTEXT.md "Submission", Editing): everything but its screenshots and Team, in
 * any status. Render it unconditionally (Dialog's exit animation); `row` is the Submission as the queue has it now.
 */
export function EditSubmissionModal({ slug, row, isOpen, onClose }: { slug: string; row: ModSubmissionRow | undefined; isOpen: boolean; onClose: () => void }) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      {/* Keyed, so opening another Submission starts its own form. */}
      {row && <EditSubmissionForm key={row.submission.id} slug={slug} row={row} onClose={onClose} />}
    </Dialog>
  );
}

function EditSubmissionForm({ slug, row, onClose }: { slug: string; row: ModSubmissionRow; onClose: () => void }) {
  const { data: shell } = useBingo(slug);
  // Moderators always get the full board.
  const board = fullBoard(useBoard(slug).data);
  const edit = useEditSubmission(slug);
  // The Submission as the form was opened (or reloaded): its updatedAt is what the save says it's editing. A review or
  // edit by someone else since then refreshes `row`, not this, so the save is refused rather than undoing it unseen.
  const [base, setBase] = useState(row);
  const [form, setForm] = useState(() => initialEditForm(row));
  // The warnings the last save was refused for: Save becomes Save anyway until the form changes again.
  const [warnings, setWarnings] = useState<EditWarning[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(next: EditForm) {
    setForm(next);
    setWarnings(null);
    setError(null);
  }

  function reload() {
    setBase(row);
    setForm(initialEditForm(row));
    setWarnings(null);
    setStale(false);
    setError(null);
  }

  async function save() {
    setError(null);
    try {
      await edit.mutateAsync({ submissionId: base.submission.id, input: editRequest(form, base, warnings !== null) });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "edit_warnings") setWarnings((e.body as EditSubmissionRefusal).warnings);
      else if (e instanceof ApiError && e.code === "stale") setStale(true);
      else setError(e instanceof Error ? e.message : "Couldn't save the edit");
    }
  }

  const team = shell?.teams.find((t) => t.id === base.team.id);
  // Its Team's Players, and whoever it's credited to now even if they've left the Team since.
  const playerOptions = [
    ...(team?.members ?? []).map((m) => ({ id: m.user.id, label: displayName(m.user) })),
    ...(base.submittedByUser && !team?.members.some((m) => m.user.id === base.submittedByUser!.id) ? [{ id: base.submittedByUser.id, label: displayName(base.submittedByUser) }] : []),
  ].sort((a, b) => a.label.localeCompare(b.label));

  // Every Tile, by category in board order, as the Submit flow lists them (without hiding done or frozen ones).
  const tiles = board?.tiles ?? [];
  const categories = [...(shell?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const tileOptions = [...categories, null].flatMap((cat) =>
    tiles
      .filter((t) => t.categoryId === (cat?.id ?? null))
      .sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol)
      .map((t) => ({ id: t.id, label: t.name, group: cat?.label })),
  );
  const tile = tiles.find((t) => t.id === form.tileId);
  const taskOptions = form.kind === "proof" ? proofTaskOptions(tile) : null;

  const problem = formProblem(form, Date.now());
  const edited = isEdited(form, base);
  const first = base.screenshots[0];

  return (
    <>
      <DialogHeader title="Edit submission" subtitle={`${base.team.name} · ${base.tile.name}`} onClose={onClose} />
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <ScreenshotThumb url={first?.storageUrl} pending={isScreenshotPending(first)} />
          <p className="text-sm text-on-surface-muted">
            {base.screenshots.length === 1 ? "Its screenshot" : `Its ${base.screenshots.length} screenshots`} and Team can't be changed. Saving re-scores {base.team.name} when it counts for points, before or after.
          </p>
        </div>

        <Field label="Player" as="div" hint={`Who it's credited to, on ${base.team.name}. Whoever uploaded it stays as the poster.`}>
          <SearchableSelect value={form.submittedByUserId} options={playerOptions} placeholder="Search players…" onChange={(id) => change({ ...form, submittedByUserId: id })} />
        </Field>

        <Field label="Kind" as="div">
          <SegmentedControl aria-label="Kind" options={KINDS} value={form.kind} onChange={(kind) => change({ ...form, kind })} fill />
        </Field>

        <Field label="Tile" as="div">
          <SearchableSelect
            value={form.tileId}
            options={tileOptions}
            placeholder={board ? "Search tiles…" : "Loading tiles…"}
            readOnly={!board}
            matches={(option, q) => {
              const t = tiles.find((x) => x.id === option.id);
              return !!t && tileMatchesSearch(t, q, board?.tileTags[t.id]);
            }}
            onChange={(id) => change(withTile(form, id))}
          />
        </Field>

        {form.kind === "drop" && tile && (
          <Field label="Items" as="div" hint="A changed Item or quantity gets its Drop value at today's prices; the rest keep theirs.">
            <div className="space-y-2">
              {form.claims.map((claim, i) => {
                const elsewhere = new Set(form.claims.filter((_, j) => j !== i).map((c) => c.nodeId));
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Select aria-label="Item" value={claim.nodeId} placeholder="Pick an Item…" options={claimOptions(tile, base, elsewhere)} onChange={(nodeId) => change(withClaim(form, i, { nodeId }))} />
                    </div>
                    {/* Sized by a wrapper: Input is full width whatever its className says. */}
                    <div className="w-20 shrink-0">
                      <Input
                        type="number"
                        aria-label="Quantity"
                        min={1}
                        step={1}
                        value={claim.quantity}
                        onChange={(e) => change(withClaim(form, i, { quantity: e.target.value }))}
                        className="num"
                      />
                    </div>
                    <IconButton label="Remove item" size="sm" onPress={() => change(withClaimRemoved(form, i))} isDisabled={form.claims.length === 1}>
                      <TrashIcon />
                    </IconButton>
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" onPress={() => change(withClaimAdded(form))}>
                <PlusIcon /> Add item
              </Button>
            </div>
          </Field>
        )}

        {form.kind === "proof" && taskOptions && (
          <Field label="Task" as="div">
            <Select value={form.taskId} placeholder="Pick a Task…" options={taskOptions} onChange={(taskId) => change({ ...form, taskId })} />
          </Field>
        )}
        {form.kind === "proof" && tile && !taskOptions && <p className="text-sm text-on-surface-muted">{tile.name} needs one Proof screenshot for all its Tasks.</p>}

        <Field label="Submitted" hint="Your local time.">
          <Input type="datetime-local" value={form.submittedAt} max={toLocalInput(new Date().toISOString())} onChange={(e) => change({ ...form, submittedAt: e.target.value })} className="num" />
        </Field>

        <Field label="Status" as="div">
          <SegmentedControl aria-label="Status" options={STATUSES} value={form.status} onChange={(status) => change({ ...form, status })} fill />
        </Field>

        <Field label="Notes" hint={form.status === "pending" ? "A pending submission has no review, so its notes are cleared." : undefined}>
          <Textarea
            value={form.status === "pending" ? "" : form.reviewerNotes}
            onChange={(e) => change({ ...form, reviewerNotes: e.target.value })}
            disabled={form.status === "pending"}
            placeholder="Visible to the submitting player…"
            rows={2}
            className="resize-none"
          />
        </Field>

        {warnings && (
          <Notice tone="warn">
            <p>
              <strong>This breaks the Submit flow's rules:</strong>
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {warnings.map((w) => (
                <li key={`${w.code}|${w.message}`}>{w.message}</li>
              ))}
            </ul>
            <p className="mt-1">Save anyway to keep it: scoring still applies Exclusive Items and gates by itself.</p>
          </Notice>
        )}
        {stale && (
          <Notice tone="warn">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Someone reviewed or edited this submission since you opened it.</span>
              <Button size="sm" onPress={reload}>
                Reload it
              </Button>
            </div>
          </Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {problem && edited && <span className="mr-auto text-xs text-on-surface-subtle">{problem}</span>}
          <Button variant="ghost" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onPress={save} isDisabled={!!problem || !edited || stale || edit.isPending}>
            {edit.isPending ? "Saving…" : warnings ? "Save anyway" : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}
