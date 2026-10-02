import type { ReactNode } from "react";

const SIZE = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-3 text-sm",
} as const;

export type Segment<K extends string> = { id: K; label: ReactNode };

/**
 * A row of joined buttons, one picked: the choice between a few modes (Automatic or Manual scoring, a drop or a Proof
 * screenshot, which Task). Each is a toggle button (`aria-pressed`). `fill` stretches it across its container, the
 * buttons sharing the width.
 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  size = "md",
  fill = false,
  "aria-label": ariaLabel,
  className,
}: {
  options: readonly Segment<K>[];
  value: K | null;
  onChange: (id: K) => void;
  size?: keyof typeof SIZE;
  fill?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`flex overflow-hidden rounded-md border border-outline-strong ${fill ? "" : "w-fit"} ${className ?? ""}`}>
      {options.map((option, i) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`${SIZE[size]} font-medium transition-colors ${fill ? "flex-1" : ""} ${i > 0 ? "border-l border-outline-strong" : ""} ${
            value === option.id ? "bg-accent text-on-accent" : "bg-background text-on-surface-muted hover:text-on-surface"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
