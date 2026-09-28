import type { ReactNode } from "react";
import type { WrappedArtFrames } from "@bingo/shared";
import type { WrappedDropModel, WrappedPersonModel, WrappedSectionArtModel } from "../../headless/types";
import { WikiIcon } from "../ui/ItemIcon";
import { OsrsCaption } from "./OsrsCaption";
import { StickerArt } from "./StickerArt";

// Small shared pieces of Wrapped's default sections, for any theme to reuse.

/**
 * A Player's avatar and name; "you" gets a quiet marker. `detail` goes under the name, and the avatar is centred on
 * the two together. The name keeps its own line height, so a big heading's tight one never clips its descenders.
 */
export function WrappedPerson({ person, size = "md", detail }: { person: WrappedPersonModel; size?: "sm" | "md" | "lg"; detail?: ReactNode }) {
  const avatar = { sm: "size-5", md: detail ? "size-9" : "size-7", lg: "size-[1.1em]" }[size];
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-[0.4em]">
      <img src={person.avatarUrl} alt="" className={`${avatar} shrink-0 rounded-full`} loading="lazy" />
      <span className="flex min-w-0 flex-col text-left">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate leading-[1.3] ${size === "lg" ? "" : "font-semibold"}`}>{person.name}</span>
          {person.isYou && <span className="shrink-0 rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] leading-none font-semibold uppercase tracking-wide text-on-surface-muted">You</span>}
        </span>
        {detail && <span className="truncate text-xs leading-[1.3] font-normal text-on-surface-subtle">{detail}</span>}
      </span>
    </span>
  );
}

/**
 * One drop: its screenshot (when the data has one: it opens full size), the item with its icon, Drop value and Luck, and
 * who got it when. `showPlayer` for drops that aren't the viewer's own; `showTeam` (on with showPlayer unless turned off)
 * for their Team too.
 */
export function WrappedDropCard({ drop, showPlayer = false, showTeam = showPlayer, className = "" }: { drop: WrappedDropModel; showPlayer?: boolean; showTeam?: boolean; className?: string }) {
  return (
    <div className={`flex w-full items-center gap-3 rounded-xl border border-outline bg-surface p-3 text-left ${className}`}>
      {drop.thumbnailUrl && drop.screenshotUrl ? (
        <a href={drop.screenshotUrl} target="_blank" rel="noreferrer" className="shrink-0" title="View screenshot">
          <img src={drop.thumbnailUrl} alt={`Screenshot of ${drop.itemName}`} loading="lazy" className="size-16 rounded-lg border border-outline object-cover sm:size-20" />
        </a>
      ) : (
        <div aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-outline bg-surface-raised sm:size-20">
          <WikiIcon name={drop.itemName} className="size-8 [image-rendering:pixelated]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {drop.thumbnailUrl && <WikiIcon name={drop.itemName} />}
          <span className="truncate font-semibold">{drop.itemName}</span>
          {drop.quantityLabel && <span className="num shrink-0 text-sm text-on-surface-muted">{drop.quantityLabel}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm">
          {drop.gpLabel && <span className="num font-semibold">{drop.gpLabel}</span>}
          {drop.luck && <span className="num text-on-surface-muted" title={drop.luck.sentence}>{drop.luck.shortLabel}</span>}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-on-surface-subtle">
          {showPlayer && drop.player && <WrappedPerson person={drop.player} size="sm" />}
          {showTeam && drop.team && (
            <span className="inline-flex shrink-0 items-center gap-1">
              {drop.team.color && <span className="size-2 rounded-full" style={{ backgroundColor: drop.team.color }} />}
              {drop.team.name}
            </span>
          )}
          <span className="shrink-0">{drop.whenLabel}</span>
        </div>
      </div>
    </div>
  );
}

/** A section's big opening line: a small kicker over a huge headline. */
export function WrappedHeading({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <div className="text-center">
      {kicker && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">{kicker}</p>}
      <h2 className="text-balance text-4xl font-black tracking-tight sm:text-6xl">{children}</h2>
    </div>
  );
}

/** A big number with its label under it. */
export function WrappedStat({ value, label, tone }: { value: ReactNode; label: ReactNode; tone?: "gold" }) {
  return (
    <div className="text-center">
      <div className={`num whitespace-nowrap text-5xl font-black tracking-tight sm:text-7xl ${tone === "gold" ? "text-gold" : ""}`}>{value}</div>
      <div className="mt-2 text-sm text-on-surface-muted sm:text-base">{label}</div>
    </div>
  );
}

/**
 * How wide each of a row's Category images may be on a phone: past three they go two rows (two and two, or three and
 * two/three) rather than one row of slivers. From the sm breakpoint they all share one row.
 */
const PHONE_BASIS = ["", "", "", "", "basis-[calc(50%-0.5rem)]", "basis-[calc(33.333%-0.5rem)]"];

/** One of a section's Category images with a name (and optional role) captioned on it, in OSRS's font (#270). */
export interface CaptionedArt {
  art: WrappedArtFrames;
  name?: string | null;
  role?: string | null;
}

/**
 * A section's Category images, side by side above its opening heading (a Team's three, a Duo's two); nothing when the
 * section has none (it reads finished without). Each boils a little out of step with its neighbours. An image given
 * with a `name` has it embedded right on the art, low over its foot, rather than sitting beside it; a `role`, if any,
 * sits quietly under that, below the art rather than over it so it never collides with the sticker.
 *
 * Every image aims for the height a lone one gets, so a row of several grows sideways instead of shrinking (#279):
 * they only shrink, together, once the row runs out of width. A caption wraps rather than truncating. These are the
 * Category's main credits, so their name reads bigger than an additional credit's (#279 follow-up).
 */
export function WrappedSectionArt({ art }: { art: (WrappedArtFrames | CaptionedArt)[] }) {
  if (art.length === 0) return null;
  const basis = PHONE_BASIS[Math.min(art.length, PHONE_BASIS.length - 1)];
  const wrap = basis ? "flex-wrap sm:flex-nowrap" : "flex-nowrap";
  const items = art.map((a): CaptionedArt => (Array.isArray(a) ? { art: a } : a));
  return (
    <div className={`mb-8 flex ${wrap} items-end justify-center gap-x-2 gap-y-4 sm:gap-x-4`}>
      {items.map(({ art: frames, name, role }, i) => (
        <div key={frames[0]} className={`flex min-w-0 flex-col items-center ${basis} sm:basis-auto`}>
          <div className="relative max-w-full">
            <StickerArt frames={frames} className="max-w-full" frameClassName="max-h-48 max-w-full sm:max-h-64" phase={i / art.length} />
            {name && <OsrsCaption size="md" className="absolute inset-x-1 bottom-1 text-center">{name}</OsrsCaption>}
          </div>
          {role && <span className="mt-1 max-w-full truncate text-xs text-on-surface-subtle">{role}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * A category's art and credits (CONTEXT.md "Credits"), the same for every section: its Category images (each with the
 * name it credits captioned on it, as WrappedSectionArt) and, under them, its additional credits (ones with no image),
 * each a name in OSRS's font with its role over it. Nothing when the category has neither.
 */
export function WrappedCategoryArt({ art }: { art: WrappedSectionArtModel }) {
  return (
    <>
      <WrappedSectionArt art={art.images.map(({ frames, name, role }) => (name ? { art: frames, name, role } : frames))} />
      {art.credits.length > 0 && (
        <ul aria-label="Credits" className="mb-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {art.credits.map((credit, i) => (
            <li key={i} className="flex flex-col items-center gap-1">
              {credit.role && <span className="text-xs text-on-surface-subtle">{credit.role}</span>}
              <OsrsCaption>{credit.name}</OsrsCaption>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
