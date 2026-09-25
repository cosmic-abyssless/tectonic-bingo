import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PieceValue, UnvaluedItem } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, usePieceValues } from "../../api/adminQueries";
import { Button, IconButton } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Field, Input } from "../ui/Field";
import { formatGp, formatGpExact } from "../ui/gp";
import { PlusIcon, XIcon } from "../ui/icons";
import { WikiIcon } from "../ui/ItemIcon";
import { WikiItemLink } from "../ui/WikiItemLink";
import { ItemSearchInput } from "../ui/ItemSearchInput";

type OtherPiece = { itemName: string; quantity: number };
type PieceValueInput = { pieceItemName: string; wholeItemName: string; wholeQuantity: number; divisor: number; otherPieces: OtherPiece[] };
// An other piece being edited: the quantity as typed, and a stable key so removing a row doesn't reshuffle inputs.
type OtherPieceDraft = { key: number; itemName: string; quantity: string };

let nextDraftKey = 0;
const draftOf = (o?: OtherPiece): OtherPieceDraft => ({ key: nextDraftKey++, itemName: o?.itemName ?? "", quantity: String(o?.quantity ?? 1) });
const isWholeNumber = (raw: string) => Number.isInteger(Number(raw)) && Number(raw) >= 1;

/** "(Ultor ring − Berserker ring − 3× Chromium ingot) ÷ 1", or "Abyssal bludgeon ÷ 3" with no other pieces; each item links to its wiki page. */
function Formula({ pieceValue }: { pieceValue: PieceValueInput }) {
  const others = pieceValue.otherPieces;
  return (
    <span className="min-w-0">
      {others.length > 0 && "("}
      {pieceValue.wholeQuantity > 1 && `${pieceValue.wholeQuantity.toLocaleString()}× `}
      <WikiItemLink name={pieceValue.wholeItemName} />
      {others.map((o) => (
        <Fragment key={o.itemName}>
          {" − "}
          {o.quantity > 1 && `${o.quantity}× `}
          <WikiItemLink name={o.itemName} />
        </Fragment>
      ))}
      {others.length > 0 && ")"} ÷ {pieceValue.divisor}
    </span>
  );
}

interface PieceValueFormProps {
  initial?: Partial<PieceValueInput>;
  submitLabel: string;
  onSave: (payload: PieceValueInput) => Promise<void>;
  onCancel?: () => void;
}

function PieceValueForm({ initial, submitLabel, onSave, onCancel }: PieceValueFormProps) {
  const [piece, setPiece] = useState(initial?.pieceItemName ?? "");
  const [whole, setWhole] = useState(initial?.wholeItemName ?? "");
  const [wholeQuantity, setWholeQuantity] = useState(String(initial?.wholeQuantity ?? 1));
  const [divisor, setDivisor] = useState(String(initial?.divisor ?? 1));
  const [others, setOthers] = useState<OtherPieceDraft[]>(() => (initial?.otherPieces ?? []).map(draftOf));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filledOthers = others.filter((o) => o.itemName.trim());
  const valid = piece.trim() && whole.trim() && isWholeNumber(wholeQuantity) && isWholeNumber(divisor) && filledOthers.every((o) => isWholeNumber(o.quantity));
  const setOther = (key: number, patch: Partial<OtherPieceDraft>) => setOthers((list) => list.map((o) => (o.key === key ? { ...o, ...patch } : o)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        pieceItemName: piece.trim(),
        wholeItemName: whole.trim(),
        wholeQuantity: Number(wholeQuantity),
        divisor: Number(divisor),
        otherPieces: filledOthers.map((o) => ({ itemName: o.itemName.trim(), quantity: Number(o.quantity) })),
      });
      // The add form (no Cancel) clears for the next one; an edit form is closed by its caller.
      if (!onCancel) {
        setPiece("");
        setWhole("");
        setWholeQuantity("1");
        setDivisor("1");
        setOthers([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save piece value");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_1fr_6rem]">
        <Field label="Piece">
          <ItemSearchInput ariaLabel="Piece" placeholder="e.g. Ultor vestige" value={piece} onChange={setPiece} onPickItem={setPiece} />
        </Field>
        {/* Read left to right as the formula: piece = how many × whole item ÷ N (Dizana's quiver = 4000 × Sunfire splinters). */}
        <Field label="How many">
          <Input aria-label="How many of the whole item" type="number" min={1} step={1} value={wholeQuantity} onChange={(e) => setWholeQuantity(e.target.value)} />
        </Field>
        <Field label="Whole item">
          <ItemSearchInput ariaLabel="Whole item" placeholder="e.g. Ultor ring" value={whole} onChange={setWhole} onPickItem={setWhole} />
        </Field>
        <Field label="Divided by">
          <Input aria-label="Divided by" type="number" min={1} step={1} value={divisor} onChange={(e) => setDivisor(e.target.value)} />
        </Field>
      </div>
      <Field as="div" label="Other pieces" hint="The other items that go into the whole item, subtracted before dividing (e.g. the Berserker ring and 3 Chromium ingots in an Ultor ring). Optional.">
        <div className="space-y-2">
          {others.map((o) => (
            <div key={o.key} className="flex items-center gap-2">
              <ItemSearchInput
                ariaLabel="Other piece"
                placeholder="e.g. Chromium ingot"
                containerClassName="min-w-0 flex-1"
                value={o.itemName}
                onChange={(itemName) => setOther(o.key, { itemName })}
                onPickItem={(itemName) => setOther(o.key, { itemName })}
              />
              {/* Input is w-full, so the wrapper sets the width. */}
              <div className="w-20 shrink-0">
                <Input aria-label={`Quantity of ${o.itemName || "other piece"}`} type="number" min={1} step={1} value={o.quantity} onChange={(e) => setOther(o.key, { quantity: e.target.value })} />
              </div>
              <IconButton label="Remove other piece" size="sm" onPress={() => setOthers((list) => list.filter((x) => x.key !== o.key))}>
                <XIcon size={14} />
              </IconButton>
            </div>
          ))}
          <Button variant="ghost" size="sm" onPress={() => setOthers((list) => [...list, draftOf()])}>
            <PlusIcon size={12} /> Add other piece
          </Button>
        </div>
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onPress={save} isDisabled={!valid || saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onPress={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function PieceValueRow({ pieceValue }: { pieceValue: PieceValue }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.pieceValues });

  async function remove() {
    if (!confirm(`Remove the piece value of "${pieceValue.pieceItemName}"? Claims already valued by it keep their GP value.`)) return;
    setError(null);
    try {
      await adminApi.deletePieceValue(pieceValue.id);
      await invalidate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove piece value");
    }
  }

  return (
    <li className="space-y-2 px-4 py-3">
      {editing ? (
        <PieceValueForm
          initial={pieceValue}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSave={async (payload) => {
            await adminApi.updatePieceValue(pieceValue.id, payload);
            await invalidate();
            setEditing(false);
          }}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-on-surface">
              <WikiIcon name={pieceValue.pieceItemName} />
              <WikiItemLink name={pieceValue.pieceItemName} className="font-semibold" />
              <span className="text-on-surface-muted">=</span>
              <Formula pieceValue={pieceValue} />
            </div>
            {pieceValue.unitPrice === null ? (
              <p className="text-xs text-warn">No value right now: an item in it has no price, or it works out to zero or less. Claims of it get no GP value until it does.</p>
            ) : (
              <p className="num text-xs text-on-surface-muted" title={formatGpExact(pieceValue.unitPrice)}>
                {formatGp(pieceValue.unitPrice)} each
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onPress={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" className="text-danger" onPress={remove}>
              Remove
            </Button>
          </div>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </li>
  );
}

function UnvaluedItemRow({ item, onValue }: { item: UnvaluedItem; onValue: (itemName: string) => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  async function setDismissed(dismissed: boolean) {
    setError(null);
    try {
      await adminApi.setUnvaluedItemDismissed(item.itemName, dismissed);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pieceValues });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update item");
    }
  }

  return (
    <li className="space-y-2 px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-on-surface">
          <WikiIcon name={item.itemName} />
          <WikiItemLink name={item.itemName} className="truncate" />
          <span className="num text-xs text-on-surface-muted">
            {item.claimCount} {item.claimCount === 1 ? "claim" : "claims"}
          </span>
        </div>
        <div className="flex shrink-0 gap-1">
          {item.dismissed ? (
            <Button variant="ghost" size="sm" onPress={() => setDismissed(false)}>
              Restore
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onPress={() => onValue(item.itemName)}>
                Add piece value
              </Button>
              <Button variant="ghost" size="sm" onPress={() => setDismissed(true)}>
                Dismiss
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </li>
  );
}

export function PieceValuesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = usePieceValues();
  const pieceValues = data?.pieceValues ?? [];
  const unvalued = (data?.unvaluedItems ?? []).filter((i) => !i.dismissed);
  const dismissed = (data?.unvaluedItems ?? []).filter((i) => i.dismissed);
  // Picking "Add piece value" on an unvalued item remounts the form with that item as the piece.
  const [prefill, setPrefill] = useState<{ pieceItemName: string; key: number } | null>(null);

  return (
    <div className="space-y-6">
      <p className="text-sm text-on-surface-muted">
        Submissions get a GP value from the item's Grand Exchange price. A piece with no price of its own (an untradeable part of a tradeable item) can be valued as a
        share of its whole item instead: Bludgeon axon = Abyssal bludgeon ÷ 3, or Ultor vestige = (Ultor ring − Berserker ring − 3× Chromium ingot) ÷ 1. Adding one
        prices the claims that have no GP value yet; values already set don't change.
      </p>

      <PieceValueForm
        key={prefill?.key ?? 0}
        initial={prefill ?? undefined}
        submitLabel="Add piece value"
        onSave={async (payload) => {
          await adminApi.createPieceValue(payload);
          await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pieceValues });
          setPrefill(null);
        }}
      />

      {isLoading ? (
        <p className="text-sm text-on-surface-muted">Loading…</p>
      ) : pieceValues.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">No piece values yet.</p>
      ) : (
        <ul className="divide-y divide-outline rounded-md border border-outline">
          {pieceValues.map((pv) => (
            <PieceValueRow key={pv.id} pieceValue={pv} />
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-on-surface">Unvalued items</h3>
        <p className="text-xs text-on-surface-muted">Items on claims that have no GP value. Dismiss the ones that should stay without one, like pets.</p>
        {unvalued.length === 0 ? (
          <p className="text-sm text-on-surface-subtle">Every claimed item has a GP value.</p>
        ) : (
          <ul className="divide-y divide-outline rounded-md border border-outline">
            {unvalued.map((item) => (
              <UnvaluedItemRow key={item.itemName} item={item} onValue={(pieceItemName) => setPrefill({ pieceItemName, key: Date.now() })} />
            ))}
          </ul>
        )}
        {dismissed.length > 0 && (
          <Disclosure title={`Dismissed (${dismissed.length})`}>
            <ul className="divide-y divide-outline">
              {dismissed.map((item) => (
                <UnvaluedItemRow key={item.itemName} item={item} onValue={() => {}} />
              ))}
            </ul>
          </Disclosure>
        )}
      </section>
    </div>
  );
}
