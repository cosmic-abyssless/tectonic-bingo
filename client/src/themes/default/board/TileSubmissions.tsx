import { useBingoPage } from "../../../headless";
import type { SubmissionModel } from "../../../headless/types";
import { SubmissionRow } from "../../../core/submissions/SubmissionRow";
import { ReactionBar } from "../../../core/submissions/ReactionBar";

export function TileSubmissions({ submissions }: { submissions: SubmissionModel[] }) {
  const { reactions } = useBingoPage();
  return (
    <div className="border-t border-outline p-5">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-subtle">Submissions</h3>
      {submissions.map((s) => (
        <div key={s.id}>
          <p className="mt-2 text-xs font-medium text-on-surface-muted">{s.taskLabels.join(" + ")}</p>
          <SubmissionRow
            detail={s.detail}
            footer={<ReactionBar className="mt-1.5" reactions={s.reactions} canReact={reactions.canReact} onToggle={(emoji) => reactions.toggle(s.id, emoji)} />}
          />
        </div>
      ))}
    </div>
  );
}
