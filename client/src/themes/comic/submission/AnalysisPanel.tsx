import type { SubmissionFlowModel } from "../../../headless/types";
import { SpinnerIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { CaptionBox } from "../ui/CaptionBox";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";
import { WikiItemLink } from "../../../core/ui/WikiItemLink";

/** The detective's verdict on the screenshot, delivered as a narration caption. */
export function AnalysisPanel({ analysis }: { analysis: SubmissionFlowModel["analysis"] }) {
  const { colors } = useComic();

  if (analysis.status === "failed") {
    return (
      <p className="text-xs italic" style={{ color: colors.INK_SUBTLE }}>
        Our detective couldn't read the photo — pick the tile and item yourself.
      </p>
    );
  }

  if (analysis.status === "analyzing") {
    return (
      <CaptionBox tone="cyan" tilt={-0.4}>
        <p className="flex items-center gap-2 text-lg uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
          <SpinnerIcon className="animate-spin" />
          Analyzing screenshot…
        </p>
        <p className="mt-1 text-xs" style={{ color: colors.INK_BODY }}>
          Scanning the screenshot for the codeword and a matching item.
        </p>
      </CaptionBox>
    );
  }

  if (analysis.status === "done" && analysis.result) {
    const r = analysis.result;
    // Only a hit gets a stamp. The check can miss a codeword that's really
    // there, so a miss is a neutral note — never a red "rejected" verdict.
    return (
      <CaptionBox tone={r.codewordFound ? "green" : "yellow"} tilt={0.4} className={r.codewordFound ? "pr-24" : undefined}>
        {r.codewordFound && (
          <Stamp kind="approved" size="sm" rotate={10} className="absolute right-2 top-2">
            Codeword OK
          </Stamp>
        )}
        <p className="text-base font-semibold" style={{ color: colors.INK }}>
          {r.codewordFound ? `Codeword '${r.codeword}' spotted.` : `Couldn't spot codeword '${r.codeword}' — make sure it's visible.`}
        </p>
        {r.warnings.map((w, i) => (
          <p key={i} className="text-xs leading-snug" style={{ color: colors.INK_BODY }}>
            {w}
          </p>
        ))}
        <p className="mt-1 text-xs" style={{ color: colors.INK_BODY }}>
          {r.detected ? (
            <>
              Detected <span style={{ color: colors.INK }}>
                <WikiItemLink name={r.detected.itemName} className="font-semibold" />
              </span>
              <span style={{ color: colors.INK_SUBTLE }}> — {r.detected.tileName}</span>
            </>
          ) : (
            "No matching bingo item detected."
          )}
        </p>
      </CaptionBox>
    );
  }

  return null;
}
