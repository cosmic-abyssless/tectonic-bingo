import { useId, type ReactNode } from "react";

const TEXT = { sm: "text-sm", xs: "text-xs" } as const;

/**
 * A native checkbox (or, with `type="radio"`, a radio button) with its label beside it, in the site's accent. `hint`
 * is visible text under the label, read out as the control's description: settings explain themselves here rather than
 * in a tooltip a phone can't reach. `muted` labels it in the quieter text colour the editors use.
 */
export function Checkbox({
  type = "checkbox",
  checked,
  defaultChecked,
  onChange,
  disabled,
  name,
  hint,
  size = "sm",
  muted = false,
  className,
  "aria-label": ariaLabel,
  children,
}: {
  type?: "checkbox" | "radio";
  checked?: boolean;
  defaultChecked?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  hint?: ReactNode;
  size?: keyof typeof TEXT;
  muted?: boolean;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  const hintId = useId();
  const row = (
    <label className={`flex items-center gap-2 ${TEXT[size]} ${muted ? "text-on-surface-muted" : "text-on-surface"} ${hint ? "" : (className ?? "")}`}>
      <input
        type={type}
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 accent-accent disabled:opacity-40"
      />
      {children}
    </label>
  );
  if (!hint) return row;
  return (
    <div className={className}>
      {row}
      <p id={hintId} className="mt-0.5 pl-6 text-xs text-on-surface-subtle">
        {hint}
      </p>
    </div>
  );
}
