import type { SVGProps } from "react";

/*
 * Single outline icon set (16px grid, 1.75 stroke, currentColor). Replaces the
 * emoji/glyph mix so icons match text weight and colour on every platform.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5l3 3 7-7" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6L8 10.5 12.5 6" />
  </Svg>
);

export const ChevronUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 10L8 5.5 12.5 10" />
  </Svg>
);

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
  </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5 7V5a3 3 0 0 1 6 0v2" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3l2 1.5" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4" />
    <path d="M10 10l3.5 3.5" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5l6 10.5H2z" />
    <path d="M8 6.5v3M8 11.6v.1" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 7.5V11M8 5.4v.1" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M1.75 13a4.25 4.25 0 0 1 8.5 0" />
    <path d="M10.5 3.5a2.25 2.25 0 0 1 0 4.2M11.5 9.2a4.25 4.25 0 0 1 2.75 3.8" />
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
  </Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
    <circle cx="6" cy="6.5" r="1" />
    <path d="M13.5 10.5L10 7l-5 6" />
  </Svg>
);

export const SpinnerIcon = (p: IconProps) => (
  <Svg {...p} className={`animate-spin ${p.className ?? ""}`}>
    <path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" />
  </Svg>
);

export const LayersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5 14 5.5 8 8.5 2 5.5zM2 8.5l6 3 6-3M2 11.5l6 3 6-3" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" />
  </Svg>
);

export const CrownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 5.5L5.5 8l2.5-4.5L10.5 8l3-2.5-1.25 7h-8.5z" />
  </Svg>
);

// `fill="currentColor"` lights the star up; the default outline is the empty state.
export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.75l1.9 3.95 4.35.6-3.15 3.02.78 4.33L8 11.6l-3.88 2.05.78-4.33L1.75 6.3l4.35-.6z" />
  </Svg>
);

export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 2.5h9v8l-3 3h-6z" />
    <path d="M9.5 13.5v-3h3" />
    <path d="M6 6.5h4M6 9h2.5" />
  </Svg>
);

/** Raised hand — "I'll take this". Pass fill="currentColor" to light it up. */
export const HandIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 8V3.5a1 1 0 0 1 2 0V7M7 6.5V2.5a1 1 0 0 1 2 0V7M9 6.5V3.5a1 1 0 0 1 2 0V8" />
    <path d="M11 8V5.5a1 1 0 0 1 2 0V10a4.5 4.5 0 0 1-4.5 4.5H8a4 4 0 0 1-3.2-1.6L2.6 9.9a1 1 0 0 1 1.6-1.2L5 10V8" />
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M2.5 8H4M12 8h1.5M4.05 4.05l1.1 1.1M10.85 10.85l1.1 1.1M11.95 4.05l-1.1 1.1M5.15 10.85l-1.1 1.1" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 9.5A5.75 5.75 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7z" />
  </Svg>
);

export const MonitorIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="3" width="12" height="8" rx="1" />
    <path d="M6 13.5h4M8 11v2.5" />
  </Svg>
);

// Standard "software bug" glyph (a beetle: head, segmented body, legs,
// antennae) rather than a generic warning triangle — used for the bug
// report action specifically.
export const BugIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="4.2" r="1.3" />
    <path d="M6.9 3.1L5.6 1.8M9.1 3.1l1.3-1.3M8 5.5v1.2" />
    <ellipse cx="8" cy="10.2" rx="3.4" ry="4.2" />
    <path d="M4.6 8.3h6.8M4.6 12.1h6.8" />
    <path d="M4.6 7.2H2M11.4 7.2H14M4.3 10.2H1.5M11.7 10.2h2.8M4.8 13.2L2.8 15M11.2 13.2l2 1.8" />
  </Svg>
);

// Moderator-only entry points (the mod panel).
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.5l5.5 2v4.2c0 3.2-2.3 5.6-5.5 6.8C4.8 13.3 2.5 10.9 2.5 7.7V3.5L8 1.5z" />
    <path d="M5.8 8l1.7 1.7L10.4 6.6" />
  </Svg>
);

// Hamburger — collapses the header's entries on narrow screens.
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 8A5.5 5.5 0 1 1 11 3.6" />
    <path d="M13.5 2.5v4h-4" />
  </Svg>
);
