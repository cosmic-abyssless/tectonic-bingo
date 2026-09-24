import { Menu as AriaMenu, MenuItem as AriaMenuItem, Popover } from "react-aria-components";
import { useMenuListRef, type MenuFrameProps, type MenuRowProps } from "../../../core/ui/Menu";
import { useComic } from "./useComic";

// The comic theme's Menu and MenuItem slots: every core menu on a comic page (the account menu, the pickers') as a
// raised paper panel with an ink border and a hard shadow, its highlighted row yellow, like the board's tile search
// results. Colours come from the palette in JS, not the chrome variables, since the popover mounts at <body>.

export function ComicMenu<T extends object>({ instant, popoverClassName = "", ...props }: MenuFrameProps<T>) {
  const { colors } = useComic();
  const listRef = useMenuListRef();
  return (
    <Popover
      placement="bottom end"
      offset={8}
      shouldSkipAnimation={instant}
      className={`${instant ? "" : "overlay-panel"} flex min-w-44 flex-col rounded-md border-[3px] p-1 outline-none ${popoverClassName}`}
      style={{ background: colors.PAPER_RAISED, borderColor: colors.LINE, color: colors.INK, boxShadow: `4px 4px 0 ${colors.LINE}` }}
    >
      {/* max-h/min-h-0: a list too long for the popover scrolls instead of being clipped (see PlainMenu). */}
      <AriaMenu ref={listRef} autoFocus="first" {...props} className="max-h-120 min-h-0 overflow-y-auto outline-none" />
    </Popover>
  );
}

export function ComicMenuItem({ children, className, variant = "option", ...props }: MenuRowProps) {
  const { colors } = useComic();
  const action = variant === "action";
  return (
    <AriaMenuItem
      {...props}
      className={`flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 outline-none disabled:opacity-40 ${action ? "text-xs font-semibold" : "text-sm font-semibold"} ${className ?? ""}`}
      style={({ isFocused }) => ({
        background: isFocused ? colors.YELLOW : undefined,
        color: isFocused ? colors.ON_YELLOW : action ? colors.INK_SUBTLE : colors.INK,
      })}
    >
      {children}
    </AriaMenuItem>
  );
}
