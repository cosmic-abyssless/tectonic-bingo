import type { Key, Selection } from "react-aria-components";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { Menu, MenuItem, MenuTrigger } from "./Menu";

export interface PickerOption {
  key: string;
  label: string;
  count?: number;
}

export const pickerTriggerClass = "!transition-[background-color,color] pressed:!scale-100";

export function Picker({
  options,
  selectedKeys,
  onSelectionChange,
  selectionMode,
  active,
  children,
}: {
  options: PickerOption[];
  selectedKeys: Set<string>;
  onSelectionChange: (keys: string[]) => void;
  selectionMode: "multiple" | "single";
  active?: boolean;
  children: ReactNode;
}) {
  const multiple = selectionMode === "multiple";

  function handleSelectionChange(keys: Selection) {
    onSelectionChange(keys === "all" ? options.map((o) => o.key) : [...keys].map((k: Key) => String(k)));
  }

  return (
    <MenuTrigger>
      <Button variant="secondary" size="sm" className={`${pickerTriggerClass}${active ? " border-on-surface" : ""}`}>
        {children}
        <ChevronDownIcon size={14} />
      </Button>
      <Menu
        instant
        popoverClassName="max-w-64"
        selectionMode={selectionMode}
        disallowEmptySelection={!multiple}
        shouldCloseOnSelect={!multiple}
        selectedKeys={selectedKeys}
        onSelectionChange={handleSelectionChange}
        items={options}
      >
        {(option) => (
          <MenuItem id={option.key} textValue={option.label}>
            {({ isSelected }) => (
              <>
                <span className="flex size-3.5 shrink-0 items-center justify-center">{isSelected && <CheckIcon size={14} />}</span>
                <span className="min-w-0 flex-1 truncate" title={option.label}>
                  {option.label}
                </span>
                {option.count != null && option.count > 0 && <span className="num text-on-surface-subtle">{option.count}</span>}
              </>
            )}
          </MenuItem>
        )}
      </Menu>
    </MenuTrigger>
  );
}
