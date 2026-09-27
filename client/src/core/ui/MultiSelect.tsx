import { usePickerParts } from "./usePickerParts";

export interface MultiSelectOption {
  key: string;
  label: string;
  count?: number;
}

/**
 * Popover checklist filter — replaces a chip row once there are too many options to scan at a glance. Nothing ticked
 * means Any (no filtering); ticking options narrows to just those.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  attention,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
  /** Something in this filter wants looking at: a yellow dot on the button, with this as its hover and screen-reader text. */
  attention?: string;
}) {
  const { Picker } = usePickerParts();
  const picked = selected.filter((key) => options.some((o) => o.key === key));
  const summary =
    picked.length === 0
      ? "Any"
      : picked.length === options.length
        ? "All"
        : picked.length === 1
          ? (options.find((o) => o.key === picked[0])?.label ?? picked[0])
          : `${picked.length} selected`;

  return (
    <Picker options={options} selectedKeys={new Set(picked)} selectionMode="multiple" onSelectionChange={onChange}>
      {label}: <span className="text-on-surface-subtle">{summary}</span>
      {attention && (
        <span title={attention} className="ml-1.5 inline-block size-2 shrink-0 rounded-full bg-attention">
          <span className="sr-only">{attention}</span>
        </span>
      )}
    </Picker>
  );
}
