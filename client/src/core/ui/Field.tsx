import type { ComponentProps, ReactNode } from "react";

/*
 * Plain form controls with token styling. These wrap native elements rather
 * than react-aria's TextField so the many existing `onChange={(e) => ...}`
 * call sites keep working unchanged.
 */

export const inputClass =
  "w-full rounded-md border border-line-strong bg-bg px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-fg/60 disabled:opacity-50 disabled:cursor-not-allowed";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} h-10 ${className ?? ""}`} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} py-2 ${className ?? ""}`} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} h-10 ${className ?? ""}`} />;
}

/** Labelled control. Use `as="div"` when the content isn't a single form control (button groups, lists). */
export function Field({ label, hint, children, className, as: Tag = "label" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; as?: "label" | "div" }) {
  return (
    <Tag className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-fg-subtle">{hint}</span>}
    </Tag>
  );
}
