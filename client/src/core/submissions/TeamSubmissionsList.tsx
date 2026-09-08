import type { SubmissionDetails, Tile } from "@bingo/shared";
import { Modal, ModalHeader } from "../ui/Modal";
import { SubmissionStatusBadge } from "../ui/StatusBadge";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";
import { collectLeaves } from "../board/requirementTree";
import { claimsSummary } from "./claimsSummary";

export function TeamSubmissionsList({
  tiles,
  submissions,
  onClose,
  onSubmit,
}: {
  tiles: Tile[];
  submissions: SubmissionDetails[];
  onClose: () => void;
  onSubmit?: () => void;
}) {
  // A claim targets a leaf, which may be nested under a task's ALL/ANY/COUNT
  // wrapper rather than being the task itself.
  const taskLookup = new Map<string, { tile: Tile; taskLabel: string }>();
  for (const tile of tiles) for (const task of tile.node.children) for (const leaf of collectLeaves(task)) taskLookup.set(leaf.id, { tile, taskLabel: task.label ?? "" });

  const sorted = [...submissions].sort((a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime());

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader
        title="Team Submissions"
        subtitle={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""}`}
        onClose={onClose}
        action={
          onSubmit && (
            <button onClick={onSubmit} className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer">
              Submit
            </button>
          )
        }
      />

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="text-4xl text-slate-600">📋</div>
          <p className="text-slate-400">No submissions yet</p>
          <p className="text-slate-600 text-sm">Submit a completion using the Submit button in the header.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-700/60">
          {sorted.map((detail) => {
            const infos = [...new Set(detail.claims.map((c) => c.nodeId))].map((id) => taskLookup.get(id)).filter((i) => !!i);
            const tileName = infos[0]?.tile.name;
            const thumb = detail.screenshots[0]?.storageUrl;
            return (
              <li key={detail.submission.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors">
                {thumb ? (
                  <a href={thumb} target="_blank" rel="noreferrer" className="shrink-0" title="View screenshot">
                    <img src={thumb} alt="screenshot" className="w-14 h-14 object-cover rounded-md border border-slate-600 hover:border-indigo-400 transition-colors" />
                  </a>
                ) : (
                  <div className="w-14 h-14 rounded-md border border-slate-700 bg-slate-900/50 shrink-0 flex items-center justify-center text-slate-600 text-xs">—</div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white text-sm font-semibold truncate">{tileName ?? "Unknown tile"}</span>
                    {infos.map((info) => (
                      <span key={info.taskLabel} className="text-xs text-slate-500 bg-slate-700 rounded-full px-2 py-0.5 shrink-0">{info.taskLabel}</span>
                    ))}
                  </div>
                  <p className="text-sm text-slate-300 truncate">
                    {claimsSummary(detail.claims)}
                  </p>
                  {detail.submittedByUser && <p className="text-xs text-slate-500 mt-0.5">by {displayName(detail.submittedByUser)}</p>}
                  {detail.submission.reviewerNotes && <p className="text-xs text-amber-400 mt-0.5 truncate">{detail.submission.reviewerNotes}</p>}
                </div>

                <div className="shrink-0 text-right flex flex-col items-end gap-1">
                  <SubmissionStatusBadge status={detail.submission.status} />
                  <span className="text-xs text-slate-500">{timeAgo(detail.submission.submittedAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
