import type { SubmissionFlowModel } from "../../../headless/types";
import { Field } from "../../../core/ui/Field";
import { SearchableSelect } from "../../../core/ui/SearchableSelect";

export function TilePicker({ tile }: { tile: SubmissionFlowModel["tile"] }) {
  return (
    <Field label="Tile" tutorial="submit-tile">
      <SearchableSelect value={tile.selectedId} options={tile.options} placeholder="Search tiles…" onChange={tile.select} matches={tile.matches} onQueryChange={tile.setQuery} />
    </Field>
  );
}
