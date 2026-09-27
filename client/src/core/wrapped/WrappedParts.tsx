import type { ReactNode } from "react";
import type { WrappedArtFrames } from "@bingo/shared";
import type { WrappedDropModel, WrappedPersonModel } from "../../headless/types";
import { WikiIcon } from "../ui/ItemIcon";
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
 * One drop: its screenshot (when the data has one: it opens full size), the item with its icon, GP value and Luck, and
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

/** Sticker heights for a row of Category images (each as wide as its art): smaller as there are more, so a row still fits a phone. */
const ROW_SIZE = ["", "h-44 sm:h-56", "h-36 sm:h-48", "h-28 sm:h-40", "h-24 sm:h-36"];

/**
 * A section's Category images, side by side above its opening heading (a Team's three, a Duo's two); nothing when the
 * section has none (it reads finished without). Each boils a little out of step with its neighbours.
 */
export function WrappedSectionArt({ art }: { art: WrappedArtFrames[] }) {
  if (art.length === 0) return null;
  const size = ROW_SIZE[Math.min(art.length, ROW_SIZE.length - 1)];
  return (
    <div className="mb-8 flex flex-wrap items-end justify-center gap-x-2 gap-y-4 sm:gap-x-4">
      {art.map((frames, i) => (
        <StickerArt key={frames[0]} frames={frames} className={size} phase={i / art.length} />
      ))}
    </div>
  );
}
