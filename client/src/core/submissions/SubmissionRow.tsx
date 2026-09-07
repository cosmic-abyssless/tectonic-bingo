import type { SubmissionDetails } from "@bingo/shared";
import { SubmissionStatusBadge } from "../ui/StatusBadge";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";
import { claimsSummary } from "./claimsSummary";

export function SubmissionRow({ detail }: { detail: SubmissionDetails }) {
  const { submission, screenshots, claims, submittedByUser } = detail;
  const thumb = screenshots[0]?.storageUrl;
  const usesWildcard = claims.some((c) => c.wildcardId !== null);

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-700/50 last:border-0">
      {thumb ? (
        <a href={thumb} target="_blank" rel="noreferrer" className="shrink-0" title="View screenshot">
          <img src={thumb} alt="screenshot" className="w-12 h-12 object-cover rounded border border-slate-600 hover:border-indigo-400 transition-colors" />
        </a>
      ) : (
        <div className="w-12 h-12 rounded border border-slate-700 bg-slate-900/50 shrink-0 flex items-center justify-center text-slate-600 text-xs">—</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <SubmissionStatusBadge status={submission.status} />
          {usesWildcard && (
            <span className="text-xs font-semibold border rounded-full px-2 py-0.5 bg-amber-900/50 text-amber-300 border-amber-700">
              ✦ wildcard
            </span>
          )}
          <span className="text-xs text-slate-500">{timeAgo(submission.submittedAt)}</span>
        </div>
        <p className="text-sm text-slate-200 truncate">{claimsSummary(claims)}</p>
        {submittedByUser && <p className="text-xs text-slate-500 mt-0.5">by {displayName(submittedByUser)}</p>}
        {submission.reviewerNotes && <p className="text-xs text-amber-400 mt-0.5 truncate">{submission.reviewerNotes}</p>}
      </div>
    </div>
  );
}
