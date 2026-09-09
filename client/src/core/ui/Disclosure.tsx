import type { ReactNode } from "react";
import { Button as AriaButton, Disclosure as AriaDisclosure, DisclosurePanel, Heading } from "react-aria-components";
import { ChevronDownIcon, ChevronRightIcon } from "./icons";

/**
 * Collapsible card: a full-width header row that toggles the panel below it.
 * `title` is the header content (rendered inside the trigger, so keep it to
 * inline elements); the panel stays mounted while collapsed.
 */
export function Disclosure({ title, defaultExpanded = false, children, className }: { title: ReactNode; defaultExpanded?: boolean; children: ReactNode; className?: string }) {
  return (
    <AriaDisclosure defaultExpanded={defaultExpanded} className={`group rounded-lg border border-line bg-surface ${className ?? ""}`}>
      <Heading className="m-0">
        <AriaButton slot="trigger" className="flex h-12 w-full items-center gap-3 rounded-lg px-4 text-left transition-colors hover:bg-surface-hover group-expanded:rounded-b-none">
          {title}
          <span className="text-fg-subtle">
            <ChevronDownIcon className="hidden group-expanded:block" />
            <ChevronRightIcon className="group-expanded:hidden" />
          </span>
        </AriaButton>
      </Heading>
      <DisclosurePanel className="border-t border-line p-4">{children}</DisclosurePanel>
    </AriaDisclosure>
  );
}
