import type { SubmissionFlowModel } from "../../../headless/types";
import { Field, Input } from "../../../core/ui/Field";
import { SearchableSelect } from "../../../core/ui/SearchableSelect";

export function RequirementPicker({
  requirement,
  quantity,
}: {
  requirement: SubmissionFlowModel["requirement"];
  quantity: SubmissionFlowModel["quantity"];
}) {
  if (!requirement.visible) return null;

  return (
    <>
      <Field label="Which requirement are you submitting for?">
        <SearchableSelect
          key={requirement.pickerKey}
          value={requirement.selectedId}
          options={requirement.options}
          placeholder="Search requirements…"
          readOnly={requirement.readOnly}
          onChange={requirement.select}
        />
      </Field>

      {quantity.visible && (
        <Field label="How many are you submitting?" hint={`${quantity.needed} needed in total`}>
          <Input
            type="number"
            min={1}
            max={quantity.max}
            value={quantity.value}
            onChange={(e) => quantity.set(parseInt(e.target.value) || 1)}
            className="num"
          />
        </Field>
      )}
    </>
  );
}
