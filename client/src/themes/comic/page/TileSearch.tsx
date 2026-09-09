import type { TileSearchModel } from "../../../headless/types";
import { Input } from "../../../core/ui/Field";
import { SearchIcon, XIcon } from "../../../core/ui/icons";

// The tail is two stacked CSS border-triangles: a bigger one in the outline
// color, a smaller one (inset by the outline width, sitting slightly higher)
// in the fill color — the same trick used for a bordered speech-bubble tail
// in flat illustration. `outline` tracks the bubble's current border color
// (line normally, accent while actively searching) so the tail always
// matches; the fill stays the bubble's own surface color.
function BubbleTail({ outline }: { outline: string }) {
  return (
    <>
      <span
        className="pointer-events-none absolute transition-[border-top-color] duration-150"
        style={{ left: 22, bottom: -16, width: 0, height: 0, borderLeft: "13px solid transparent", borderRight: "13px solid transparent", borderTop: `15px solid ${outline}` }}
      />
      <span
        className="pointer-events-none absolute"
        style={{ left: 26, bottom: -10, width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderTop: "11px solid var(--color-surface)" }}
      />
    </>
  );
}

export function TileSearch({ search }: { search: TileSearchModel }) {
  // A single state drives both cues, since they're really the same "you're
  // talking to this bubble right now" moment: outline + tail go accent and
  // the hard shadow lifts further off the page while the input has focus.
  const outlineColor = search.focused ? "var(--color-accent)" : "var(--color-line)";
  const liftPx = search.focused ? 6 : 3;

  return (
    <div className="relative h-fit min-w-1/2 flex-1 pb-3">
      <div
        className="relative flex items-center gap-2 rounded-full border-[3px] px-4 transition-[box-shadow,border-color] duration-150"
        style={{ height: 42, borderColor: outlineColor, backgroundColor: "var(--color-surface)", boxShadow: `${liftPx}px ${liftPx}px 0 ${outlineColor}` }}
      >
        {/* Icon, input, and clear button are plain flex children — not
            absolutely positioned — so they stay inside the bubble's padded
            content box no matter how wide the pill ends up being. */}
        <SearchIcon className="pointer-events-none shrink-0 text-fg-subtle" />
        <Input
          ref={search.inputRef}
          type="text"
          placeholder="Search tiles, items…"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onFocus={() => search.setFocused(true)}
          onBlur={search.blur}
          onKeyDown={search.onKeyDown}
          className="!h-full min-w-0 flex-1 !rounded-full !border-none !bg-transparent !px-0 !outline-none"
        />
        {search.query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              search.clear();
              search.inputRef.current?.focus();
            }}
            className="hit-40 flex shrink-0 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:text-fg"
          >
            <XIcon />
          </button>
        )}
        <BubbleTail outline={outlineColor} />
      </div>
      {search.showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-4 overflow-hidden rounded-2xl border-[3px]"
          style={{ borderColor: "var(--color-accent)", backgroundColor: "var(--color-surface-raised)", boxShadow: "3px 3px 0 var(--color-accent)" }}
        >
          {search.results.map((tile, i) => (
            <button
              key={tile.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => search.choose(tile.id)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${i === search.highlightedIndex ? "bg-surface-hover text-fg" : "text-fg-muted hover:bg-surface-hover"}`}
            >
              <span className="truncate font-medium">{tile.name}</span>
            </button>
          ))}
          {search.overflowCount > 0 && (
            <p className="border-t border-line px-3 py-2 text-xs text-fg-subtle">
              {search.overflowCount} more — keep typing to narrow down
            </p>
          )}
        </div>
      )}
    </div>
  );
}
