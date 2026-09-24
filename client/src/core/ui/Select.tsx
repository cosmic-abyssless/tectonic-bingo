import { useContext, useRef } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import { Button, Header, ListBox, ListBoxItem, ListBoxSection, Popover, Select as AriaSelect, SelectValue, type Key } from "react-aria-components";
import { FieldLabelContext, controlClass, type ControlSize } from "./Field";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { portalScope } from "./portalScope";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Options with a group are listed under its heading (like an <optgroup>), in the order the groups first appear. */
  group?: string;
}

// react-aria doesn't take "" as an item's key, but plenty of selects here have a "None"/"Select…" option whose value
// is "". It's swapped for this key on the way in and back on the way out.
const EMPTY_KEY = "\u0000empty";
const toKey = (value: string): Key => (value === "" ? EMPTY_KEY : value);
const fromKey = (key: Key): string => (key === EMPTY_KEY ? "" : String(key));

/**
 * The app's single-choice dropdown, in place of the browser's native <select> (which draws its own, platform-specific
 * list): a field-styled button that opens a listbox of the options, with react-aria's keyboard support and typeahead.
 * Inside a <Field>, it's labelled by the Field's label; elsewhere pass aria-label. Full width by default, like the
 * other controls; `className="w-auto!"` sizes it to its value.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  size = "md",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown while nothing is chosen (a value that isn't one of the options). */
  placeholder?: string;
  size?: ControlSize;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const labelledBy = useContext(FieldLabelContext);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.some((o) => o.value === value) ? toKey(value) : null;
  return (
    <AriaSelect
      selectedKey={selected}
      onSelectionChange={(key) => key !== null && onChange(fromKey(key))}
      placeholder={placeholder}
      isDisabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : (labelledBy ?? undefined)}
      disabledKeys={options.filter((o) => o.disabled).map((o) => toKey(o.value))}
      className={`inline-block w-full align-middle ${className ?? ""}`}
    >
      <Button ref={triggerRef} data-select-trigger="" className={`${controlClass(size)} flex cursor-pointer items-center gap-2 text-left outline-none focus-visible:border-on-surface/60`}>
        {/* Just the text: by default it repeats the chosen option's whole list row, check mark's box and all. */}
        <SelectValue className="min-w-0 flex-1 truncate data-[placeholder]:text-on-surface-subtle">
          {({ selectedText, isPlaceholder, defaultChildren }) => (isPlaceholder ? defaultChildren : selectedText)}
        </SelectValue>
        <ChevronDownIcon size={size === "sm" ? 12 : 14} className="shrink-0 text-on-surface-subtle" />
      </Button>
      {/* The list opens inside whatever styles the field (see portalScope), not at <body>, so it takes the same theme and
          palette as the field it came from. */}
      <UNSAFE_PortalProvider getContainer={() => portalScope(triggerRef.current)}>
        <Popover
          offset={4}
          className="flex min-w-[var(--trigger-width)] flex-col rounded-md border border-outline bg-surface-raised p-1 shadow-pop outline-none"
          data-select-list=""
        >
          <ListBox className="max-h-72 min-h-0 overflow-y-auto outline-none">
            {groupOptions(options).map(({ group, options: grouped }) =>
              group === undefined ? (
                grouped.map((o) => <Option key={o.value} option={o} size={size} />)
              ) : (
                <ListBoxSection key={group} className="[&:not(:first-child)]:mt-1">
                  <Header className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-subtle">{group}</Header>
                  {grouped.map((o) => (
                    <Option key={o.value} option={o} size={size} />
                  ))}
                </ListBoxSection>
              ),
            )}
          </ListBox>
        </Popover>
      </UNSAFE_PortalProvider>
    </AriaSelect>
  );
}

/** Runs of options by group, in order: ungrouped options stay where they are, each group gathers under its first appearance. */
function groupOptions(options: SelectOption[]): { group: string | undefined; options: SelectOption[] }[] {
  const runs: { group: string | undefined; options: SelectOption[] }[] = [];
  for (const option of options) {
    const last = runs.at(-1);
    const run = option.group === undefined ? (last && last.group === undefined ? last : undefined) : runs.find((r) => r.group === option.group);
    if (run) run.options.push(option);
    else runs.push({ group: option.group, options: [option] });
  }
  return runs;
}

function Option({ option, size }: { option: SelectOption; size: ControlSize }) {
  return (
    <ListBoxItem
      id={toKey(option.value)}
      textValue={option.label}
      className={`flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 text-on-surface-muted outline-none hover:bg-surface-hover hover:text-on-surface focus:bg-surface-hover focus:text-on-surface selected:text-on-surface disabled:opacity-40 ${size === "sm" ? "text-xs" : "text-sm"}`}
    >
      {({ isSelected }) => (
        <>
          <span className="flex size-3.5 shrink-0 items-center justify-center">{isSelected && <CheckIcon size={14} />}</span>
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
        </>
      )}
    </ListBoxItem>
  );
}
