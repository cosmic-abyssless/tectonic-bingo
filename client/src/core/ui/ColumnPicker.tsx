import type { Key, Selection } from "react-aria-components";
import { Button } from "./Button";
import { applyColumnVisibility } from "./hiddenColumns";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { Menu, MenuItem, MenuTrigger } from "./Menu";

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
  const selected = new Set(columns.filter((c) => !hidden.has(c.id)).map((c) => c.id));
  const hiddenCount = columns.filter((c) => hidden.has(c.id)).length;

  function handleSelectionChange(keys: Selection) {
    const visible = keys === "all" ? columns.map((c) => c.id) : [...keys].map((k: Key) => String(k));
    onHiddenChange(applyColumnVisibility(hidden, columns.map((c) => c.id), visible));
  }

  if (columns.length === 0) return null;

  return (
    <MenuTrigger>
      <Button variant="secondary" size="sm" className="!transition-[background-color,color] pressed:!scale-100">
        Columns
        {hiddenCount > 0 && <span className="num text-on-surface-subtle">{hiddenCount} hidden</span>}
        <ChevronDownIcon size={14} />
      </Button>
      {/* max-w-64 so a long question prompt truncates instead of stretching the menu across the screen (the label span
          below is already `truncate`, which does nothing without a width to truncate against). */}
      <Menu
        instant
        popoverClassName="max-w-64"
        selectionMode="multiple"
        shouldCloseOnSelect={false}
        selectedKeys={selected}
        onSelectionChange={handleSelectionChange}
        items={columns.map((c) => ({ key: c.id, label: c.label }))}
      >
        {(option) => (
          <MenuItem id={option.key} textValue={option.label}>
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              {selected.has(option.key) && <CheckIcon size={14} />}
            </span>
            <span className="min-w-0 flex-1 truncate" title={option.label}>
              {option.label}
            </span>
          </MenuItem>
        )}
      </Menu>
    </MenuTrigger>
  );
}
