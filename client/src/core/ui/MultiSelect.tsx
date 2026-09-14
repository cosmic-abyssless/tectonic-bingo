import type { Key, Selection } from "react-aria-components";
import { Button } from "./Button";
import { ChevronDownIcon } from "./icons";
import { Menu, MenuItem, MenuTrigger } from "./Menu";

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
  const selectedSet = new Set(selected);
  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? (options.find((o) => o.key === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  function handleSelectionChange(keys: Selection) {
    onChange(keys === "all" ? options.map((o) => o.key) : [...keys].map((k: Key) => String(k)));
  }

  return (
    <MenuTrigger>
      <Button variant="secondary" size="sm" className={selected.length > 0 ? "border-fg" : ""}>
        <span className="text-fg-subtle">{label}:</span> {summary}
        <ChevronDownIcon size={14} />
      </Button>
      <Menu selectionMode="multiple" shouldCloseOnSelect={false} selectedKeys={selectedSet} onSelectionChange={handleSelectionChange} items={options}>
        {(option) => (
          <MenuItem id={option.key} textValue={option.label}>
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.count !== undefined && option.count > 0 && <span className="num text-fg-subtle">{option.count}</span>}
          </MenuItem>
        )}
      </Menu>
    </MenuTrigger>
  );
}
