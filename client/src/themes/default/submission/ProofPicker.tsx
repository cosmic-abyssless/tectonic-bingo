import type { SubmissionFlowModel } from "../../../headless/types";
import { Field } from "../../../core/ui/Field";
import { Notice } from "../../../core/ui/Card";
import { TextButton } from "../../../core/ui/TextButton";
import { SegmentedControl } from "../../../core/ui/SegmentedControl";

const KINDS = [
  { id: "drop", label: "A drop" },
  { id: "proof", label: "Proof screenshot" },
] as const;

/** Drop or Proof screenshot (CONTEXT.md), where the picked Tile or Task needs one; and the missing-proof warning. */
export function ProofPicker({ kind, warning }: { kind: SubmissionFlowModel["kind"]; warning: SubmissionFlowModel["proofWarning"] }) {
  return (
    <>
      {kind.available && (
        <Field label="What does it show?" as="div" tutorial="submit-proof">
          <SegmentedControl fill aria-label="What does it show?" options={KINDS} value={kind.value} onChange={kind.select} />
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
          <TextButton ownColour onPress={warning.post} className="font-medium">
            Post one instead
          </TextButton>
          , or submit this drop anyway.
        </Notice>
      )}
    </>
  );
}
