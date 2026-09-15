import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover, type MenuItemProps, type MenuProps } from "react-aria-components";
import type { ReactNode } from "react";

export { MenuTrigger };

/** Popover menu; pair with a `<Button>` inside `<MenuTrigger>`. */
export function Menu<T extends object>(props: MenuProps<T>) {
  return (
    <Popover placement="bottom end" offset={6} className="overlay-panel min-w-44 rounded-md border border-outline bg-surface-raised p-1 shadow-pop outline-none">
      <AriaMenu {...props} className="outline-none" />
    </Popover>
  );
}

export function MenuItem({ children, className, ...props }: MenuItemProps & { children: ReactNode }) {
  return (
    <AriaMenuItem
      {...props}
      className={`flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-on-surface-muted outline-none hovered:bg-surface-hover hovered:text-on-surface focus:bg-surface-hover focus:text-on-surface selected:text-on-surface disabled:opacity-40 ${className ?? ""}`}
    >
      {children}
    </AriaMenuItem>
  );
}
