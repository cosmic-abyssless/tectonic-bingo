import { Collection, Separator, type Key, type Selection } from "react-aria-components";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { Menu, MenuItem, MenuTrigger } from "./Menu";
import { TooltipSpan } from "./Tooltip";

export interface PickerOption {
  key: string;
  label: string;
  count?: number;
  /** This option wants looking at: an AttentionDot beside it, with this as its hover and screen-reader text. */
  attention?: string;
}

/** A small yellow "look here" dot, e.g. on a filter (and its option) with signups the admin should check. */
export function AttentionDot({ label, className }: { label: string; className?: string }) {
  return (
    // Hover only: it sits inside a filter's button or one of its options.
    <TooltipSpan text={label} label={label} hoverOnly className={`inline-block size-2 shrink-0 rounded-full bg-attention ${className ?? ""}`} />
  );
}

export const pickerTriggerClass = "!transition-[background-color,color] pressed:!scale-100";

/** The Select all row's id: without one React Aria makes one up (react-aria-1), which can't be told from an option. */
const SELECT_ALL_ID = "picker-select-all";

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

  // The Select all row is a menu item too, so a toggle can arrive with its key: its onAction does the picking, and its
  // key mustn't end up among the picks (prod saw `?submitters=<id>,react-aria-1`).
  function handleSelectionChange(keys: Selection) {
    if (keys === "all") return onSelectionChange(options.map((o) => o.key));
    const picked = [...keys].map((k: Key) => String(k));
    if (picked.includes(SELECT_ALL_ID)) return;
    onSelectionChange(picked);
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
              id={SELECT_ALL_ID}
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
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.attention && <AttentionDot label={option.attention} />}
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
