import type { RewindPopupModel } from "../../../headless/types";
import { pointerAnchorStyle, type RewindPopupPointer } from "../../rewindPopupPointer";
import { ReactionBar } from "../../../core/submissions/ReactionBar";
import { XIcon } from "../../../core/ui/icons";
import { IconButton } from "../../../core/ui/Button";
import { ScreenshotLink } from "../../../core/submissions/ScreenshotThumb";

const noop = () => {};

/**
 * One Submission's popup, plain: who, which Team, when; its screenshot; its items with Drop value (and Luck, when
 * known); what it completed; its Reactions. A huge Submission gets the big card. A rejected one is greyed out and
 * stamped "Rejected". A caret points at the Tile. Only the card: the page positions it.
 */
export function RewindPopup({ popup, pointer }: { popup: RewindPopupModel; pointer: RewindPopupPointer | null }) {
  const s = popup.submission;
  const big = popup.size === "big";
  return (
    <div className="relative">
      <div
        role="status"
        aria-label={`${s.playerName ?? "Someone"}'s submission${s.rejected ? ", rejected" : ""}`}
        className={`relative overflow-hidden rounded-lg border bg-surface-raised text-on-surface shadow-pop ${big ? "w-[min(26rem,calc(100vw-2rem))] border-accent" : "w-[min(19rem,calc(100vw-2rem))] border-outline-strong"} ${
          s.rejected ? "grayscale" : ""
        }`}
        style={s.team.color && !s.rejected ? { borderTopColor: s.team.color, borderTopWidth: 4 } : undefined}
      >
        <div className={s.rejected ? "opacity-60" : undefined}>
          <div className="flex items-start gap-2 pb-2 pl-3 pr-8 pt-2.5">
            <div className="min-w-0 flex-1">
              <p className={`truncate font-semibold ${big ? "text-base" : "text-sm"}`}>{s.playerName ?? "Unknown player"}</p>
              <p className="truncate text-xs text-on-surface-muted">
                {s.team.color && <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ backgroundColor: s.team.color }} />}
                {s.team.name}
                {s.tileName && <> · {s.tileName}</>}
              </p>
            </div>
            <span className="num shrink-0 pt-0.5 text-[11px] text-on-surface-subtle">{s.sinceStartLabel}</span>
          </div>

          {s.thumbnailUrl && (
            <ScreenshotLink href={s.screenshotUrl ?? s.thumbnailUrl} className="block bg-background">
              <img src={s.thumbnailUrl} alt="Screenshot" className={`w-full object-contain ${big ? "max-h-56" : "max-h-32"}`} />
            </ScreenshotLink>
          )}

          <ul className="space-y-0.5 px-3 pt-2 text-sm">
            {s.items.map((item, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {item.label}
                  {item.quantity > 1 && <span className="text-on-surface-subtle"> ×{item.quantity}</span>}
                </span>
                {item.luckLabel && <span className="num shrink-0 text-[11px] text-on-surface-subtle">{item.luckLabel}</span>}
                <span className="num shrink-0 font-medium">{item.gpLabel}</span>
              </li>
            ))}
          </ul>

          {s.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1 px-3 pt-2">
              {s.highlights.map((h) => (
                <span key={h} className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-on-surface">
                  {h}
                </span>
              ))}
            </div>
          )}

          <div className="px-3 pb-3 pt-2">
            <ReactionBar reactions={s.reactions} canReact={false} onToggle={noop} />
          </div>
        </div>

        {s.rejected && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 -rotate-12 rounded border-2 border-danger px-2 py-0.5 text-lg font-bold uppercase tracking-wider text-danger">
            Rejected
          </span>
        )}

        {popup.holdMs !== null && (
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-outline">
            <div className="rewind-hold h-full bg-accent" style={{ animationDuration: `${popup.holdMs}ms` }} />
          </div>
        )}

        <IconButton size="sm" label="Close" onPress={popup.close} className="absolute right-1 top-1">
          <XIcon size={14} />
        </IconButton>
      </div>
      {/* Outside the card, which clips its contents; its base tucks 1px over the card's border. */}
      {pointer && (
        <div aria-hidden style={pointerAnchorStyle(pointer)}>
          <svg viewBox="0 0 14 9" className={`absolute -left-[7px] -top-px h-[9px] w-3.5 overflow-visible fill-surface-raised ${big ? "stroke-accent" : "stroke-outline-strong"}`}>
            <path d="M0 0 L7 9 L14 0" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
