import { Tab as AriaTab, TabList as AriaTabList, TabPanel as AriaTabPanel, Tabs as AriaTabs, type TabsProps } from "react-aria-components";
import type { ReactNode } from "react";

// outline-none: React Aria marks the whole Tabs container focus-visible whenever keyboard focus is anywhere inside it
// (tabbing through a table in a tab panel, say), and the global focus ring (index.css) would then outline the page's
// whole tabbed area. The tabs and whatever is focused inside keep their own focus styles.
export function Tabs(props: TabsProps) {
  return <AriaTabs {...props} className={`flex flex-col outline-none ${props.className ?? ""}`} />;
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AriaTabList className={`flex flex-wrap gap-1 border-b border-outline ${className ?? ""}`}>{children}</AriaTabList>
  );
}

/** `dimmed` marks a tab that is reachable but not relevant yet. */
export function Tab({ id, dimmed, children }: { id: string; dimmed?: boolean; children: ReactNode }) {
  return (
    <AriaTab
      id={id}
      className={`${dimmed ? "opacity-50 " : ""}relative -mb-px cursor-pointer whitespace-nowrap px-3 py-2.5 text-sm font-medium text-on-surface-muted transition-colors hovered:text-on-surface selected:text-on-surface selected:after:absolute selected:after:inset-x-3 selected:after:-bottom-px selected:after:h-px selected:after:bg-on-surface outline-none`}
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
