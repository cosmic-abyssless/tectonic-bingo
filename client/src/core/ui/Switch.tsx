import type { ReactNode } from "react";
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components";

/** On/off toggle, e.g. enabling an optional integration section. */
export function Switch({ children, className, ...props }: Omit<AriaSwitchProps, "children" | "className"> & { children?: ReactNode; className?: string }) {
  return (
    <AriaSwitch {...props} className={`group inline-flex items-center gap-2 text-sm text-on-surface-muted ${className ?? ""}`}>
      <div className="h-5 w-9 shrink-0 rounded-full border border-outline-strong bg-[var(--field-bg,var(--color-background))] p-0.5 transition-colors group-selected:border-accent group-selected:bg-accent">
        <div className="h-3.5 w-3.5 rounded-full bg-on-surface-subtle transition-transform group-selected:translate-x-4 group-selected:bg-on-accent" />
      </div>
      {children}
    </AriaSwitch>
  );
}
