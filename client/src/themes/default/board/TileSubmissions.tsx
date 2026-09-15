import type { SubmissionModel } from "../../../headless/types";
import { SubmissionRow } from "../../../core/submissions/SubmissionRow";

export function TileSubmissions({ submissions }: { submissions: SubmissionModel[] }) {
  return (
    <div className="border-t border-outline p-5">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-subtle">Submissions</h3>
      {submissions.map((s) => (
        <div key={s.id}>
          <p className="mt-2 text-xs font-medium text-on-surface-muted">{s.taskLabels.join(" + ")}</p>
          <SubmissionRow detail={s.detail} />
        </div>
      ))}
    </div>
  );
}
