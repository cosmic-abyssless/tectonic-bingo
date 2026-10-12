// The mod queue's Edit form (CONTEXT.md "Submission", Editing), kept apart from EditSubmissionModal so building it
// from a queue row, the options it offers and the request it sends can be tested without rendering it.
import { proofRequirements, type EditSubmissionInput, type ModSubmissionRow, type SubmissionKind, type SubmissionStatus, type Tile } from "@bingo/shared";
import { collectLeaves } from "../board/requirementTree";
import { leafLabel } from "../board/labels";
import { toLocalInput } from "../ui/timeRange";
import type { SelectOption } from "../ui/Select";

export interface EditClaim {
  /** "" until an Item is picked. */
  nodeId: string;
  /** As typed, so the field can be cleared while typing; checked by formProblem. */
  quantity: string;
}

export interface EditForm {
  submittedByUserId: string;
  kind: SubmissionKind;
  /** A drop's Tile (where its Claims are) or a proof's own. Shared by both kinds, so flipping the kind keeps it. */
  tileId: string;
  /** A proof's Task, "" for none (a Tile-wide requirement). */
  taskId: string;
  /** A drop's. Kept while it's a proof, so flipping back loses nothing; only sent for a drop. */
  claims: EditClaim[];
  /** The viewer's local time, as a datetime-local input holds it. */
  submittedAt: string;
  status: SubmissionStatus;
  reviewerNotes: string;
}

const EMPTY_CLAIM: EditClaim = { nodeId: "", quantity: "1" };

/** The form as the row stands. */
export function initialEditForm(row: ModSubmissionRow): EditForm {
  const s = row.submission;
  return {
    submittedByUserId: s.submittedByUserId,
    kind: s.kind,
    tileId: s.kind === "proof" ? (s.proofTileId ?? row.tile.id) : row.tile.id,
    taskId: s.proofTaskId ?? "",
    claims: row.claims.length > 0 ? row.claims.map((c) => ({ nodeId: c.nodeId, quantity: String(c.quantity) })) : [EMPTY_CLAIM],
    submittedAt: toLocalInput(s.submittedAt),
    status: s.status,
    reviewerNotes: s.reviewerNotes ?? "",
  };
}

/** Another Tile: its Claims and Task belonged to the old one. */
export function withTile(form: EditForm, tileId: string): EditForm {
  return tileId === form.tileId ? form : { ...form, tileId, taskId: "", claims: [EMPTY_CLAIM] };
}

export function withClaim(form: EditForm, index: number, change: Partial<EditClaim>): EditForm {
  return { ...form, claims: form.claims.map((c, i) => (i === index ? { ...c, ...change } : c)) };
}

export function withClaimAdded(form: EditForm): EditForm {
  return { ...form, claims: [...form.claims, EMPTY_CLAIM] };
}

/** The last one can't go: a drop needs one, so it's emptied instead. */
export function withClaimRemoved(form: EditForm, index: number): EditForm {
  const claims = form.claims.filter((_, i) => i !== index);
  return { ...form, claims: claims.length > 0 ? claims : [EMPTY_CLAIM] };
}

/** Whole and at least 1, or null. */
function quantityOf(text: string): number | null {
  const n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n >= 1 ? n : null;
}

/** Why the form can't be sent yet, or null. The server checks it all again; this only keeps Save from a sure 400. */
export function formProblem(form: EditForm, now: number): string | null {
  if (!form.submittedByUserId) return "Pick the Player it's credited to";
  if (!form.tileId) return "Pick a Tile";
  if (form.kind === "drop") {
    if (form.claims.some((c) => !c.nodeId)) return "Pick an Item for each line, or remove it";
    if (form.claims.some((c) => quantityOf(c.quantity) === null)) return "Each quantity must be a whole number, at least 1";
  }
  const at = Date.parse(form.submittedAt);
  if (Number.isNaN(at)) return "Enter the submitted time";
  if (at > now) return "The submitted time can't be in the future";
  return null;
}

/**
 * The request for the form, as of the row it was opened from. An untouched submitted time sends the row's own: the
 * input only goes down to the minute, and its seconds would otherwise read as an edit.
 */
export function editRequest(form: EditForm, row: ModSubmissionRow, force: boolean): EditSubmissionInput {
  const s = row.submission;
  const submittedAt = form.submittedAt === toLocalInput(s.submittedAt) ? s.submittedAt : new Date(form.submittedAt).toISOString();
  return {
    expectedUpdatedAt: s.updatedAt,
    submittedByUserId: form.submittedByUserId,
    submittedAt,
    status: form.status,
    reviewerNotes: form.status === "pending" ? null : form.reviewerNotes || null,
    kind: form.kind,
    ...(form.kind === "drop"
      ? { claims: form.claims.map((c) => ({ nodeId: c.nodeId, quantity: quantityOf(c.quantity) ?? 1 })) }
      : { proofTileId: form.tileId, proofTaskId: form.taskId || null }),
    ...(force ? { force: true } : {}),
  };
}

/** Whether the form differs from the row as it stands (what Save would send would change something). */
export function isEdited(form: EditForm, row: ModSubmissionRow): boolean {
  const asSent = (f: EditForm) => JSON.stringify(editRequest(f, row, false));
  return asSent(form) !== asSent(initialEditForm(row));
}

/**
 * The Items a Claim on this Tile can name, under the Part they're on: every Item and manual Task, as the Submit flow
 * labels them, once each (an Item shared by two Parts sits under the first). Picked on another line is disabled, as
 * a Submission claims each once. A claimed one no longer on the board stays on offer, so the Claim can be kept.
 */
export function claimOptions(tile: Tile | undefined, row: ModSubmissionRow, pickedElsewhere: Set<string>): SelectOption[] {
  const seen = new Set<string>();
  const options: SelectOption[] = [];
  for (const part of tile?.node.children ?? []) {
    const partLabel = part.label || "Part";
    for (const leaf of collectLeaves(part)) {
      if (seen.has(leaf.id)) continue;
      seen.add(leaf.id);
      const label = leaf.kind === "MANUAL" ? "Manual review" : leafLabel(leaf);
      options.push({ value: leaf.id, label, group: partLabel, selectedLabel: `${label} · ${partLabel}`, disabled: pickedElsewhere.has(leaf.id) });
    }
  }
  for (const leaf of row.leaves) {
    if (seen.has(leaf.id) || tile?.id !== row.tile.id) continue;
    options.push({ value: leaf.id, label: leaf.label ?? "Item", group: "No longer on the board", disabled: pickedElsewhere.has(leaf.id) });
  }
  return options;
}

/**
 * A proof's Task choice on this Tile: none when its requirement is Tile-wide (a proof there is for the whole Tile),
 * else each Part, those needing one first, and "None" for a Tile that needs none.
 */
export function proofTaskOptions(tile: Tile | undefined): SelectOption[] | null {
  if (!tile) return null;
  const requirements = proofRequirements(tile);
  if (requirements.some((r) => r.taskId === null)) return null;
  const required = new Set(requirements.map((r) => r.taskId));
  const parts = [...tile.node.children].sort((a, b) => Number(required.has(b.id)) - Number(required.has(a.id)));
  return [
    ...(required.size === 0 ? [{ value: "", label: "None" }] : []),
    ...parts.map((p) => ({ value: p.id, label: required.has(p.id) ? (p.label || "Task") : `${p.label || "Task"} (needs no Proof screenshot)` })),
  ];
}
