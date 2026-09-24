import { useLayoutEffect, useRef } from "react";
import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover, type MenuItemProps, type MenuProps } from "react-aria-components";
import { useOptionalSlot } from "../../themes/context";

export { MenuTrigger };

export type MenuFrameProps<T extends object = object> = MenuProps<T> & {
  /** Open and close without the pop animation (pickers, which open and close often). */
  instant?: boolean;
  popoverClassName?: string;
};

export type MenuItemVariant = "option" | "action";
export type MenuRowProps = MenuItemProps & { variant?: MenuItemVariant };

/**
 * Popover menu; pair with a `<Button>` inside `<MenuTrigger>`. Inside a theme that draws its own (the Menu and
 * MenuItem slots) it's the theme's; elsewhere, PlainMenu.
 */
export function Menu<T extends object>(props: MenuFrameProps<T>) {
  const Themed = useOptionalSlot("Menu");
  return Themed ? <Themed {...(props as MenuFrameProps)} /> : <PlainMenu {...props} />;
}

export function MenuItem(props: MenuRowProps) {
  const Themed = useOptionalSlot("MenuItem");
  return Themed ? <Themed {...props} /> : <PlainMenuItem {...props} />;
}

/**
 * A ref for a menu's list that starts it scrolled to the top on every open. Belt-and-suspenders on top of
 * autoFocus="first": that alone turned out not to be reliable — react-aria's own focus-strategy resolution can still
 * land the menu's real focused key on some arbitrary item (e.g. whatever was last hovered/focused the previous time
 * this menu was open), and focusing that off-screen item auto-scrolls the just-opened menu straight to it. The menu
 * fully unmounts on close (no leftover DOM between opens), so this mount-only effect reruns on every open, and —
 * because child effects flush before the parent's own — it runs after react-aria's internal focus/scroll effects
 * inside <AriaMenu>, so it wins and reliably lands the menu scrolled to the top.
 */
export function useMenuListRef() {
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, []);
  return listRef;
}

/** The unthemed menu: a raised surface with a hairline border. */
export function PlainMenu<T extends object>({ instant, popoverClassName = "", ...props }: MenuFrameProps<T>) {
  const listRef = useMenuListRef();

  return (
    <Popover
      placement="bottom end"
      offset={6}
      shouldSkipAnimation={instant}
      className={`${instant ? "" : "overlay-panel"} flex min-w-44 flex-col rounded-md border border-outline bg-surface-raised p-1 shadow-pop outline-none ${popoverClassName}`}
    >
      {/* max-h/overflow here, not just left to the Popover's own viewport-fit sizing — that constrains the panel
          height (so it stays on-screen) but doesn't add a scrollbar; without this, an option list too long for
          the popover's max-height was simply clipped, not scrollable — the options past that point were there,
          just invisible and unreachable. And min-h-0 in the popover's flex column: when the popover is squeezed
          below max-h-120 (a short window, or opening upward with little room above), the list shrinks with it and
          scrolls, instead of keeping its full height and spilling out past the panel's border.
          `props` is spread after, so a caller can still override autoFocus. */}
      <AriaMenu ref={listRef} autoFocus="first" {...props} className="max-h-120 min-h-0 overflow-y-auto outline-none" />
    </Popover>
  );
}

const MENU_ITEM_VARIANT: Record<MenuItemVariant, string> = {
  // A regular, selectable/actionable row.
  option: "text-sm text-on-surface-muted hover:text-on-surface focus:text-on-surface selected:text-on-surface",
  // A row that acts on the *list* rather than being part of it — a picker's "Select all"/"Deselect all", say.
  // Deliberately reads as a smaller, quieter control, not one more option to scan past — see Picker.tsx.
  action: "text-xs font-medium text-on-surface-subtle hover:text-on-surface focus:text-on-surface",
};

export function PlainMenuItem({ children, className, variant = "option", ...props }: MenuRowProps) {
  return (
    <AriaMenuItem
      {...props}
      className={`flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 outline-none hover:bg-surface-hover focus:bg-surface-hover disabled:opacity-40 ${MENU_ITEM_VARIANT[variant]} ${className ?? ""}`}
    >
      {children}
    </AriaMenuItem>
  );
}
