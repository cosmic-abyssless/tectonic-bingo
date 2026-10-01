import { forwardRef, useContext, useEffect, useRef, type ComponentProps, type ReactNode, type Ref } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import {
  Button as AriaButton,
  ComboBox,
  ComboBoxStateContext,
  Header,
  Input as AriaInput,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  type Key,
  type PopoverProps,
} from "react-aria-components";
import { FieldLabelContext, controlClass } from "./Field";
import { ChevronDownIcon } from "./icons";
import { portalScope } from "./portalScope";

/*
 * The app's search-as-you-type dropdown, on react-aria's ComboBox: a text box with a listbox under it, so every one of
 * them gets the same keyboard (arrows, Home/End, Enter picks, Escape closes and a second Escape clears the text) and
 * combobox/listbox semantics, the highlighted row announced. SearchCombo is the whole thing for the core components
 * (ItemSearchInput, SearchableSelect, UserSearchInput); the board's Tile searches draw their own input and rows on
 * ComboBox with the pieces exported below (ComboInput, ComboPopover, ComboFocusedKey).
 */

// react-aria doesn't take "" as an item's key, but option lists here can hold a "None" whose id is "".
const EMPTY_KEY = "\u0000empty";
const toKey = (id: string): Key => (id === "" ? EMPTY_KEY : id);
const fromKey = (key: Key): string => (key === EMPTY_KEY ? "" : String(key));

export interface SearchComboProps<T> {
  items: T[];
  itemKey: (item: T) => string;
  /** The row's text: what's announced, and, picking from a list, what the box shows once it's picked and is filtered on. */
  itemText: (item: T) => string;
  /** Rows with a section are listed under its heading, after the rows without one, in the order the sections first appear. */
  itemSection?: (item: T) => string | undefined;
  /** The row's content, when it's more than its text. */
  renderItem?: (item: T, state: { isFocused: boolean }) => ReactNode;
  onPick: (item: T) => void;
  /**
   * Picking one from a list (SearchableSelect): which item is chosen, or null for none. The box shows the chosen
   * item's text when closed, opens on focus with the whole list, and the list is filtered on the text typed. Leave it
   * undefined to search instead: the caller owns the text (inputValue) and passes `items` already matched to it.
   */
  selectedKey?: string | null;
  /** Searching: the box's text, which the caller matches `items` against. */
  inputValue?: string;
  onInputChange?: (value: string) => void;
  /** Empty the box once something is picked. */
  clearOnPick?: boolean;
  /** Shows the value, can't be opened or typed in. */
  readOnly?: boolean;
  /** Results are on their way: the list shows "Searching…" while it has none yet. */
  loading?: boolean;
  /** Shown in the list when nothing matches the text typed. Omit to just close the list. */
  emptyText?: string;
  placeholder?: string;
  "aria-label"?: string;
  /** On the box's wrapper (relative-positioned) — layout and sizing, e.g. "flex-1". */
  className?: string;
  inputClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Drawn over the box, e.g. an icon at its left edge. */
  children?: ReactNode;
  /** The list's own width, when the box is narrower than its rows need. */
  minListWidth?: number;
}

export function SearchCombo<T>({
  items,
  itemKey,
  itemText,
  itemSection,
  renderItem,
  onPick,
  selectedKey,
  inputValue,
  onInputChange,
  clearOnPick,
  readOnly,
  loading,
  emptyText,
  placeholder,
  "aria-label": ariaLabel,
  className,
  inputClassName,
  inputRef,
  onFocus,
  onBlur,
  children,
  minListWidth,
}: SearchComboProps<T>) {
  const labelledBy = useContext(FieldLabelContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ComboState>(null);
  // Picked with a tap or click rather than the keyboard: choosing, that puts the box away after, so a phone's keyboard
  // closes (see dismissInput).
  const pickedByPointer = useRef(false);
  const choosing = selectedKey !== undefined;
  const byKey = new Map(items.map((item) => [toKey(itemKey(item)), item]));

  // Put the input away: focus goes to the enclosing dialog (or, with none, nowhere). Not to <body>: a modal's focus
  // trap would just hand focus back to the first field.
  const dismissInput = () => {
    const host = rootRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (host) host.focus({ preventScroll: true });
    else rootRef.current?.querySelector("input")?.blur();
  };

  const pick = (key: Key | null) => {
    const byPointer = pickedByPointer.current;
    pickedByPointer.current = false;
    const item = key === null ? undefined : byKey.get(key);
    // A null key is the text being cleared, which isn't a pick: closing puts the chosen item's text back.
    if (!item) return;
    onPick(item);
    if (clearOnPick) onInputChange?.("");
    // The selection stays where the caller holds it (none, searching), so react-aria wouldn't close the list itself.
    stateRef.current?.close();
    if (choosing && byPointer) dismissInput();
  };

  const query = inputValue ?? "";
  const hasNote = !!loading || (!!emptyText && (choosing || query.trim() !== ""));

  return (
    <ComboBox
      ref={rootRef}
      className={`relative ${className ?? ""}`}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : (labelledBy ?? undefined)}
      // Choosing: react-aria filters the list on the text and shows the chosen item's text. Searching: the caller
      // owns both, the text never reverts, and nothing stays selected (a pick is an action).
      {...(choosing ? { selectedKey: selectedKey === null ? null : toKey(selectedKey) } : { selectedKey: null, inputValue: query, onInputChange, allowsCustomValue: true })}
      onSelectionChange={pick}
      menuTrigger={choosing ? "focus" : "input"}
      allowsEmptyCollection={hasNote}
      isReadOnly={readOnly}
    >
      <StateRef stateRef={stateRef} />
      <ComboInput
        ref={inputRef}
        placeholder={placeholder}
        clearsOnEscape={!choosing}
        opensOnClick={choosing && !readOnly}
        onFocus={(e) => {
          // Choosing: typing replaces what's chosen, rather than adding to its text.
          if (choosing) e.currentTarget.select();
          onFocus?.();
        }}
        onBlur={onBlur}
        className={`${inputClassName ?? controlClass()} ${choosing ? (readOnly ? "cursor-default select-none text-on-surface-muted" : "pr-9") : ""}`}
      />
      {choosing && !readOnly && (
        <AriaButton aria-label="Show options" className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 cursor-default items-center justify-center text-on-surface-subtle outline-none">
          <ChevronDownIcon />
        </AriaButton>
      )}
      {children}
      <ComboPopover anchorRef={rootRef} style={minListWidth ? { minWidth: `max(var(--trigger-width), ${minListWidth}px)` } : undefined}>
        <ListBox
          className="max-h-64 min-h-0 overflow-y-auto p-1 outline-none"
          renderEmptyState={() => <div className="px-2.5 py-1.5 text-sm text-on-surface-subtle">{loading ? "Searching…" : emptyText}</div>}
        >
          {sectionRuns(items, itemSection).map(({ section, items: run }) => {
            const rows = run.map((item) => (
              <ListBoxItem
                key={itemKey(item)}
                id={toKey(itemKey(item))}
                textValue={itemText(item)}
                onPressStart={(e) => (pickedByPointer.current = e.pointerType !== "keyboard" && e.pointerType !== "virtual")}
                className="flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm text-on-surface outline-none hovered:bg-surface-hover data-[focused]:bg-accent data-[focused]:text-on-accent"
              >
                {({ isFocused }) => (renderItem ? renderItem(item, { isFocused }) : <span className="truncate">{itemText(item)}</span>)}
              </ListBoxItem>
            ));
            return section === undefined ? (
              rows
            ) : (
              <ListBoxSection key={section} id={`section:${section}`}>
                <Header className="sticky top-0 z-10 -mx-1 border-b border-outline bg-surface-raised px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">{section}</Header>
                {rows}
              </ListBoxSection>
            );
          })}
        </ListBox>
      </ComboPopover>
    </ComboBox>
  );
}

type ComboState = NonNullable<React.ContextType<typeof ComboBoxStateContext>>;

/** Hands the ComboBox's state out to SearchCombo, which closes the list after a pick it keeps no selection for. */
function StateRef({ stateRef }: { stateRef: React.MutableRefObject<ComboState | null> }) {
  stateRef.current = useContext(ComboBoxStateContext);
  return null;
}

/** Rows without a section first, then each section's, in the order the sections first appear. */
function sectionRuns<T>(items: T[], sectionOf?: (item: T) => string | undefined): { section: string | undefined; items: T[] }[] {
  if (!sectionOf) return [{ section: undefined, items }];
  const unsectioned: T[] = [];
  const sections = new Map<string, T[]>();
  for (const item of items) {
    const section = sectionOf(item);
    if (section === undefined) unsectioned.push(item);
    else sections.set(section, [...(sections.get(section) ?? []), item]);
  }
  return [{ section: undefined, items: unsectioned }, ...[...sections].map(([section, run]) => ({ section, items: run }))];
}

/**
 * A ComboBox's text box. Escape closes an open list (and stops there, rather than also closing the dialog it's in);
 * with the list closed, a second Escape clears the text (`clearsOnEscape`), and only an empty box lets Escape through.
 */
export const ComboInput = forwardRef<HTMLInputElement, ComponentProps<typeof AriaInput> & { clearsOnEscape?: boolean; opensOnClick?: boolean }>(function ComboInput(
  { clearsOnEscape = true, opensOnClick, onKeyDown, onClick, ...props },
  ref,
) {
  // As of this render, i.e. before the key: react-aria has already closed the list by the time this handler runs.
  const state = useContext(ComboBoxStateContext);
  const wasOpen = state?.isOpen ?? false;
  return (
    <AriaInput
      ref={ref}
      {...props}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key !== "Escape" || !state || e.currentTarget.readOnly) return;
        if (wasOpen) e.stopPropagation();
        else if (clearsOnEscape && state.inputValue !== "") {
          e.stopPropagation();
          state.setInputValue("");
        }
      }}
      onClick={(e) => {
        onClick?.(e);
        // Choosing, a click on the box opens the list again after a pick from the keyboard left the box focused.
        if (opensOnClick && state && !state.isOpen) state.open(null, "manual");
      }}
    />
  );
});

/**
 * A ComboBox's list, mounted inside whatever styles the field (see portalScope) so it takes the field's theme. Takes the
 * box's width; className replaces the plain raised surface (a theme drawing its own).
 */
export function ComboPopover({ anchorRef, className, style, children }: { anchorRef: React.RefObject<HTMLElement | null>; className?: string; style?: PopoverProps["style"]; children: ReactNode }) {
  return (
    <UNSAFE_PortalProvider getContainer={() => portalScope(anchorRef.current)}>
      <Popover
        offset={4}
        // A hook for a theme's CSS to dress the list (the comic signup stage gives it an ink border).
        data-select-list=""
        style={style}
        className={className ?? "flex w-[var(--trigger-width)] flex-col rounded-md border border-outline bg-surface-raised shadow-pop outline-none"}
      >
        {children}
      </Popover>
    </UNSAFE_PortalProvider>
  );
}

/** Reports the row the keyboard or pointer is on while the list is open (null otherwise), e.g. to point it out on the board. */
export function ComboFocusedKey({ onChange }: { onChange: (key: string | null) => void }) {
  const state = useContext(ComboBoxStateContext);
  const key = state?.isOpen && state.selectionManager.focusedKey != null ? fromKey(state.selectionManager.focusedKey) : null;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => onChangeRef.current(key), [key]);
  return null;
}
