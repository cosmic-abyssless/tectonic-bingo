import type { SubmissionFlowModel } from "../../../headless/types";
import { Input } from "../../../core/ui/Field";
import { SearchableSelect } from "../../../core/ui/SearchableSelect";
import { useComic } from "../ui/useComic";
import { submitterHint } from "../../../headless/submitterHint";
import { ComicField } from "./ComicField";

export function SubmitterPicker({ submitter }: { submitter: SubmissionFlowModel["submitter"] }) {
  if (!submitter.visible) return null;
  return (
    <ComicField label="Submitting for" hint={submitterHint(submitter)}>
      <SearchableSelect value={submitter.selectedId} options={submitter.options} placeholder={submitter.required ? `Pick a player on ${submitter.teamName}…` : "Search teammates…"} onChange={submitter.select} />
    </ComicField>
  );
}

export function TilePicker({ tile }: { tile: SubmissionFlowModel["tile"] }) {
  return (
    <ComicField label="Tile">
      <SearchableSelect value={tile.selectedId} options={tile.options} placeholder="Search tiles…" onChange={tile.select} />
    </ComicField>
  );
}

export function RequirementPicker({ requirement, quantity }: { requirement: SubmissionFlowModel["requirement"]; quantity: SubmissionFlowModel["quantity"] }) {
  const { colors } = useComic();
  if (!requirement.visible) return null;
  return (
    <>
      <ComicField label="Requirement">
        <SearchableSelect
          key={requirement.pickerKey}
          value={requirement.selectedId}
          options={requirement.options}
          placeholder="Search requirements…"
          readOnly={requirement.readOnly}
          onChange={requirement.select}
        />
      </ComicField>

      {requirement.locked.length > 0 && (
        <ul className="-mt-1 space-y-0.5 text-xs italic" style={{ color: colors.INK_SUBTLE }}>
          {requirement.locked.map((item) => (
            <li key={item.label}>
              {item.label}: {item.reason}
            </li>
          ))}
        </ul>
      )}

      {quantity.visible && (
        <ComicField label="Quantity" hint={`${quantity.needed} needed in total`}>
          <Input type="number" min={1} max={quantity.max} value={quantity.value} onChange={(e) => quantity.set(parseInt(e.target.value) || 1)} className="num" />
        </ComicField>
      )}
    </>
  );
}
