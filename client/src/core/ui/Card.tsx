import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/** Flat surface with a hairline border. Elevation comes from borders, not shadows. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-lg border border-outline bg-surface ${className ?? ""}`} />;
}

// Themeable via --font-heading/--font-heading-weight (set by ThemeProvider
// from tokens.chrome.headingFont/headingWeight); both fall back to a no-op
// (this element's own weight class) outside a themed page, or when a theme
// sets a font but not a weight. Exported so other headings (Disclosure's own
// title, when it stands in for a CardHeader — see SignupForm) theme the same way.
export const HEADING_FONT: CSSProperties = { fontFamily: "var(--font-heading, inherit)", fontWeight: "var(--font-heading-weight, revert)" };

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-outline px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-on-surface" style={HEADING_FONT}>
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-on-surface-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const TONE = {
  neutral: "border-outline text-on-surface-muted",
  info: "border-info/30 text-info",
  ok: "border-ok/30 text-ok",
  warn: "border-warn/30 text-warn",
  danger: "border-danger/30 text-danger",
} as const;

/** Inline status line (locked, error, notice). */
export function Notice({ tone = "neutral", icon, children, className }: { tone?: keyof typeof TONE; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`flex items-start gap-2.5 rounded-md border bg-surface-raised px-3 py-2.5 text-sm ${TONE[tone]} ${className ?? ""}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1 text-on-surface-muted [&_strong]:text-on-surface">{children}</div>
    </div>
  );
}

/** Centered placeholder for empty/waiting states. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 text-on-surface-subtle [&_svg]:size-7">{icon}</div>}
      <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm text-on-surface-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

export function Badge({ tone = "neutral", children, className, style }: { tone?: keyof typeof TONE; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span style={style} className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${TONE[tone]} ${className ?? ""}`}>
      {children}
    </span>
  );
}

const DOT_TONE = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", neutral: "bg-on-surface-subtle", info: "bg-info" } as const;

/** Small pulsing dot for an unseen change (e.g. a bug report filed or resolved). Positions itself absolutely — give the parent `relative`. */
export function PulseDot({ tone = "danger", className }: { tone?: keyof typeof TONE; className?: string }) {
  return (
    <span className={`pointer-events-none absolute flex size-2.5 ${className ?? ""}`}>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${DOT_TONE[tone]}`} />
      <span className={`relative inline-flex size-2.5 rounded-full ${DOT_TONE[tone]}`} />
    </span>
  );
}

const QUOTE_BORDER = { ok: "border-ok/40", warn: "border-warn/40", danger: "border-danger/40", neutral: "border-outline-strong", info: "border-info/40" } as const;

/** A resolver's note, styled as an attributed quote (e.g. why a bug report was fixed or closed). */
export function ResolutionQuote({ message, author, at, tone = "neutral" }: { message: string; author: string; at?: string | null; tone?: keyof typeof TONE }) {
  return (
    <blockquote className={`border-l-2 pl-3 text-sm italic text-on-surface-muted ${QUOTE_BORDER[tone]}`}>
      <p className="whitespace-pre-wrap">{message}</p>
      <footer className="mt-1 text-xs font-medium not-italic text-on-surface-subtle">
        — {author}
        {at && <> · {at}</>}
      </footer>
    </blockquote>
  );
}

/** Toggleable pill for filter rows; `count` renders as a mono numeral. */
export function FilterChip({ active, count, children, onPress }: { active: boolean; count?: number; children: ReactNode; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPress}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${
        active ? "border-on-surface bg-accent text-on-accent" : "border-outline text-on-surface-muted hover:border-outline-strong hover:text-on-surface"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && <span className={`num ${active ? "text-on-accent/70" : "text-on-surface-subtle"}`}>{count}</span>}
    </button>
  );
}
