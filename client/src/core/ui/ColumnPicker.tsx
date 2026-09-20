import type { Key, Selection } from "react-aria-components";
import { Button } from "./Button";
import { applyColumnVisibility } from "./hiddenColumns";
import { ChevronDownIcon } from "./icons";
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
      <Button variant="secondary" size="sm">
        Columns
        {hiddenCount > 0 && <span className="num text-on-surface-subtle">{hiddenCount} hidden</span>}
        <ChevronDownIcon size={14} />
      </Button>
      <Menu selectionMode="multiple" shouldCloseOnSelect={false} selectedKeys={selected} onSelectionChange={handleSelectionChange} items={columns.map((c) => ({ key: c.id, label: c.label }))}>
        {(option) => (
          <MenuItem id={option.key} textValue={option.label}>
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </MenuItem>
        )}
      </Menu>
    </MenuTrigger>
  );
}
