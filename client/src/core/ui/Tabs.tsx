import { Tab as AriaTab, TabList as AriaTabList, TabPanel as AriaTabPanel, Tabs as AriaTabs, type TabsProps } from "react-aria-components";
import type { ReactNode } from "react";

export function Tabs(props: TabsProps) {
  return <AriaTabs {...props} className={`flex flex-col ${props.className ?? ""}`} />;
}

// The bar's bottom line is an inset shadow, not a border, and each tab ends on it with its selected underline painted
// over it: nothing hangs below the bar, so one that scrolls sideways (the player profile's, on a phone) doesn't also get
// a sliver of vertical scroll and a tiny scrollbar.
export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AriaTabList className={`flex flex-wrap gap-1 shadow-[inset_0_-1px_0_var(--color-outline)] ${className ?? ""}`}>{children}</AriaTabList>
  );
}

/** `dimmed` marks a tab that is reachable but not relevant yet. */
export function Tab({ id, dimmed, children }: { id: string; dimmed?: boolean; children: ReactNode }) {
  return (
    <AriaTab
      id={id}
      className={`${dimmed ? "opacity-50 " : ""}relative cursor-pointer whitespace-nowrap px-3 py-2.5 text-sm font-medium text-on-surface-muted transition-colors hovered:text-on-surface selected:text-on-surface selected:after:absolute selected:after:inset-x-3 selected:after:bottom-0 selected:after:h-0.5 selected:after:bg-on-surface outline-none`}
    >
      {children}
    </AriaTab>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AriaTabPanel id={id} className="outline-none pt-6">
      {children}
    </AriaTabPanel>
  );
}
