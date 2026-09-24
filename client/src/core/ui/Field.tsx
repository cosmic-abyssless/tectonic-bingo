import { createContext, useId, type ComponentProps, type ReactNode } from "react";

/*
 * Plain form controls with token styling. These wrap native elements rather
 * than react-aria's TextField so the many existing `onChange={(e) => ...}`
 * call sites keep working unchanged.
 */

export const inputClass =
  "w-full rounded-md border border-outline-strong bg-[var(--field-bg,var(--color-background))] px-3 text-on-surface placeholder:text-on-surface-subtle transition-colors focus:border-on-surface/60 disabled:opacity-50 disabled:cursor-not-allowed";

// Mirrors Button's sizes so controls sit flush next to buttons. Callers must
// use `size` rather than passing h-* classes — `h-10` here would win anyway.
const controlSize = { sm: "h-8 text-xs", md: "h-10 text-sm" } as const;
export type ControlSize = keyof typeof controlSize;

/** Full class string for a raw control that can't use the components below (and for Select's trigger). */
export const controlClass = (size: ControlSize = "md") => `${inputClass} ${controlSize[size]}`;

export function Input({ className, size = "md", ...props }: Omit<ComponentProps<"input">, "size"> & { size?: ControlSize }) {
  return <input {...props} className={`${controlClass(size)} ${className ?? ""}`} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} py-2 text-sm ${className ?? ""}`} />;
}

/**
 * The id of the label a control sits under. A <label> element names native inputs by wrapping them, but not a
 * react-aria control like Select, which reads this and points aria-labelledby at it instead.
 */
export const FieldLabelContext = createContext<string | null>(null);

/** Labelled control. Use `as="div"` when the content isn't a single form control (button groups, lists). */
export function Field({ label, hint, children, className, as: Tag = "label" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; as?: "label" | "div" }) {
  const labelId = useId();
  return (
    <Tag className={`block ${className ?? ""}`}>
      <span id={labelId} className="mb-1.5 block text-xs font-medium text-on-surface-muted">
        {label}
      </span>
      <FieldLabelContext.Provider value={labelId}>{children}</FieldLabelContext.Provider>
      {hint && <span className="mt-1.5 block text-xs text-on-surface-subtle">{hint}</span>}
    </Tag>
  );
}
