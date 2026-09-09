import type { SubmissionModel } from "../../../headless/types";
import { SubmissionRow } from "../../../core/submissions/SubmissionRow";

export function TileSubmissions({ submissions }: { submissions: SubmissionModel[] }) {
  return (
    <div className="border-t border-line p-5">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Submissions</h3>
      {submissions.map((s) => (
        <div key={s.id}>
          <p className="mt-2 text-xs font-medium text-fg-muted">{s.taskLabels.join(" + ")}</p>
          <SubmissionRow detail={s.detail} />
        </div>
      ))}
    </div>
  );
}
