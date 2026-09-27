import type { RewindPopupModel } from "../../../headless/types";
import { XIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { InkTag } from "../ui/CaptionBox";
import { ComicReactionBar } from "../ui/ComicReactionBar";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";
import { RewindSfxBubble } from "./RewindSfxBubble";

const noop = () => {};

/**
 * One Submission's popup as two comic bubbles (#225). A speech bubble carries who, which Team and Tile, when; its
 * screenshot; its items with GP value (and Luck, when known); what it completed; its Reactions; and the Rejected
 * stamp. A separate SFX bubble over the Tile shouts what made it stand out. The page places the speech bubble and
 * plays both in and out together.
 */
export function RewindPopup({ popup }: { popup: RewindPopupModel }) {
  const { colors } = useComic();
  const s = popup.submission;
  const big = popup.size === "big";
  return (
    <>
      <div
        role="status"
        aria-label={`${s.playerName ?? "Someone"}'s submission${s.rejected ? ", rejected" : ""}`}
        className={`relative mb-5 rounded-2xl border-[3px] ${big ? "w-[min(26rem,calc(100vw-2rem))]" : "w-[min(19rem,calc(100vw-2rem))]"} ${s.rejected ? "grayscale" : ""}`}
        style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, color: colors.INK_BODY, boxShadow: `4px 4px 0 ${colors.LINE}` }}
      >
        {/* The tail, pointing down at the Board; its open top sits over the bubble's border. */}
        <svg aria-hidden viewBox="0 0 28 22" className="absolute -bottom-[19px] left-10 h-[22px] w-7 overflow-visible">
          <path d="M0 0 L6 20 L22 0" fill={colors.PAPER_RAISED} stroke={colors.LINE} strokeWidth={3} strokeLinejoin="round" />
        </svg>

        <div className={`overflow-hidden rounded-[13px] ${s.rejected ? "opacity-60" : ""}`}>
          <div className="flex items-start gap-2 pb-2 pl-3 pr-8 pt-2.5">
            <div className="min-w-0 flex-1">
              <p className={`truncate uppercase leading-tight tracking-wide ${big ? "text-xl" : "text-lg"}`} style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
                {s.playerName ?? "Unknown player"}
              </p>
              <p className="truncate text-xs" style={{ color: colors.INK_SUBTLE }}>
                {s.team.color && <span className="mr-1 inline-block size-2 rounded-full border align-middle" style={{ backgroundColor: s.team.color, borderColor: colors.LINE }} />}
                {s.team.name}
                {s.tileName && <> · {s.tileName}</>}
              </p>
            </div>
            <span className="num shrink-0 pt-1 text-[11px]" style={{ color: colors.INK_SUBTLE }}>
              {s.sinceStartLabel}
            </span>
          </div>

          {s.thumbnailUrl && (
            <a
              href={s.screenshotUrl ?? s.thumbnailUrl}
              target="_blank"
              rel="noreferrer"
              className="mx-3 block -rotate-1 border-[3px] p-0.5"
              style={{ borderColor: colors.LINE, background: colors.PAPER, boxShadow: `2px 2px 0 ${colors.LINE}` }}
            >
              <img src={s.thumbnailUrl} alt="Screenshot" className={`w-full object-contain ${big ? "max-h-52" : "max-h-28"}`} />
            </a>
          )}

          <ul className="space-y-0.5 px-3 pt-2 text-sm">
            {s.items.map((item, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate" style={{ color: colors.INK }}>
                  {item.label}
                  {item.quantity > 1 && <span style={{ color: colors.INK_SUBTLE }}> ×{item.quantity}</span>}
                </span>
                {item.luckLabel && (
                  <span className="num shrink-0 text-[11px]" style={{ color: colors.INK_SUBTLE }}>
                    {item.luckLabel}
                  </span>
                )}
                <span className="num shrink-0 font-medium">{item.gpLabel}</span>
              </li>
            ))}
          </ul>

          {s.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1 px-3 pt-2">
              {s.highlights.map((h) => (
                <InkTag key={h} className="!text-[11px]">
                  {h}
                </InkTag>
              ))}
            </div>
          )}

          <div className="px-3 pb-3 pt-2">
            <ComicReactionBar reactions={s.reactions} canReact={false} onToggle={noop} />
          </div>

          {popup.holdMs !== null && (
            <div aria-hidden className="h-1" style={{ background: colors.RULE }}>
              <div className="rewind-hold h-full" style={{ animationDuration: `${popup.holdMs}ms`, background: colors.LINE }} />
            </div>
          )}
        </div>

        {s.rejected && <Stamp kind="rejected" size="md" rotate={-12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />}

        <button type="button" aria-label="Close" onClick={popup.close} className="absolute right-1.5 top-1.5 rounded p-1 hover:brightness-90" style={{ color: colors.INK_SUBTLE }}>
          <XIcon size={14} />
        </button>
      </div>

      {s.standout && s.tileId && <RewindSfxBubble submissionId={s.id} tileId={s.tileId} standout={s.standout} big={big} rejected={s.rejected} />}
    </>
  );
}
