import { Tab as AriaTab, TabList as AriaTabList, TabPanel as AriaTabPanel, Tabs as AriaTabs, type TabsProps } from "react-aria-components";
import type { ReactNode } from "react";

export function Tabs(props: TabsProps) {
  return <AriaTabs {...props} className={`flex flex-col ${props.className ?? ""}`} />;
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AriaTabList className={`flex gap-1 border-b border-line overflow-x-auto ${className ?? ""}`}>{children}</AriaTabList>
  );
}

/** `dimmed` marks a tab that is reachable but not relevant yet. */
export function Tab({ id, dimmed, children }: { id: string; dimmed?: boolean; children: ReactNode }) {
  return (
    <AriaTab
      id={id}
      className={`${dimmed ? "opacity-50 " : ""}relative -mb-px cursor-pointer whitespace-nowrap px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hovered:text-fg selected:text-fg selected:after:absolute selected:after:inset-x-3 selected:after:-bottom-px selected:after:h-px selected:after:bg-fg outline-none`}
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
