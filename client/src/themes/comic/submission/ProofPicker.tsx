import type { SubmissionFlowModel } from "../../../headless/types";
import { COMIC_FONT } from "../font";
import { CaptionBox } from "../ui/CaptionBox";
import { useComic } from "../ui/useComic";
import { ComicField } from "./ComicField";

const KINDS = [
  ["drop", "A drop"],
  ["proof", "Proof screenshot"],
] as const;

/** Drop or Proof screenshot (CONTEXT.md), as chunky ink tabs like the part picker; and the missing-proof warning. */
export function ProofPicker({ kind, warning }: { kind: SubmissionFlowModel["kind"]; warning: SubmissionFlowModel["proofWarning"] }) {
  const { colors } = useComic();
  return (
    <>
      {kind.available && (
        <ComicField label="What does it show?" as="div" tutorial="submit-proof">
          <div className="flex flex-wrap gap-2">
            {KINDS.map(([value, label]) => {
              const active = kind.value === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => kind.select(value)}
                  aria-pressed={active}
                  className="comic-press flex min-w-24 flex-1 items-center justify-center border-[3px] px-3 py-1.5 text-lg uppercase leading-none tracking-wide"
                  style={{
                    fontFamily: COMIC_FONT,
                    borderColor: colors.LINE,
                    background: active ? colors.YELLOW : colors.PAPER_RAISED,
                    color: active ? colors.ON_YELLOW : colors.INK_SUBTLE,
                    boxShadow: active ? `3px 3px 0 ${colors.SHADOW}` : "none",
                    transform: active ? undefined : "translate(2px,2px)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
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
            <button type="button" onClick={warning.post} className="font-semibold underline underline-offset-2">
              Post one instead
            </button>
            , or send this drop anyway.
          </p>
        </CaptionBox>
      )}
    </>
  );
}
