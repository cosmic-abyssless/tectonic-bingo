import type { CSSProperties, ReactNode } from "react";
import { useOptionalSlot } from "../../themes/context";
import { HEADING_FONT } from "./Card";

export interface PanelProps {
  /** A small heading at the top ("Teams"). */
  title?: ReactNode;
  children: ReactNode;
  /** "sm" for a one-line bar (the draft room's latest-pick bar). */
  padding?: "sm" | "md";
  className?: string;
  style?: CSSProperties;
}

/**
 * A raised section of a page (the draft room's teams, its pre-draft setup). Inside a theme that draws its own (the
 * Panel slot) it's the theme's; elsewhere, PlainPanel. Its contents should draw with the chrome tokens
 * (bg-surface, text-on-surface…): a theme's panel may repoint them.
 */
export function Panel(props: PanelProps) {
  const Themed = useOptionalSlot("Panel");
  return Themed ? <Themed {...props} /> : <PlainPanel {...props} />;
}

// Not <Card>: a raised fill and a stronger border than Card's surface/outline, which vanish into the dark themes'
// backdrop.
export function PlainPanel({ title, children, padding = "md", className, style }: PanelProps) {
  return (
    <section
      className={`rounded-lg border border-outline-strong bg-surface-raised shadow-[0_2px_10px_var(--color-shade)] ${padding === "sm" ? "px-4 py-2.5" : "p-4"} ${className ?? ""}`}
      style={style}
    >
      {title && (
        <h3 className="mb-2 text-sm font-semibold text-on-surface" style={HEADING_FONT}>
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}
