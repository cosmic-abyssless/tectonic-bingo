import { PROOF_FLAG_LABELS, type ProofCheck } from "@bingo/shared";
import { SubmissionStatusBadge } from "../ui/StatusBadge";
import { Badge } from "../ui/Card";
import { timeAgo } from "../ui/time";
import { ScreenshotThumb } from "../submissions/ScreenshotThumb";

const at = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A drop's Proof screenshot flags (CONTEXT.md "Proof screenshot"), for its row in the review queue. They inform, never block. */
export function ProofFlagBadges({ checks }: { checks: ProofCheck[] }) {
  const flagged = checks.filter((c) => c.flag);
  return (
    <>
      {flagged.map((c) => (
        <Badge key={`${c.requirement.taskId ?? "tile"}-${c.flag}`} tone="warn">
          {PROOF_FLAG_LABELS[c.flag!]}
          {checks.length > 1 ? ` (${c.requirement.label})` : ""}
        </Badge>
      ))}
    </>
  );
}

/**
 * Reviewing a drop on a Tile or Task that needs a Proof screenshot: its Player's proofs for each requirement, as
 * thumbnails with their status and time, beside the drop's own time and any flag.
 */
export function ProofChecks({ checks, dropSubmittedAt }: { checks: ProofCheck[]; dropSubmittedAt: string }) {
  if (checks.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-outline bg-surface px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-on-surface-subtle">
        Proof screenshot <span className="normal-case tracking-normal">· this drop was submitted {at(dropSubmittedAt)}</span>
      </p>
      {checks.map((check) => (
        <div key={check.requirement.taskId ?? "tile"} className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-medium text-on-surface">{check.requirement.label}</span>
            {check.flag ? <Badge tone="warn">{PROOF_FLAG_LABELS[check.flag]}</Badge> : <Badge tone="ok">Proof screenshot approved first</Badge>}
          </div>
          {check.requirement.note && <p className="text-xs text-on-surface-muted">{check.requirement.note}</p>}
          {check.proofs.length === 0 ? (
            <p className="text-xs text-on-surface-subtle">This player hasn't posted one.</p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {check.proofs.map((proof) => (
                <li key={proof.submissionId} className="flex items-center gap-2">
                  <ScreenshotThumb url={proof.screenshotUrl ?? undefined} size="sm" />
                  <div className="space-y-0.5">
                    <SubmissionStatusBadge status={proof.status} />
                    <p className="text-xs text-on-surface-subtle">
                      {at(proof.submittedAt)} · {timeAgo(proof.submittedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
