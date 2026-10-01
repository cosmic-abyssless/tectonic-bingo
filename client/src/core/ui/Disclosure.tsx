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
 * renders exactly as before — this is purely additive. `action` sits at the
 * right of the header, outside the trigger (a Switch that turns the section
 * on). `variant="nested"` is the smaller row for a card inside a card (a
 * Task inside its Tile's editor).
 */
export function Disclosure({
  title,
  description,
  defaultExpanded = false,
  isExpanded,
  onExpandedChange,
  action,
  variant = "card",
  triggerLabel,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  defaultExpanded?: boolean;
  // Controlled mode (e.g. persisting to localStorage) — pass both, or neither for the plain uncontrolled default above.
  isExpanded?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
  action?: ReactNode;
  variant?: "card" | "nested";
  /** The trigger's accessible name, when its visible title isn't one by itself. */
  triggerLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const nested = variant === "nested";
  const rounded = nested ? "rounded-md" : "rounded-lg";
  return (
    <AriaDisclosure
      defaultExpanded={defaultExpanded}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      className={`group border border-outline ${rounded} ${nested ? "overflow-hidden bg-background" : "bg-surface"} ${className ?? ""}`}
    >
      <Heading className={`m-0 ${action ? `flex items-center gap-3 ${nested ? "pr-3" : "pr-4"}` : ""}`}>
        <AriaButton
          slot="trigger"
          aria-label={triggerLabel}
          className={`flex w-full min-w-0 flex-1 gap-3 ${rounded} text-left transition-colors hover:bg-surface-hover group-expanded:rounded-b-none ${nested ? "px-3" : "px-4"} ${
            description ? "items-start py-3" : `${nested ? "h-10" : "h-12"} items-center`
          }`}
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
        {action}
      </Heading>
      {/* Border/padding live on an inner div: the collapsed panel is hidden via
          content-visibility, which still paints the panel's own box. */}
      <DisclosurePanel>
        <div className={`border-t border-outline ${nested ? "px-3 py-3" : "p-4"}`}>{children}</div>
      </DisclosurePanel>
    </AriaDisclosure>
  );
}
