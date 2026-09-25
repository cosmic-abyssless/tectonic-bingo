import { useEffect, useState } from "react";
import { useRepriceSubmission } from "../../api/queries";
import { Button } from "../ui/Button";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { formatGp } from "../ui/gp";
import { CheckIcon, RefreshIcon, XIcon } from "../ui/icons";
import { usePreference } from "../ui/preferences";

// How long the tick or cross stays before the refresh icon comes back: the signup roster's stats refresh does the same.
const RESULT_MS = 3000;

/**
 * Re-prices a submission's GP value (CONTEXT.md "GP value"): prices its claims again at today's prices and rules.
 * For values priced from the wrong thing, not for updating prices, so the first use in a browser says so and asks.
 * Looks and behaves like the signup roster's stats refresh: the icon spins, then a tick or a cross for a few seconds.
 */
export function RepriceGpButton({ slug, submissionId }: { slug: string; submissionId: string }) {
  const reprice = useRepriceSubmission(slug);
  const [warning, setWarning] = usePreference("repriceGpWarning");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  async function run() {
    setResult(null);
    try {
      const { claims } = await reprice.mutateAsync(submissionId);
      setResult({ ok: true, detail: claims.length === 0 ? "GP value unchanged" : `Re-priced ${claims.map((c) => `${c.itemName}: ${formatGp(c.before)} → ${formatGp(c.after)}`).join(", ")}` });
    } catch (e: unknown) {
      setResult({ ok: false, detail: e instanceof Error ? e.message : "Couldn't re-price" });
    }
  }

  const title = reprice.isPending ? "Re-pricing…" : (result?.detail ?? "Re-price GP value (only to fix a wrong value)");
  // The dialog is portalled, but React still bubbles its clicks here: keep them away from the mod queue card, which
  // opens and closes on click.
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={reprice.isPending}
        className="inline-flex size-5 items-center justify-center rounded align-middle hover:bg-surface-hover"
        onClick={() => {
          if (warning === "seen") void run();
          else setConfirming(true);
        }}
      >
        {result ? (
          result.ok ? (
            <CheckIcon size={13} className="text-ok" />
          ) : (
            <XIcon size={13} className="text-danger" />
          )
        ) : (
          <RefreshIcon size={12} className={reprice.isPending ? "animate-spin text-on-surface-subtle" : "text-on-surface-muted"} />
        )}
      </button>

      <Dialog isOpen={confirming} onClose={() => setConfirming(false)}>
        <DialogHeader title="Re-price this submission's GP value?" onClose={() => setConfirming(false)} />
        <div className="space-y-3 p-5 text-sm text-on-surface-muted">
          <p>
            A GP value is fixed when a submission is made, so GP gained shows what drops were worth at the time. Re-price only when a value is <strong>wrong</strong>: it
            was priced from the wrong thing, for example before a Task got its <em>Valued as</em> or before an item had a Piece value.
          </p>
          <p>Don't use it to bring values up to today's prices. The change is recorded in the audit log.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onPress={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onPress={() => {
                setWarning("seen");
                setConfirming(false);
                void run();
              }}
            >
              Re-price
            </Button>
          </div>
        </div>
      </Dialog>
    </span>
  );
}
