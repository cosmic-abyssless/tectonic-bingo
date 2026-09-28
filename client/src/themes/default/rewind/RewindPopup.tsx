import type { RewindPopupModel } from "../../../headless/types";
import { ReactionBar } from "../../../core/submissions/ReactionBar";
import { XIcon } from "../../../core/ui/icons";

const noop = () => {};

/**
 * One Submission's popup, plain: who, which Team, when; its screenshot; its items with Drop value (and Luck, when
 * known); what it completed; its Reactions. A huge Submission gets the big card. A rejected one is greyed out and
 * stamped "Rejected". Only the card: the page positions it.
 */
export function RewindPopup({ popup }: { popup: RewindPopupModel }) {
  const s = popup.submission;
  const big = popup.size === "big";
  return (
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
          <a href={s.screenshotUrl ?? s.thumbnailUrl} target="_blank" rel="noreferrer" className="block bg-background">
            <img src={s.thumbnailUrl} alt="Screenshot" className={`w-full object-contain ${big ? "max-h-56" : "max-h-32"}`} />
          </a>
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

      <button type="button" aria-label="Close" onClick={popup.close} className="absolute right-1 top-1 rounded p-1 text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface">
        <XIcon size={14} />
      </button>
    </div>
  );
}
