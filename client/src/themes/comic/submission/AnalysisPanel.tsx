import type { SubmissionFlowModel } from "../../../headless/types";
import { SpinnerIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { CaptionBox } from "../ui/CaptionBox";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";

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
    return (
      <CaptionBox tone={r.codewordFound ? "green" : "red"} tilt={0.4} className="pr-24">
        <Stamp kind={r.codewordFound ? "approved" : "rejected"} size="sm" rotate={10} className="absolute right-2 top-2">
          {r.codewordFound ? "Codeword OK" : "No codeword"}
        </Stamp>
        <p className="text-base font-semibold" style={{ color: colors.INK }}>
          {r.codewordFound ? `Codeword '${r.codeword}' spotted.` : `Codeword '${r.codeword}' isn't visible.`}
        </p>
        {r.warnings.map((w, i) => (
          <p key={i} className="text-xs leading-snug" style={{ color: colors.INK_BODY }}>
            {w}
          </p>
        ))}
        <p className="mt-1 text-xs" style={{ color: colors.INK_BODY }}>
          {r.detected ? (
            <>
              Detected <span className="font-semibold" style={{ color: colors.INK }}>{r.detected.itemName}</span>
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
