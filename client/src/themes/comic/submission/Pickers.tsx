import type { SubmissionFlowModel } from "../../../headless/types";
import { Input } from "../../../core/ui/Field";
import { SearchableSelect } from "../../../core/ui/SearchableSelect";
import { ComicField } from "./ComicField";

export function TilePicker({ tile }: { tile: SubmissionFlowModel["tile"] }) {
  return (
    <ComicField label="Which issue?">
      <SearchableSelect value={tile.selectedId} options={tile.options} placeholder="Search tiles…" onChange={tile.select} />
    </ComicField>
  );
}

export function RequirementPicker({ requirement, quantity }: { requirement: SubmissionFlowModel["requirement"]; quantity: SubmissionFlowModel["quantity"] }) {
  if (!requirement.visible) return null;
  return (
    <>
      <ComicField label="Which item?">
        <SearchableSelect
          key={requirement.pickerKey}
          value={requirement.selectedId}
          options={requirement.options}
          placeholder="Search requirements…"
          readOnly={requirement.readOnly}
          onChange={requirement.select}
        />
      </ComicField>

      {quantity.visible && (
        <ComicField label="How many?" hint={`${quantity.needed} needed in total`}>
          <Input type="number" min={1} max={quantity.max} value={quantity.value} onChange={(e) => quantity.set(parseInt(e.target.value) || 1)} className="num" />
        </ComicField>
      )}
    </>
  );
}
