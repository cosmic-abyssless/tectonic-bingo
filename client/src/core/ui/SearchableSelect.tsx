import { SearchCombo } from "./SearchCombo";

interface Option {
  id: string;
  label: string;
  group?: string;
}

/**
 * Pick one from a long list by typing to filter it: the box shows the chosen option, opens on focus with them all, and
 * lists options with a `group` under its heading. Inside a <Field> it's labelled by the Field's label.
 */
export function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
  readOnly,
  matches,
  onQueryChange,
}: {
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (id: string) => void;
  readOnly?: boolean;
  /** Whether an option matches what's typed (lowercased), when that's more than its label containing it. */
  matches?: (option: Option, q: string) => boolean;
  /** Hears what's typed as it's typed ("" while the whole list shows). */
  onQueryChange?: (q: string) => void;
}) {
  return (
    <SearchCombo
      items={options}
      itemKey={(o) => o.id}
      itemText={(o) => o.label}
      itemSection={(o) => o.group}
      selectedKey={options.some((o) => o.id === value) ? value : null}
      onPick={(o) => onChange(o.id)}
      itemMatches={matches}
      onQueryChange={onQueryChange}
      readOnly={readOnly}
      emptyText="No matches"
      placeholder={placeholder}
    />
  );
}
