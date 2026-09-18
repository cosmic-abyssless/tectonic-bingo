import type { TileSearchModel } from "../../../headless/types";
import { Input } from "../../../core/ui/Field";
import { SearchIcon, XIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";

/**
 * Speech-bubble tail: two stacked CSS border-triangles. The bigger one is
 * in the outline colour, the smaller one (inset by the border width and
 * sitting a little higher) is in the paper fill, so it reads as a bordered
 * tail without any SVG. `outline` follows the box's current border colour
 * so the tail goes yellow on focus along with the frame.
 */
function BubbleTail({ outline, fill }: { outline: string; fill: string }) {
  return (
    <>
      <span
        className="pointer-events-none absolute transition-[border-top-color] duration-150"
        style={{ left: 18, bottom: -16, width: 0, height: 0, borderLeft: "13px solid transparent", borderRight: "13px solid transparent", borderTop: `15px solid ${outline}` }}
      />
      <span
        className="pointer-events-none absolute"
        style={{ left: 22, bottom: -10, width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderTop: `11px solid ${fill}` }}
      />
    </>
  );
}

/**
 * Search box in the same idiom as ComicButton: rectangular, 3px ink border,
 * hard shadow, h-10 — but with a speech-bubble tail hanging off the bottom
 * left. Focus is signalled the comic way: the border, shadow and tail switch
 * to the yellow highlighter and the box lifts a little further off the page.
 */
export function TileSearch({ search }: { search: TileSearchModel }) {
  const { colors } = useComic();
  const line = search.focused ? colors.YELLOW : colors.INK;
  const lift = search.focused ? 5 : 3;

  return (
    <div className="relative h-fit min-w-1/2 flex-1 pb-3">
      <div
        className="relative flex h-10 items-center gap-2 rounded-md border-[3px] px-3 transition-[box-shadow,border-color] duration-150"
        style={{ borderColor: line, background: colors.PAPER_RAISED, color: colors.INK, boxShadow: `${lift}px ${lift}px 0 ${line}` }}
      >
        <SearchIcon className="pointer-events-none shrink-0" style={{ color: colors.INK_SUBTLE }} />
        <Input
          ref={search.inputRef}
          type="text"
          placeholder="Search tiles, items…"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onFocus={() => search.setFocused(true)}
          onBlur={search.blur}
          onKeyDown={search.onKeyDown}
          className="!h-full min-w-0 flex-1 !rounded-none !border-none !bg-transparent !px-0 !text-current !outline-none placeholder:!text-current/50"
        />
        {search.query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              search.clear();
              search.inputRef.current?.focus();
            }}
            className="hit-40 flex shrink-0 items-center justify-center rounded-sm transition-colors hover:opacity-70"
            style={{ color: colors.INK }}
          >
            <XIcon />
          </button>
        )}
        <BubbleTail outline={line} fill={colors.PAPER_RAISED} />
      </div>

      {search.showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-md border-[3px]"
          style={{ borderColor: colors.INK, background: colors.PAPER_RAISED, boxShadow: `4px 4px 0 ${colors.INK}`, color: colors.INK }}
        >
          {search.results.map((tile, i) => {
            const active = i === search.highlightedIndex;
            return (
              <button
                key={tile.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => search.choose(tile.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
                style={{ background: active ? colors.YELLOW : undefined, color: active ? "#0b0b0d" : colors.INK }}
              >
                <span className="w-5 shrink-0 text-base leading-none" style={{ fontFamily: COMIC_FONT, color: active ? "#0b0b0d" : colors.INK_SUBTLE }}>
                  {i + 1}.
                </span>
                <span className="truncate text-sm font-medium">{tile.name}</span>
              </button>
            );
          })}
          {search.overflowCount > 0 && (
            <p className="border-t-[3px] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ borderColor: colors.INK, color: colors.INK_SUBTLE }}>
              {search.overflowCount} more — keep typing
            </p>
          )}
        </div>
      )}
    </div>
  );
}
