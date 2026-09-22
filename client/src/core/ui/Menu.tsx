import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover, type MenuItemProps, type MenuProps } from "react-aria-components";
import type { ReactNode } from "react";

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
      <AriaMenu {...props} className="outline-none" />
    </Popover>
  );
}

export function MenuItem({ children, className, ...props }: MenuItemProps & { children: ReactNode }) {
  return (
    <AriaMenuItem
      {...props}
      className={`flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-on-surface-muted outline-none hover:bg-surface-hover hover:text-on-surface focus:bg-surface-hover focus:text-on-surface selected:text-on-surface disabled:opacity-40 ${className ?? ""}`}
    >
      {children}
    </AriaMenuItem>
  );
}
