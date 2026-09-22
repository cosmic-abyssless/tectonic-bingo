import { usePickerParts } from "./usePickerParts";

export interface MultiSelectOption {
  key: string;
  label: string;
  count?: number;
}

/** Popover checklist filter — replaces a chip row once there are too many options to scan at a glance. */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const { Picker } = usePickerParts();
  const summary =
    selected.length === options.length
      ? "All"
      : selected.length === 0
        ? "None"
        : selected.length === 1
          ? (options.find((o) => o.key === selected[0])?.label ?? selected[0])
          : `${selected.length} selected`;

  return (
    <Picker options={options} selectedKeys={new Set(selected)} selectionMode="multiple" onSelectionChange={onChange}>
      {label}: <span className="text-on-surface-subtle">{summary}</span>
    </Picker>
  );
}
