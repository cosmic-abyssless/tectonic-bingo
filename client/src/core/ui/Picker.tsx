import { Collection, Separator, type Key, type Selection } from "react-aria-components";
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
  const allSelected = options.length > 0 && options.every((o) => selectedKeys.has(o.key));

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
      >
        {/* Acts on the list, isn't one of its options — own row/action (onAction, not a checkbox in
            selectedKeys), visually set apart (variant="action", a divider) so it doesn't read as just one
            more thing to pick. Multi-select only: for a single choice, "select all" makes no sense. */}
        {multiple && options.length > 0 && (
          <>
            <MenuItem
              variant="action"
              textValue={allSelected ? "Deselect all" : "Select all"}
              shouldCloseOnSelect={false}
              onAction={() => onSelectionChange(allSelected ? [] : options.map((o) => o.key))}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </MenuItem>
            <Separator className="my-1 h-px border-none bg-outline" />
          </>
        )}
        <Collection items={options}>
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
        </Collection>
      </Menu>
    </MenuTrigger>
  );
}
