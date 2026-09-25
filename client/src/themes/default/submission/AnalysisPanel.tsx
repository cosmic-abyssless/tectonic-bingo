import type { SubmissionFlowModel } from "../../../headless/types";
import { Notice } from "../../../core/ui/Card";
import { AlertIcon, CheckIcon, SpinnerIcon } from "../../../core/ui/icons";
import { WikiItemLink } from "../../../core/ui/WikiItemLink";

export function AnalysisPanel({ analysis }: { analysis: SubmissionFlowModel["analysis"] }) {
  if (analysis.status === "failed") {
    return <p className="mt-2 text-xs text-on-surface-subtle">Screenshot analysis unavailable — select your tile and item manually.</p>;
  }

  if (analysis.status === "analyzing") {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-on-surface-muted">
        <SpinnerIcon className="animate-spin" />
        Analyzing screenshot…
      </p>
    );
  }

  if (analysis.status === "done" && analysis.result) {
    const result = analysis.result;
    return (
      <Notice tone={result.codewordFound ? "ok" : "warn"} icon={result.codewordFound ? <CheckIcon /> : <AlertIcon />} className="mt-2">
        <p className="font-medium">{result.codewordFound ? `Codeword '${result.codeword}' found` : `Codeword '${result.codeword}' not visible`}</p>
        {result.warnings.map((w, i) => (
          <p key={i} className="text-xs leading-snug text-on-surface-muted">
            {w}
          </p>
        ))}
        <p className="text-xs text-on-surface-muted">
          {result.detected ? (
            <>
              Detected: <WikiItemLink name={result.detected.itemName} className="font-medium text-on-surface" />
              <span className="text-on-surface-subtle"> — {result.detected.tileName}</span>
            </>
          ) : (
            "No matching bingo item detected"
          )}
        </p>
      </Notice>
    );
  }

  return null;
}
