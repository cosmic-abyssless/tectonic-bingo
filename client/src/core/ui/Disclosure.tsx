import type { ReactNode } from "react";
import { Button as AriaButton, Disclosure as AriaDisclosure, DisclosurePanel, Heading } from "react-aria-components";
import { ChevronDownIcon, ChevronRightIcon } from "./icons";

/**
 * Collapsible card: a full-width header row that toggles the panel below it.
 * `title` is the header content (rendered inside the trigger, so keep it to
 * inline elements); the panel stays mounted while collapsed. `description`
 * is an optional subtitle line — a title alone often isn't enough to judge
 * a *collapsed* section by (SignupForm's use: "Sign up" vs "Edit your
 * signup" needs the line under it too). Every existing caller omits it and
 * renders exactly as before — this is purely additive.
 */
export function Disclosure({
  title,
  description,
  defaultExpanded = false,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AriaDisclosure defaultExpanded={defaultExpanded} className={`group rounded-lg border border-outline bg-surface ${className ?? ""}`}>
      <Heading className="m-0">
        <AriaButton
          slot="trigger"
          className={`flex w-full gap-3 rounded-lg px-4 text-left transition-colors hover:bg-surface-hover group-expanded:rounded-b-none ${description ? "items-start py-3" : "h-12 items-center"}`}
        >
          {description ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">{title}</div>
              <p className="mt-0.5 text-sm font-normal text-on-surface-muted">{description}</p>
            </div>
          ) : (
            title
          )}
          <span className={`shrink-0 text-on-surface-subtle ${description ? "mt-0.5" : ""}`}>
            <ChevronDownIcon className="hidden group-expanded:block" />
            <ChevronRightIcon className="group-expanded:hidden" />
          </span>
        </AriaButton>
      </Heading>
      {/* Border/padding live on an inner div: the collapsed panel is hidden via
          content-visibility, which still paints the panel's own box. */}
      <DisclosurePanel>
        <div className="border-t border-outline p-4">{children}</div>
      </DisclosurePanel>
    </AriaDisclosure>
  );
}
