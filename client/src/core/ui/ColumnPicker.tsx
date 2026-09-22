import { applyColumnVisibility } from "./hiddenColumns";
import { usePickerParts } from "./usePickerParts";

export interface ColumnOption {
  id: string;
  label: string;
}

export function ColumnPicker({
  columns,
  hidden,
  onHiddenChange,
}: {
  columns: ColumnOption[];
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
}) {
  const { Picker } = usePickerParts();
  if (columns.length === 0) return null;

  const selected = new Set(columns.filter((c) => !hidden.has(c.id)).map((c) => c.id));
  const hiddenCount = columns.filter((c) => hidden.has(c.id)).length;

  return (
    <Picker
      options={columns.map((c) => ({ key: c.id, label: c.label }))}
      selectedKeys={selected}
      selectionMode="multiple"
      onSelectionChange={(visible) => onHiddenChange(applyColumnVisibility(hidden, columns.map((c) => c.id), visible))}
    >
      Columns
      {hiddenCount > 0 && <span className="num text-on-surface-subtle">{hiddenCount} hidden</span>}
    </Picker>
  );
}
