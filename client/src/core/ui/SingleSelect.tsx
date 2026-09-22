import type { PickerOption } from "./Picker";
import { usePickerParts } from "./usePickerParts";

export function SingleSelect({
  label,
  options,
  selected,
  onChange,
  active,
}: {
  label: string;
  options: PickerOption[];
  selected: string;
  onChange: (key: string) => void;
  active?: boolean;
}) {
  const { Picker } = usePickerParts();
  const summary = options.find((o) => o.key === selected)?.label ?? selected;

  return (
    <Picker
      options={options}
      selectedKeys={new Set([selected])}
      selectionMode="single"
      active={active}
      onSelectionChange={(keys) => {
        const key = keys[0];
        if (key) onChange(key);
      }}
    >
      {label}: <span className="text-on-surface-subtle">{summary}</span>
    </Picker>
  );
}
