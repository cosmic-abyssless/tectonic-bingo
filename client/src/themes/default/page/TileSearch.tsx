import type { TileSearchModel } from "../../../headless/types";
import { Input } from "../../../core/ui/Field";
import { SearchIcon, XIcon } from "../../../core/ui/icons";

export function TileSearch({ search }: { search: TileSearchModel }) {
  return (
    <div className="relative h-fit min-w-1/2 flex-1">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-subtle" />
      <Input
        ref={search.inputRef}
        type="text"
        placeholder="Search tiles, items…"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onFocus={() => search.setFocused(true)}
        onBlur={search.blur}
        onKeyDown={search.onKeyDown}
        className="pl-9 pr-10"
      />
      {search.query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            search.clear();
            search.inputRef.current?.focus();
          }}
          className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-on-surface-subtle transition-colors hover:bg-surface-hover hover:text-on-surface"
        >
          <XIcon />
        </button>
      )}
      {search.showDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-outline bg-surface-raised shadow-pop">
          {search.results.map((tile, i) => (
            <button
              key={tile.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => search.choose(tile.id)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${i === search.highlightedIndex ? "bg-surface-hover text-on-surface" : "text-on-surface-muted hover:bg-surface-hover"}`}
            >
              <span className="truncate font-medium">{tile.name}</span>
            </button>
          ))}
          {search.overflowCount > 0 && <p className="border-t border-outline px-3 py-2 text-xs text-on-surface-subtle">{search.overflowCount} more — keep typing to narrow down</p>}
        </div>
      )}
    </div>
  );
}
