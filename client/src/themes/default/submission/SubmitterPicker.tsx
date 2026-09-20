import type { SubmissionFlowModel } from "../../../headless/types";
import { Field } from "../../../core/ui/Field";
import { SearchableSelect } from "../../../core/ui/SearchableSelect";
import { submitterHint } from "../../../headless/submitterHint";

export function SubmitterPicker({ submitter }: { submitter: SubmissionFlowModel["submitter"] }) {
  if (!submitter.visible) return null;
  return (
    <Field label="Submitting for" hint={submitterHint(submitter)}>
      <SearchableSelect value={submitter.selectedId} options={submitter.options} placeholder={submitter.required ? `Pick a player on ${submitter.teamName}…` : "Search teammates…"} onChange={submitter.select} />
    </Field>
  );
}
