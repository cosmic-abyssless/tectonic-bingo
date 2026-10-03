import { forwardRef, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import {
  Button as AriaButton,
  Collection,
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
  /**
   * Picking one from a list: whether an item matches the text typed (lowercased, trimmed), when that's more than its
   * text containing it (a Tile found by its Items or Tags). `onQueryChange` hears that text as it's typed ("" while the
   * whole list shows), for a caller that has to look something up for it.
   */
  itemMatches?: (item: T, q: string) => boolean;
  onQueryChange?: (q: string) => void;
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
  itemMatches,
  onQueryChange,
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
  // A pick closes the list, and react-aria's close can report the selection again: that one isn't a pick.
  const picking = useRef(false);
  const choosing = selectedKey !== undefined;
  const byKey = new Map(items.map((item) => [toKey(itemKey(item)), item]));

  // Choosing: the box's text is ours, the chosen item's text until typed over, and the list is filtered on it once
  // typed in (react-aria's own filtering is left off: it trips React's dev tooling, and searching filters for itself).
  const chosen = choosing && selectedKey !== null ? byKey.get(toKey(selectedKey)) : undefined;
  const chosenText = chosen ? itemText(chosen) : "";
  const [text, setText] = useState(chosenText);
  const [filtering, setFiltering] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(chosenText);
  }, [chosenText]);

  const query = choosing ? text : (inputValue ?? "");
  const q = query.trim().toLowerCase();
  const shown = choosing && filtering && q ? items.filter((item) => (itemMatches ? itemMatches(item, q) : itemText(item).toLowerCase().includes(q))) : items;
  const filterQuery = choosing && filtering ? q : "";
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;
  useEffect(() => onQueryChangeRef.current?.(filterQuery), [filterQuery]);

  // Put the input away: focus goes to the enclosing dialog (or, with none, nowhere). Not to <body>: a modal's focus
  // trap would just hand focus back to the first field. A frame later: react-aria puts focus back on the box after a pick.
  const dismissInput = () =>
    requestAnimationFrame(() => {
      const host = rootRef.current?.closest<HTMLElement>('[role="dialog"]');
      if (host) host.focus({ preventScroll: true });
      else rootRef.current?.querySelector("input")?.blur();
    });

  const pick = (key: Key | null) => {
    if (picking.current) return;
    const byPointer = pickedByPointer.current;
    pickedByPointer.current = false;
    const item = key === null ? undefined : byKey.get(key);
    picking.current = true;
    try {
      if (choosing) {
        // Also how react-aria puts the box back (a null key, or the chosen one, on blur or Escape): show what's chosen.
        if (item && item !== chosen) onPick(item);
        setText(item ? itemText(item) : chosenText);
        setFiltering(false);
        stateRef.current?.close();
        if (item && byPointer) dismissInput();
        return;
      }
      if (!item) return;
      onPick(item);
      if (clearOnPick) onInputChange?.("");
      // Nothing stays selected (a pick is an action), so react-aria wouldn't close the list itself.
      stateRef.current?.close();
    } finally {
      picking.current = false;
    }
  };

  const hasNote = !!loading || (!!emptyText && (choosing || q !== ""));

  return (
    <ComboBox
      ref={rootRef}
      className={`relative ${className ?? ""}`}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : (labelledBy ?? undefined)}
      items={entries(shown, itemKey, itemSection)}
      selectedKey={choosing && selectedKey !== null && chosen ? toKey(selectedKey) : null}
      inputValue={query}
      onInputChange={(v) => {
        if (!choosing) return onInputChange?.(v);
        setText(v);
        setFiltering(true);
        if (stateRef.current && !stateRef.current.isOpen) stateRef.current.open(null, "input");
      }}
      onOpenChange={(open, trigger) => {
        // Opened by focus, a click or the arrows, rather than by typing: the whole list, and typing replaces what's
        // chosen rather than adding to its text.
        if (choosing && open && trigger !== "input") {
          setFiltering(false);
          rootRef.current?.querySelector("input")?.select();
        }
      }}
      // Searching, the text is free and stays; choosing, it goes back to what's chosen.
      allowsCustomValue={!choosing}
      onSelectionChange={pick}
      // Choosing, the list opens on focus and on typing (below), but not when a pick puts the chosen text in the box.
      menuTrigger={choosing ? "manual" : "input"}
      // Also while there are rows to show: react-aria builds its list a render behind, so when a search's results arrive
      // (and "Searching…" goes) it still sees the empty list for a moment, and would close for good.
      allowsEmptyCollection={hasNote || shown.length > 0}
      isReadOnly={readOnly}
    >
      <StateRef stateRef={stateRef} />
      {/* Choosing, once typed in: the top match is highlighted, so Enter picks it. Searching (an item name, a user), Enter
          keeps what's typed until a row is picked. */}
      <ComboFocusFirst enabled={choosing && filtering && q !== ""} />
      <ComboInput
        ref={inputRef}
        placeholder={placeholder}
        clearsOnEscape={!choosing}
        opensOnClick={choosing && !readOnly}
        onFocus={(e) => {
          focused.current = true;
          // Choosing: typing replaces what's chosen, rather than adding to its text.
          if (choosing) e.currentTarget.select();
          if (choosing && !readOnly) stateRef.current?.open(null, "focus");
          onFocus?.();
        }}
        onBlur={() => {
          focused.current = false;
          onBlur?.();
        }}
        className={`${inputClassName ?? controlClass()} ${choosing ? (readOnly ? "cursor-default select-none text-on-surface-muted" : "pr-9") : ""}`}
      />
      {choosing && !readOnly && (
        <AriaButton aria-label="Show options" className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 cursor-default items-center justify-center text-on-surface-subtle outline-none">
          <ChevronDownIcon />
        </AriaButton>
      )}
      {children}
      <ComboPopover anchorRef={rootRef} triggerRef={rootRef} style={minListWidth ? { minWidth: `max(var(--trigger-width), ${minListWidth}px)` } : undefined}>
        <ListBox<Entry<T>>
          className="max-h-64 min-h-0 overflow-y-auto p-1 outline-none"
          renderEmptyState={() => <div className="px-2.5 py-1.5 text-sm text-on-surface-subtle">{loading ? "Searching…" : emptyText}</div>}
        >
          {(entry) => {
            const row = (r: Row<T>) => (
              <ListBoxItem
                id={r.id}
                textValue={itemText(r.item)}
                onPressStart={(e) => (pickedByPointer.current = e.pointerType !== "keyboard" && e.pointerType !== "virtual")}
                // Only the highlight, no hover look of its own: pointing at a row highlights it, and a hover background
                // beat the highlight's while its text took the highlight's colour (dark on dark in dark mode).
                className="flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm text-on-surface outline-none data-[focused]:bg-accent data-[focused]:text-on-accent"
              >
                {({ isFocused }) => (renderItem ? renderItem(r.item, { isFocused }) : <span className="truncate">{itemText(r.item)}</span>)}
              </ListBoxItem>
            );
            return "section" in entry ? (
              <ListBoxSection id={entry.id}>
                <Header className="sticky top-0 z-10 -mx-1 border-b border-outline bg-surface-raised px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">{entry.section}</Header>
                <Collection items={entry.rows}>{row}</Collection>
              </ListBoxSection>
            ) : (
              row(entry)
            );
          }}
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

type Row<T> = { id: Key; item: T };
type Entry<T> = Row<T> | { id: Key; section: string; rows: Row<T>[] };

/** The list's entries: rows without a section first, then each section's, in the order the sections first appear. */
function entries<T>(items: T[], keyOf: (item: T) => string, sectionOf?: (item: T) => string | undefined): Entry<T>[] {
  const unsectioned: Row<T>[] = [];
  const sections = new Map<string, Row<T>[]>();
  for (const item of items) {
    const row = { id: toKey(keyOf(item)), item };
    const section = sectionOf?.(item);
    if (section === undefined) unsectioned.push(row);
    else sections.set(section, [...(sections.get(section) ?? []), row]);
  }
  return [...unsectioned, ...[...sections].map(([section, rows]) => ({ id: `\u0000section:${section}`, section, rows }))];
}

/**
 * A ComboBox's text box. Escape closes an open list (and stops there, rather than also closing the dialog it's in);
 * with the list closed, a second Escape clears the text (`clearsOnEscape`), and only an empty box lets Escape through.
 */
export const ComboInput = forwardRef<HTMLInputElement, ComponentProps<typeof AriaInput> & { clearsOnEscape?: boolean; opensOnClick?: boolean }>(function ComboInput(
  { clearsOnEscape = true, opensOnClick, onKeyDown, onClick, onFocus, onBlur, ...props },
  ref,
) {
  // react-aria fires a blur and then a focus at the box as the keyboard moves on and off the list's rows, while the box
  // keeps focus throughout: those aren't the box losing or getting focus, so they don't reach onFocus/onBlur.
  const hasFocus = useRef(false);
  // As of this render, i.e. before the key: react-aria has already closed the list by the time this handler runs.
  const state = useContext(ComboBoxStateContext);
  const wasOpen = state?.isOpen ?? false;
  return (
    <AriaInput
      ref={ref}
      {...props}
      onFocus={(e) => {
        if (hasFocus.current) return;
        hasFocus.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        if (document.activeElement === e.currentTarget) return;
        hasFocus.current = false;
        onBlur?.(e);
      }}
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
export function ComboPopover({
  anchorRef,
  triggerRef,
  offset = 4,
  className,
  style,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  /** What the list lines up under and takes the width of, when that's not the text box itself (a theme's frame around it). */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** The gap between the box and the list. */
  offset?: number;
  className?: string;
  style?: PopoverProps["style"];
  children: ReactNode;
}) {
  return (
    <UNSAFE_PortalProvider getContainer={() => portalScope(anchorRef.current)}>
      <Popover
        offset={offset}
        {...(triggerRef ? { triggerRef } : {})}
        // A hook for a theme's CSS to dress the list (the comic signup stage gives it an ink border).
        data-select-list=""
        // The list takes the width of the box (or the frame it lines up under), measured as it opens. Not react-aria's
        // own --trigger-width: it reads the box's on-screen size once, when it first appears, so a box that first appears
        // in a dialog still scaling up as it opens left the list that much narrower for good.
        style={(values) => {
          const own = typeof style === "function" ? style(values) : style;
          const width = (triggerRef ?? anchorRef).current?.offsetWidth;
          return width ? { ...own, width, "--trigger-width": `${width}px` } : (own ?? {});
        }}
        className={className ?? "flex w-[var(--trigger-width)] flex-col rounded-md border border-outline bg-surface-raised shadow-pop outline-none"}
      >
        {children}
      </Popover>
    </UNSAFE_PortalProvider>
  );
}

/**
 * Keeps the top match highlighted while the list is open and no other row is, so Enter picks it. react-aria clears the
 * highlight whenever the text changes, in its own effect, after this component's and without a re-render when the
 * highlight was already set; so this puts it back on the first row a frame later, once react-aria is done.
 */
export function ComboFocusFirst({ enabled = true }: { enabled?: boolean }) {
  const state = useContext(ComboBoxStateContext);
  useEffect(() => {
    if (!enabled || !state?.isOpen) return;
    const frame = requestAnimationFrame(() => {
      const { collection, selectionManager } = state;
      if (selectionManager.focusedKey != null) return;
      let key = collection.getFirstKey();
      while (key != null && (collection.getItem(key)?.type !== "item" || selectionManager.isDisabled(key))) key = collection.getKeyAfter(key);
      if (key != null) selectionManager.setFocusedKey(key);
    });
    return () => cancelAnimationFrame(frame);
  });
  return null;
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
