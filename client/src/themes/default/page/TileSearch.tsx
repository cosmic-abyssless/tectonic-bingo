import { useRef } from "react";
import { ComboBox, ListBox, ListBoxItem } from "react-aria-components";
import type { TileSearchModel } from "../../../headless/types";
import { controlClass } from "../../../core/ui/Field";
import { ComboFocusedKey, ComboInput, ComboPopover } from "../../../core/ui/SearchCombo";
import { SearchIcon, XIcon } from "../../../core/ui/icons";
import { IconButton } from "../../../core/ui/Button";

export function TileSearch({ search }: { search: TileSearchModel }) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <ComboBox
      ref={rootRef}
      aria-label="Search tiles"
      className="relative h-fit min-w-1/2 flex-1"
      items={search.results}
      inputValue={search.query}
      onInputChange={search.setQuery}
      selectedKey={null}
      onSelectionChange={(key) => key !== null && search.choose(String(key))}
      allowsCustomValue
    >
      <ComboFocusedKey onChange={search.setHighlightedId} />
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-subtle" />
      <ComboInput
        ref={search.inputRef}
        placeholder="Search tiles, items…"
        onFocus={() => search.setFocused(true)}
        onBlur={() => search.setFocused(false)}
        className={`${controlClass()} pl-9 pr-10`}
      />
      {search.query && (
        <IconButton
          size="sm"
          label="Clear search"
          onPress={() => {
            search.clear();
            search.inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          <XIcon />
        </IconButton>
      )}
      <ComboPopover anchorRef={rootRef} className="flex w-[var(--trigger-width)] flex-col overflow-hidden rounded-md border border-outline bg-surface-raised shadow-pop outline-none">
        <ListBox items={search.results} className="outline-none">
          {(tile) => (
            <ListBoxItem
              id={tile.id}
              textValue={tile.name}
              className="flex w-full cursor-default items-center px-3 py-2 text-left text-sm text-on-surface-muted outline-none transition-colors data-[focused]:bg-surface-hover data-[focused]:text-on-surface"
            >
              <span className="truncate font-medium">{tile.name}</span>
            </ListBoxItem>
          )}
        </ListBox>
        {search.overflowCount > 0 && <p className="border-t border-outline px-3 py-2 text-xs text-on-surface-subtle">{search.overflowCount} more — keep typing to narrow down</p>}
      </ComboPopover>
    </ComboBox>
  );
}
