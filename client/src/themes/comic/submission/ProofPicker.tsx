import type { SubmissionFlowModel } from "../../../headless/types";
import { CaptionBox } from "../ui/CaptionBox";
import { ComicField } from "./ComicField";
import { ComicSegmentedControl } from "../ui/ComicSegmentedControl";
import { TextButton } from "../../../core/ui/TextButton";

const KINDS = [
  { id: "drop", label: "A drop" },
  { id: "proof", label: "Proof screenshot" },
] as const;

/** Drop or Proof screenshot (CONTEXT.md), as chunky ink tabs like the part picker; and the missing-proof warning. */
export function ProofPicker({ kind, warning }: { kind: SubmissionFlowModel["kind"]; warning: SubmissionFlowModel["proofWarning"] }) {
  return (
    <>
      {kind.available && (
        <ComicField label="What does it show?" as="div" tutorial="submit-proof">
          <ComicSegmentedControl aria-label="What does it show?" options={KINDS} value={kind.value} onChange={kind.select} />
        </ComicField>
      )}

      {kind.value === "proof" && (
        <CaptionBox tone="blue" title="Proof screenshot">
          {kind.note && <p className="mb-1 text-sm">{kind.note}</p>}
          <p className="text-sm">
            The starting state for <span className="font-semibold">{kind.label}</span>, before your drops. Get the codeword in, same as any screenshot.
          </p>
        </CaptionBox>
      )}

      {warning && (
        <CaptionBox tone="yellow" title="No Proof screenshot yet">
          <p className="text-sm">
            {warning.message}.{" "}
            <TextButton ownColour onPress={warning.post} className="font-semibold">
              Post one instead
            </TextButton>
            , or send this drop anyway.
          </p>
        </CaptionBox>
      )}
    </>
  );
}
