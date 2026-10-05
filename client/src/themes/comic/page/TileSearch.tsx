import { useRef } from "react";
import { Button, ComboBox, ListBox, ListBoxItem } from "react-aria-components";
import type { TileSearchModel } from "../../../headless/types";
import { controlClass } from "../../../core/ui/Field";
import { ComboFocusFirst, ComboFocusedKey, ComboInput, ComboPopover } from "../../../core/ui/SearchCombo";
import { SearchIcon, XIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";
import { LETTERED } from "../../lettering";

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
  const rootRef = useRef<HTMLDivElement>(null);
  // The speech bubble, which the list lines up under (not the bare text box inside it).
  const bubbleRef = useRef<HTMLDivElement>(null);
  const line = search.focused ? colors.YELLOW : colors.LINE;
  const shadow = search.focused ? colors.YELLOW : colors.SHADOW;
  const lift = search.focused ? 5 : 3;

  return (
    <ComboBox
      ref={rootRef}
      aria-label="Search tiles"
      className="relative h-fit min-w-1/2 flex-1 pb-3"
      items={search.results}
      inputValue={search.query}
      onInputChange={search.setQuery}
      selectedKey={null}
      onSelectionChange={(key) => key !== null && search.choose(String(key))}
      allowsCustomValue
    >
      {/* The top match is highlighted, so Enter opens it. */}
      <ComboFocusFirst />
      <ComboFocusedKey onChange={search.setHighlightedId} />
      <div
        ref={bubbleRef}
        className="relative flex h-10 items-center gap-2 rounded-md border-[3px] px-3 transition-[box-shadow,border-color] duration-150"
        style={{ borderColor: line, background: colors.PAPER_RAISED, color: colors.INK, boxShadow: `${lift}px ${lift}px 0 ${shadow}` }}
      >
        <SearchIcon className="pointer-events-none shrink-0" style={{ color: colors.INK_SUBTLE }} />
        <ComboInput
          ref={search.inputRef}
          placeholder="Search tiles, items…"
          onFocus={() => search.setFocused(true)}
          onBlur={() => search.setFocused(false)}
          className={`${controlClass()} !h-full min-w-0 flex-1 !rounded-none !border-none !bg-transparent !px-0 !text-current !outline-none placeholder:!text-current/50`}
        />
        {search.query && (
          // A bare ink cross, not ComicIconButton: its raised round button is too big for the bubble's line.
          <Button
            aria-label="Clear search"
            onPress={() => {
              search.clear();
              search.inputRef.current?.focus();
            }}
            className="hit-40 flex shrink-0 items-center justify-center rounded-sm outline-none transition-opacity hovered:opacity-70 focus-visible:ring-2 focus-visible:ring-current"
            style={{ color: colors.INK }}
          >
            <XIcon />
          </Button>
        )}
        <BubbleTail outline={line} fill={colors.PAPER_RAISED} />
      </div>

      <ComboPopover
        anchorRef={rootRef}
        triggerRef={bubbleRef}
        // Clear of the bubble's tail.
        offset={20}
        className="flex flex-col overflow-hidden rounded-md border-[3px] outline-none"
        style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `4px 4px 0 ${colors.SHADOW}`, color: colors.INK }}
      >
        <ListBox items={search.results} className="outline-none">
          {(tile) => (
            <ListBoxItem
              id={tile.id}
              textValue={tile.name}
              className="flex w-full cursor-default items-center gap-2 px-3 py-2 text-left outline-none transition-colors"
              style={({ isFocused }) => ({ background: isFocused ? colors.YELLOW : undefined, color: isFocused ? colors.ON_YELLOW : colors.INK })}
            >
              {({ isFocused }) => (
                <>
                  <span className={`${LETTERED} w-5 shrink-0 text-base leading-none`} style={{ fontFamily: COMIC_FONT, color: isFocused ? colors.ON_YELLOW : colors.INK_SUBTLE }}>
                    {search.results.indexOf(tile) + 1}.
                  </span>
                  <span className="truncate text-sm font-medium">{tile.name}</span>
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
        {search.overflowCount > 0 && (
          <p className="border-t-[3px] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ borderColor: colors.LINE, color: colors.INK_SUBTLE }}>
            {search.overflowCount} more — keep typing
          </p>
        )}
      </ComboPopover>
    </ComboBox>
  );
}
