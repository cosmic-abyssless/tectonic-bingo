import { Tab as AriaTab, TabList as AriaTabList, TabPanel as AriaTabPanel, Tabs as AriaTabs, type TabProps, type TabsProps } from "react-aria-components";
import type { CSSProperties, ReactNode } from "react";

// outline-none: React Aria marks the whole Tabs container focus-visible whenever keyboard focus is anywhere inside it
// (tabbing through a table in a tab panel, say), and the global focus ring (index.css) would then outline the page's
// whole tabbed area. The tabs and whatever is focused inside keep their own focus styles.
export function Tabs(props: TabsProps) {
  return <AriaTabs {...props} className={`flex flex-col outline-none ${props.className ?? ""}`} />;
}

// The bar's bottom line is an inset shadow, not a border, and each tab ends on it with its selected underline painted
// over it: nothing hangs below the bar, so one that scrolls sideways (the player profile's, on a phone) doesn't also get
// a sliver of vertical scroll and a tiny scrollbar.
// `bare`: none of that, for a theme that draws its own bar.
export function TabList({
  children,
  className,
  style,
  bare,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  bare?: boolean;
  "aria-label"?: string;
}) {
  return (
    <AriaTabList aria-label={ariaLabel} style={style} className={`${bare ? "" : "flex flex-wrap gap-1 shadow-[inset_0_-1px_0_var(--color-outline)] "}${className ?? ""}`}>
      {children}
    </AriaTabList>
  );
}

/**
 * `dimmed` marks a tab that is reachable but not relevant yet. A theme that draws its own tabs (the comic theme's index
 * tabs) passes `className` and `style`, which replace the look and can read whether the tab is selected.
 */
export function Tab({
  id,
  dimmed,
  className,
  style,
  children,
}: {
  id: string;
  dimmed?: boolean;
  className?: TabProps["className"];
  style?: TabProps["style"];
  children: ReactNode;
}) {
  return (
    <AriaTab
      id={id}
      style={style}
      className={
        className ??
        `${dimmed ? "opacity-50 " : ""}relative cursor-pointer whitespace-nowrap px-3 py-2.5 text-sm font-medium text-on-surface-muted transition-colors hovered:text-on-surface selected:text-on-surface selected:after:absolute selected:after:inset-x-3 selected:after:bottom-0 selected:after:h-0.5 selected:after:bg-on-surface outline-none`
      }
    >
      {children}
    </AriaTab>
  );
}

export function TabPanel({ id, className = "pt-6", children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <AriaTabPanel id={id} className={`outline-none ${className}`}>
      {children}
    </AriaTabPanel>
  );
}
