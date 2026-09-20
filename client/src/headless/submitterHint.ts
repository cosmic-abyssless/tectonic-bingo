import type { SubmissionFlowModel } from "./types";

/** The line under the "Submitting for" picker, when it has something to say (shared by every theme). */
export function submitterHint(submitter: SubmissionFlowModel["submitter"]): string | undefined {
  const selected = submitter.options.find((o) => o.id === submitter.selectedId);
  if (submitter.required && !selected) return `Choose which player on ${submitter.teamName} this is for. They are credited for the drop.`;
  if (selected && !selected.isMe) return `${selected.label} is credited for the drop, and you are recorded as the one who posted it.`;
  return undefined;
}
