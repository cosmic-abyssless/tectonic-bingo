import { useState } from "react";
import type { SubmissionStatus } from "@bingo/shared";
import type { SubmissionModel } from "../../../headless/types";
import { Dialog, DialogHeader } from "../../../core/ui/Dialog";
import { Button } from "../../../core/ui/Button";
import { Badge, EmptyState, FilterChip } from "../../../core/ui/Card";
import { Select } from "../../../core/ui/Select";
import { ImageIcon } from "../../../core/ui/icons";
import { SubmissionStatusBadge } from "../../../core/ui/StatusBadge";
import { ScreenshotThumb } from "../../../core/submissions/ScreenshotThumb";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { displayName } from "../../../core/ui/user";

type Filter = SubmissionStatus | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export function SubmissionsDrawer({
  isOpen,
  submissions,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  submissions: SubmissionModel[];
  onClose: () => void;
  onSubmit?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  // "" = everyone. Names come from the submissions themselves, so the list
  // only ever offers people who actually submitted something.
  const [submitter, setSubmitter] = useState("");
  const submitters = [...new Set(submissions.flatMap((s) => (s.submittedBy ? [s.submittedBy] : [])))].sort();
  const bySubmitter = submitter ? submissions.filter((s) => s.submittedBy === submitter) : submissions;
  const shown = filter === "all" ? bySubmitter : bySubmitter.filter((s) => s.status === filter);
  const countFor = (key: Filter) => (key === "all" ? bySubmitter.length : bySubmitter.filter((s) => s.status === key).length);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      <DialogHeader
        title="Team submissions"
        subtitle={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""}`}
        onClose={onClose}
        action={
          onSubmit && (
            <Button variant="primary" size="sm" onPress={onSubmit}>
              Submit
            </Button>
          )
        }
      />

      {submissions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-outline px-5 py-3">
          {FILTERS.map(({ key, label }) => (
            <FilterChip key={key} active={filter === key} count={countFor(key)} onPress={() => setFilter(key)}>
              {label}
            </FilterChip>
          ))}
          {submitters.length > 1 && (
            <Select
              size="sm"
              value={submitter}
              onChange={setSubmitter}
              aria-label="Submitted by"
              className="ml-auto w-auto!"
              options={[{ value: "", label: "Everyone" }, ...submitters.map((name) => ({ value: name, label: name }))]}
            />
          )}
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={<ImageIcon />} title="No submissions yet">
            {onSubmit ? "Submit a completion using the Submit button in the header." : "Nothing has been submitted for this team yet."}
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <p className="p-5 text-sm text-on-surface-subtle">
          No {filter === "all" ? "" : `${filter} `}submissions{submitter && ` by ${submitter}`}.
        </p>
      ) : (
        <ul className="divide-y divide-outline">
          {shown.map((s) => (
            <li key={s.id} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-hover">
              <ScreenshotThumb url={s.thumbnailUrl ?? undefined} />

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-on-surface">{s.tileName ?? "Unknown tile"}</span>
                  {s.taskLabels.map((label) => (
                    <Badge key={label}>{label}</Badge>
                  ))}
                </div>
                <p className="truncate text-sm text-on-surface-muted">{s.summary}</p>
                {s.detail.submittedByUser && (
                  <p className="mt-0.5 text-xs text-on-surface-subtle">
                    by <PlayerName userId={s.detail.submittedByUser.id}>{s.submittedBy}</PlayerName>
                    {s.detail.postedByUser && <> (posted by <PlayerName userId={s.detail.postedByUser.id}>{displayName(s.detail.postedByUser)}</PlayerName>)</>}
                  </p>
                )}
                {s.reviewerNotes && <p className="mt-0.5 truncate text-xs text-warn">{s.reviewerNotes}</p>}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <SubmissionStatusBadge status={s.status} />
                <span className="text-xs text-on-surface-subtle">{s.timeAgo}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
