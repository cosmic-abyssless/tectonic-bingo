// Small building blocks shared by the app's AG Grid tables (SignupRosterGrid, DraftPoolGrid): a cell that needs
// an interactive control uses a native <button> rather than core/ui's react-aria-based Button/IconButton, and
// search-match highlighting inlines core/ui/tableSearch.tsx's Highlight *logic* rather than importing the
// component — see docs/ag-grid-tables-plan.md for why grid cells stay off core/ui.
import type { ReactNode } from "react";

const CELL_BUTTON_VARIANT = {
  primary: "border-transparent bg-button text-on-button hover:bg-on-surface",
  ghost: "border-transparent bg-transparent text-on-surface-muted hover:bg-surface-hover hover:text-on-surface",
  danger: "border-danger/40 bg-transparent text-danger hover:bg-danger/10",
} as const;

export function CellButton({
  variant,
  onClick,
  disabled,
  className = "",
  title,
  children,
}: {
  className?: string;
  variant: keyof typeof CELL_BUTTON_VARIANT;
  onClick: () => void;
  disabled?: boolean;
  /** A native tooltip, e.g. why it's disabled. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      // A hook for a surface's CSS to dress the button (the comic theme's panels give it an ink border).
      data-cell-button={variant}
      className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border px-2 text-xs font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 ${CELL_BUTTON_VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function CellIconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-on-surface-muted transition-colors duration-100 hover:bg-surface-hover hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `text` with every case-insensitive occurrence of `query` wrapped in <mark>. Renders `text` plain when `query`
 * is blank. See the file comment for why this duplicates core/ui/tableSearch.tsx's Highlight instead of using it. */
export function Mark({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-xs bg-accent/30 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
