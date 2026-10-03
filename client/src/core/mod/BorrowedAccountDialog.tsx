import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Stage } from "@bingo/shared";
import { queryKeys, useBingo } from "../../api/queries";
import { useLateSignupRsns } from "../../api/adminQueries";
import * as adminApi from "../../api/adminApi";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { Field, Input } from "../ui/Field";
import { Select } from "../ui/Select";
import { AlertIcon } from "../ui/icons";

/** The stages an Admin can set a Borrowed account in: from Signups closed until Finished (as a Late signup). */
export const BORROWED_ACCOUNT_STAGES: readonly Stage[] = ["captains", "draft", "reveal", "live"];

/** The Signup a Borrowed account is set for, and whose it is. */
export interface AccountTarget {
  signupId: string;
  userId: string;
  /** The RSN they're on now, and whether that's a borrowed account. */
  rsn: string;
  accountBorrowed: boolean;
  /** Their own name: the Discord name, since inside the Bingo they're named by the account they're on. */
  ownName: string;
}

/**
 * While Live, the warning before the change (CONTEXT.md "Borrowed account"): Wise Old Man counts the new account for
 * the whole competition and stops counting the one they were on. Null at any other stage.
 */
export function liveWarning(stage: Stage | undefined, current: string, next: string): string | null {
  if (stage !== "live") return null;
  return `This bingo is Live: Wise Old Man will count ${next.trim() || "the new account"} for the whole competition, from its start, and stop counting ${current}.`;
}

/**
 * Set borrowed account (CONTEXT.md "Borrowed account"), Admins only: the account the Player plays on, which Wise Old
 * Man has to know, and a reason. On a borrowed account already, the same form moves them to another one or back to
 * their own (one of their clan RSNs, or any RSN when the clan has none on file for them). Their Team, roles and
 * Submissions stay as they are. The roster opens it in a dialog (BorrowedAccountDialog), the player card inline.
 */
export function BorrowedAccountForm({ slug, target, onDone, onCancel }: { slug: string; target: AccountTarget; onDone: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const { data: bingoData } = useBingo(slug);
  const [mode, setMode] = useState<"borrowed" | "own">("borrowed");
  const [rsn, setRsn] = useState("");
  const [ownPick, setOwnPick] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backToOwn = mode === "own";
  const { data: rsnsData, isFetching: rsnsLoading } = useLateSignupRsns(slug, backToOwn ? target.userId : "");
  const ownRsns = rsnsData?.rsns ?? [];
  // Their first clan RSN until another is picked; typed when the clan has none on file.
  const next = backToOwn && ownRsns.length > 0 ? ownPick || ownRsns[0]! : backToOwn ? ownPick : rsn;
  const warning = liveWarning(bingoData?.bingo.stage, target.rsn, next);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await adminApi.setSignupAccount(slug, target.signupId, { rsn: next.trim(), reason: reason.trim(), ...(backToOwn ? { ownAccount: true } : {}) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.playerProfile(slug, target.userId) }),
      ]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set the account");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = !!next.trim() && !!reason.trim() && !saving && !(backToOwn && rsnsLoading);

  return (
    <div className="space-y-4">
      {target.accountBorrowed && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 block text-xs font-medium text-on-surface-muted">
            {target.ownName} is on <span className="font-semibold text-on-surface">{target.rsn}</span>, a borrowed account
          </legend>
          <Checkbox type="radio" name={`account-${target.signupId}`} checked={!backToOwn} onChange={() => setMode("borrowed")}>
            Another borrowed account
          </Checkbox>
          <Checkbox type="radio" name={`account-${target.signupId}`} checked={backToOwn} onChange={() => setMode("own")}>
            Back to their own account
          </Checkbox>
        </fieldset>
      )}
      {!backToOwn ? (
        <Field label="RSN of the account they play on" hint="Wise Old Man has to track it. They're named by it everywhere in this bingo.">
          <Input value={rsn} onChange={(e) => setRsn(e.target.value)} maxLength={12} autoFocus />
        </Field>
      ) : ownRsns.length > 0 ? (
        <Field label="Their own RSN" as="div">
          <Select aria-label="Their own RSN" value={next} onChange={setOwnPick} options={ownRsns.map((r) => ({ value: r, label: r }))} />
        </Field>
      ) : (
        <Field label="Their own RSN" hint={rsnsLoading ? "Looking up their clan RSNs…" : "The clan has no RSNs on file for them."}>
          <Input value={ownPick} onChange={(e) => setOwnPick(e.target.value)} maxLength={12} readOnly={rsnsLoading} />
        </Field>
      )}
      <Field label="Reason" hint="Recorded in the audit log.">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      {warning && (
        <Notice tone="warn" icon={<AlertIcon />}>
          {warning}
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onPress={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onPress={submit} isDisabled={!canSubmit}>
          {saving ? "Saving…" : backToOwn ? "Set back" : "Set borrowed account"}
        </Button>
      </div>
    </div>
  );
}

/** The roster's Set borrowed account: BorrowedAccountForm in a dialog, open while there's a target. */
export function BorrowedAccountDialog({ slug, target, onClose }: { slug: string; target: AccountTarget | null; onClose: () => void }) {
  // The last target stays on screen while the dialog animates closed.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  return (
    <Dialog isOpen={target !== null} onClose={onClose}>
      <DialogHeader title="Set borrowed account" subtitle="When they play on an OSRS account they don't own. Their Team, roles and Submissions stay as they are." onClose={onClose} />
      <div className="p-5">{shown && <BorrowedAccountForm key={shown.signupId} slug={slug} target={shown} onDone={onClose} onCancel={onClose} />}</div>
    </Dialog>
  );
}
