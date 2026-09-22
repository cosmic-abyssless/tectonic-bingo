import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover, type MenuItemProps, type MenuProps } from "react-aria-components";

export { MenuTrigger };

/** Popover menu; pair with a `<Button>` inside `<MenuTrigger>`. */
export function Menu<T extends object>({ instant, popoverClassName = "", ...props }: MenuProps<T> & { instant?: boolean; popoverClassName?: string }) {
  return (
    <Popover
      placement="bottom end"
      offset={6}
      shouldSkipAnimation={instant}
      className={`${instant ? "" : "overlay-panel"} min-w-44 rounded-md border border-outline bg-surface-raised p-1 shadow-pop outline-none ${popoverClassName}`}
    >
      {/* max-h/overflow here, not just left to the Popover's own viewport-fit sizing — that constrains the panel
          height (so it stays on-screen) but doesn't add a scrollbar; without this, an option list too long for
          the popover's max-height was simply clipped, not scrollable — the options past that point were there,
          just invisible and unreachable. */}
      <AriaMenu {...props} className="max-h-120 overflow-y-auto outline-none" />
    </Popover>
  );
}

const MENU_ITEM_VARIANT = {
  // A regular, selectable/actionable row.
  option: "text-sm text-on-surface-muted hover:text-on-surface focus:text-on-surface selected:text-on-surface",
  // A row that acts on the *list* rather than being part of it — a picker's "Select all"/"Deselect all", say.
  // Deliberately reads as a smaller, quieter control, not one more option to scan past — see Picker.tsx.
  action: "text-xs font-medium text-on-surface-subtle hover:text-on-surface focus:text-on-surface",
} as const;

export function MenuItem({ children, className, variant = "option", ...props }: MenuItemProps & { variant?: keyof typeof MENU_ITEM_VARIANT }) {
  return (
    <AriaMenuItem
      {...props}
      className={`flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 outline-none hover:bg-surface-hover focus:bg-surface-hover disabled:opacity-40 ${MENU_ITEM_VARIANT[variant]} ${className ?? ""}`}
    >
      {children}
    </AriaMenuItem>
  );
}
