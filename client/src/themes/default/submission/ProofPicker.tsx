import type { SubmissionFlowModel } from "../../../headless/types";
import { Field } from "../../../core/ui/Field";
import { Notice } from "../../../core/ui/Card";

const KINDS = [
  ["drop", "A drop"],
  ["proof", "Proof screenshot"],
] as const;

/** Drop or Proof screenshot (CONTEXT.md), where the picked Tile or Task needs one; and the missing-proof warning. */
export function ProofPicker({ kind, warning }: { kind: SubmissionFlowModel["kind"]; warning: SubmissionFlowModel["proofWarning"] }) {
  return (
    <>
      {kind.available && (
        <Field label="What does it show?" as="div">
          <div className="flex overflow-hidden rounded-md border border-outline-strong">
            {KINDS.map(([value, label], i) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind.value === value}
                onClick={() => kind.select(value)}
                className={`h-10 flex-1 text-sm font-medium transition-colors ${i > 0 ? "border-l border-outline-strong" : ""} ${
                  kind.value === value ? "bg-accent text-on-accent" : "bg-background text-on-surface-muted hover:text-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {kind.value === "proof" && (
        <Notice tone="info">
          {kind.note && <p className="mb-1">{kind.note}</p>}
          The starting state for <span className="font-medium">{kind.label}</span>, before your drops. Include the codeword, as on any screenshot.
        </Notice>
      )}

      {warning && (
        <Notice tone="warn">
          {warning.message}.{" "}
          <button type="button" onClick={warning.post} className="font-medium underline underline-offset-2">
            Post one instead
          </button>
          , or submit this drop anyway.
        </Notice>
      )}
    </>
  );
}
