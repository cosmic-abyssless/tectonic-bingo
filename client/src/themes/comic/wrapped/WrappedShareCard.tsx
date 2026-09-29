import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import type { WrappedPlayerCardModel, WrappedShareCardDropModel, WrappedShareCardModel, WrappedTeamCardModel } from "../../../headless/types";
import { CardImage } from "../../../core/wrapped/ShareCards";
import { getColors, TECTONIC_LOGO } from "../board/colors";
import { COMIC_FONT, COMIC_LOGO_FONT } from "../font";
import { halftoneUrl } from "../fx/halftone";
import { burstPoints } from "../ui/Burst";

// The comic theme's share cards (#315): each a comic book cover. A masthead with the Bingo's name, the Team's colour
// printed with rays and a halftone rising from the foot, the Wrapped art as the cover star, the big number in an SFX
// burst with captions beside it, and the drops in a strip along the bottom ("In this issue"). Always on the newsprint
// palette, so a card reads the same whoever shares it; its colours are written out rather than taken from the page's
// tokens, which follow the viewer's light or dark scheme. The lettering is Bangers, a web font the card's image embeds.

const C = getColors("light");
const SILVER = "#d9dde3";

const medal = (placement: number) => (placement === 1 ? C.YELLOW : placement === 2 ? SILVER : placement === 3 ? C.ORANGE : C.PAPER_RAISED);
const hardShadow = (px: number) => `${px}px ${px}px 0 ${C.INK}`;
/** A Team's colour for the cover, or the comic blue for none (or one that isn't a plain hex colour). */
const coverColor = (color: string | null | undefined) => (color && /^#[0-9a-f]{6}$/i.test(color) ? color : C.BLUE);

export function WrappedShareCard({ card }: { card: WrappedShareCardModel }) {
  switch (card.kind) {
    case "player":
      return <PlayerCard card={card} />;
    case "team":
      return <TeamCard card={card} />;
  }
}

/**
 * The cover: an inked frame on white, the masthead, then the content over the printed ground, the strip at the foot.
 * `bodyRef` is the whole card, clipped, so a cover that doesn't fit shows as overflowing it.
 */
function Cover({ card, issue, accent, bodyRef, strip, children }: { card: WrappedShareCardModel; issue: string; accent: string; bodyRef?: Ref<HTMLDivElement>; strip: ReactNode; children: ReactNode }) {
  return (
    <div ref={bodyRef} className="flex size-full flex-col overflow-hidden" style={{ background: C.PAPER_RAISED, padding: 12, color: C.INK, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="relative flex flex-1 flex-col" style={{ border: `4px solid ${C.INK}` }}>
        <Ground accent={accent} />
        <Masthead bingoName={card.bingoName} issue={issue} />
        <div className="relative flex flex-1 flex-col gap-3 px-4 pt-3 pb-4">
          {card.artUrl && (
            <div className="absolute flex items-end justify-end" style={{ right: 0, bottom: 0, top: 30, width: "46%" }}>
              {/* The sticker's own torn paper edge, shadowed like the Wrapped page's. */}
              <CardImage src={card.artUrl} className="object-contain" style={{ maxHeight: "100%", maxWidth: "100%", filter: "drop-shadow(0 6px 8px rgb(0 0 0 / 0.35))" }} />
            </div>
          )}
          {children}
        </div>
        {strip}
      </div>
    </div>
  );
}

/** How far the content keeps clear of the cover star, when there is one. */
const beside = (card: WrappedShareCardModel): CSSProperties => ({ maxWidth: card.artUrl ? "66%" : "100%" });

function Masthead({ bingoName, issue }: { bingoName: string; issue: string }) {
  return (
    <div className="relative flex shrink-0 items-stretch" style={{ background: C.PAPER_RAISED, borderBottom: `4px solid ${C.INK}` }}>
      <div
        className="flex items-center uppercase"
        style={{ background: TECTONIC_LOGO.bg, color: TECTONIC_LOGO.fg, fontFamily: COMIC_LOGO_FONT, fontWeight: 900, fontSize: 30, lineHeight: 1, padding: "6px 10px", borderRight: `4px solid ${C.INK}` }}
      >
        Tectonic
      </div>
      <div className="min-w-0 flex-1 px-3 py-1.5">
        <p className="uppercase" style={{ fontFamily: COMIC_FONT, fontSize: 12, letterSpacing: "0.08em", color: C.INK_SUBTLE, lineHeight: 1 }}>
          Wrapped · {issue}
        </p>
        {/* A long name gets smaller lettering before it's cut short. */}
        <p className="truncate" style={{ fontFamily: COMIC_FONT, fontSize: bingoName.length > 18 ? 26 : 32, lineHeight: 1.05 }}>
          {bingoName}
        </p>
      </div>
      <div className="flex flex-col items-center justify-center px-2 text-center uppercase" style={{ borderLeft: `4px solid ${C.INK}`, fontFamily: COMIC_FONT, fontSize: 13, lineHeight: 1, background: C.YELLOW }}>
        <span>Final</span>
        <span>issue!</span>
      </div>
    </div>
  );
}

/** A 540×675 sheet of halftone, nothing a third of the way down and full at the foot: the cover's printed shading. */
function groundHalftone(): string | null {
  const [width, height] = [540, 675];
  return halftoneUrl("share-card-ground", { width, height, step: 8, scale: 2, color: "rgb(0 0 0 / 0.22)", tone: (_x, y) => ((y / height - 0.35) / 0.65) ** 1.15 });
}

/** The cover's printed ground: the accent, rays from behind the cover star, and the halftone rising from the foot. */
function Ground({ accent }: { accent: string }) {
  const dots = groundHalftone();
  return (
    <>
      <div className="absolute inset-0" style={{ background: accent, backgroundImage: "repeating-conic-gradient(from 0deg at 72% 58%, rgb(255 255 255 / 0.17) 0deg 5deg, transparent 5deg 12deg)" }} />
      {dots && <div className="absolute inset-0" style={{ backgroundImage: `url("${dots}")`, backgroundRepeat: "no-repeat", backgroundPosition: "center bottom", backgroundSize: "540px 675px" }} />}
    </>
  );
}

/** Cover lettering: white, inked round and dropped. Wraps to `lines`, then clips. */
function Title({ children, size, lines = 2 }: { children: ReactNode; size: number; lines?: number }) {
  return (
    <h2
      style={{
        fontFamily: COMIC_FONT,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 0.98,
        color: C.TITLE_FILL,
        WebkitTextStroke: `${Math.max(1.5, size / 28)}px ${C.INK}`,
        textShadow: hardShadow(size / 14),
        letterSpacing: "0.02em",
        overflowWrap: "anywhere",
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        paddingBottom: size / 12,
      }}
    >
      {children}
    </h2>
  );
}

/** A narration caption: a box of `fill`, thick ink border, hard shadow, Bangers capitals; `tilt` knocks it askew. */
function Caption({ children, fill = C.PAPER_RAISED, tilt = 0, size = 14, style }: { children: ReactNode; fill?: string; tilt?: number; size?: number; style?: CSSProperties }) {
  return (
    <div
      className="uppercase"
      style={{ background: fill, border: `3px solid ${C.INK}`, boxShadow: hardShadow(3), padding: "3px 8px", fontFamily: COMIC_FONT, fontSize: size, lineHeight: 1.05, letterSpacing: "0.03em", transform: tilt ? `rotate(${tilt}deg)` : undefined, ...style }}
    >
      {children}
    </div>
  );
}

/** An SFX starburst: the comic Burst's shape, drawn still (a card is an image). */
function Burst({ fill, size, children }: { fill: string; size: number; children: ReactNode }) {
  const points = burstPoints(16, 36, 50, 5);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size, transform: "rotate(-8deg)" }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
        <polygon points={points} fill={C.INK} transform="translate(3 3.5)" />
        <polygon points={points} fill={fill} stroke={C.INK} strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center uppercase leading-none" style={{ fontFamily: COMIC_FONT }}>
        {children}
      </div>
    </div>
  );
}

/** A GP figure with the Coins icon, sized to it; just the figure if the icon doesn't load. */
function Gp({ label, coins, size }: { label: string; coins: string; size: number }) {
  return (
    <span className="num inline-flex min-w-0 items-center leading-none" style={{ fontFamily: COMIC_FONT, fontSize: size, gap: size * 0.15 }}>
      <CardImage src={coins} className="shrink-0 object-contain [image-rendering:pixelated]" style={{ width: size * 0.9, height: size * 0.9 }} />
      {label}
    </span>
  );
}

function Avatar({ url, name, size, style }: { url: string; name: string; size: number; style?: CSSProperties }) {
  const box: CSSProperties = { width: size, height: size, ...style };
  return (
    <CardImage
      src={url || null}
      className="shrink-0 rounded-full object-cover"
      style={box}
      fallback={
        <span className="flex shrink-0 items-center justify-center rounded-full" style={{ ...box, background: C.YELLOW, fontFamily: COMIC_FONT, fontSize: size * 0.5 }}>
          {name.charAt(0).toUpperCase()}
        </span>
      }
    />
  );
}

/** The strip along the cover's foot: a red label, then its lines. */
function Strip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative flex shrink-0 items-stretch" style={{ background: C.PAPER_RAISED, borderTop: `4px solid ${C.INK}` }}>
      <div className="flex items-center justify-center px-2 text-center uppercase" style={{ background: C.RED, color: C.ON_LOUD, fontFamily: COMIC_FONT, fontSize: 15, lineHeight: 1, width: 64, borderRight: `4px solid ${C.INK}` }}>
        {label}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2">{children}</div>
    </div>
  );
}

/** A drop in the strip: its item's icon in an inked box, what it is, the item (up to two lines), its GP and `detail`. */
function StripDrop({ drop, tag, detail, coins }: { drop: WrappedShareCardDropModel; tag: string; detail?: string | null; coins: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex shrink-0 items-center justify-center" style={{ width: 40, height: 40, border: `3px solid ${C.INK}`, background: C.YELLOW_TINT }}>
        <CardImage src={drop.iconUrl} className="object-contain [image-rendering:pixelated]" style={{ width: 28, height: 28 }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate uppercase" style={{ fontFamily: COMIC_FONT, fontSize: 12, lineHeight: 1, color: C.RED, letterSpacing: "0.04em" }}>
          {tag}
        </p>
        <p className="line-clamp-2 text-[14px] font-bold leading-tight">
          {drop.itemName}
          {drop.quantityLabel && <span className="num ml-1 font-normal">{drop.quantityLabel}</span>}
        </p>
        {(drop.gpLabel || detail) && (
          <p className="flex min-w-0 items-center gap-1.5 text-[12px] leading-tight" style={{ color: C.INK_SUBTLE }}>
            {drop.gpLabel && <Gp label={drop.gpLabel} coins={coins} size={15} />}
            {detail && <span className="truncate">{detail}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

/** What a full Player card leaves out, in this order, while it doesn't fit: text is never shrunk to cram them in. */
const LEAVE_OUT = ["driestStreak", "ehb", "achievements"] as const;
type Optional = (typeof LEAVE_OUT)[number];

/**
 * Which of the Player card's optional fields to show: all it has, then one fewer at a time, in LEAVE_OUT's order, while
 * the card (`ref`) still overflows. Measured before paint, so the card is never seen (or drawn) overflowing.
 */
function useFit(card: WrappedPlayerCardModel) {
  const ref = useRef<HTMLDivElement>(null);
  const has: Record<Optional, boolean> = { driestStreak: !!card.driestStreak, ehb: !!card.ehbLabel, achievements: !!card.achievementsLabel };
  const present = LEAVE_OUT.filter((f) => has[f]);
  const [fit, setFit] = useState({ card, left: 0 });
  const left = fit.card === card ? fit.left : 0;
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && left < present.length && el.scrollHeight > el.clientHeight + 1) setFit({ card, left: left + 1 });
  });
  const out = present.slice(0, left);
  return { ref, shows: (f: Optional) => has[f] && !out.includes(f) };
}

function PlayerCard({ card }: { card: WrappedPlayerCardModel }) {
  const fit = useFit(card);
  const teamLine = [card.team?.name, card.partnerLabel].filter(Boolean).join(" · ");
  const stats = [
    card.submissions && `${card.submissions.countLabel} submissions${card.submissions.comparisonLabel ? ` (${card.submissions.comparisonLabel})` : ""}`,
    fit.shows("achievements") && `${card.achievementsLabel} achievements`,
    fit.shows("ehb") && `${card.ehbLabel} EHB gained`,
  ].filter((s): s is string => !!s);
  const streak = fit.shows("driestStreak") ? card.driestStreak : null;
  const drops = [
    card.topDrop && { drop: card.topDrop, tag: card.topDrop.isLuckiest ? "Top drop · Luckiest drop" : "Top drop", luck: card.topDrop.luckLabel },
    card.luckiestDrop && { drop: card.luckiestDrop, tag: "Luckiest drop", luck: card.luckiestDrop.luckLabel },
  ].filter((d) => !!d);
  return (
    <Cover
      card={card}
      issue="Player card"
      accent={coverColor(card.team?.color)}
      bodyRef={fit.ref}
      strip={
        (drops.length > 0 || streak) && (
          <Strip label="In this issue">
            {drops.length > 0 && (
              // Side by side, so the strip stays one drop high.
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${drops.length}, minmax(0, 1fr))` }}>
                {drops.map(({ drop, tag, luck }) => (
                  <StripDrop key={drop.key} drop={drop} tag={tag} detail={luck && `${luck} luck`} coins={card.coinsIconUrl} />
                ))}
              </div>
            )}
            {streak && (
              <p className="truncate text-[12px] leading-tight">
                <span className="uppercase" style={{ fontFamily: COMIC_FONT, color: C.RED, letterSpacing: "0.04em" }}>
                  Driest streak:{" "}
                </span>
                <b className="num">{streak.killsLabel}</b> at {streak.boss} · only <span className="num">{streak.chanceLabel}</span> go that dry
              </p>
            )}
          </Strip>
        )
      }
    >
      <div className="relative flex flex-col items-start gap-2" style={beside(card)}>
        <div className="flex items-center gap-2">
          <Caption tilt={-3} fill={C.YELLOW}>
            Starring
          </Caption>
          {card.draftLabel && (
            <Caption size={12} tilt={2}>
              {card.draftLabel}
            </Caption>
          )}
        </div>
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <Avatar url={card.avatarUrl} name={card.name} size={64} style={{ border: `4px solid ${C.INK}`, boxShadow: hardShadow(3) }} />
          <div className="min-w-0">
            <Title size={50}>{card.name}</Title>
            {teamLine && (
              <p className="truncate" style={{ fontFamily: COMIC_FONT, fontSize: 20, lineHeight: 1.1, letterSpacing: "0.02em", color: C.TITLE_FILL, WebkitTextStroke: `0.8px ${C.INK}`, textShadow: hardShadow(2) }}>
                {teamLine}
              </p>
            )}
          </div>
        </div>
      </div>
      {(card.pointsShare || card.dropValueLabel) && (
        <div className="relative flex items-center gap-3">
          {card.pointsShare && (
            <Burst fill={C.YELLOW} size={148}>
              <span style={{ fontSize: 12 }}>Points share</span>
              <span className="num" style={{ fontSize: 36 }}>
                {card.pointsShare.shareLabel}
              </span>
              {card.pointsShare.teamPercentLabel && <span style={{ fontSize: 12 }}>{card.pointsShare.teamPercentLabel}</span>}
            </Burst>
          )}
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            {card.pointsShare && (
              <Caption size={20} tilt={2}>
                {card.pointsShare.teamRankLabel}
              </Caption>
            )}
            {card.pointsShare?.bingoRankLabel && (
              <Caption fill={C.CYAN_TINT} tilt={-1}>
                {card.pointsShare.bingoRankLabel}
              </Caption>
            )}
            {card.dropValueLabel && (
              <Caption fill={C.YELLOW_TINT} tilt={1}>
                <Gp label={card.dropValueLabel} coins={card.coinsIconUrl} size={16} /> drop value
              </Caption>
            )}
          </div>
        </div>
      )}
      {(stats.length > 0 || card.titles.length > 0) && (
        // Down at the foot of the cover, over the strip.
        <div className="relative mt-auto flex flex-col items-start gap-2">
          {stats.length > 0 && (
            <Caption size={13} style={beside(card)}>
              {stats.join(" · ")}
            </Caption>
          )}
          {card.titles.length > 0 && (
            // At most 3, wrapping onto a second line rather than cutting one off.
            <div className="flex flex-wrap gap-1.5">
              {card.titles.map((t) => (
                <span key={t.id} style={{ fontFamily: COMIC_FONT, fontSize: 13, background: C.MAGENTA, color: C.ON_LOUD, border: `2px solid ${C.INK}`, padding: "1px 7px", letterSpacing: "0.03em" }}>
                  ★ {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Cover>
  );
}

function TeamCard({ card }: { card: WrappedTeamCardModel }) {
  // "1st of 4": the ordinal big in the burst, the rest under it.
  const [place, ...ofTeams] = card.placementLabel.split(" ");
  return (
    <Cover
      card={card}
      issue="Team card"
      accent={coverColor(card.color)}
      strip={
        (card.biggestDrop || card.superlatives.length > 0) && (
          <Strip label="Also in this issue">
            {card.biggestDrop && <StripDrop drop={card.biggestDrop} tag="Biggest drop" detail={card.biggestDrop.player?.name} coins={card.coinsIconUrl} />}
            {card.superlatives.map((s) => (
              <div key={s.category} className="flex min-w-0 items-center gap-2">
                <span className="flex shrink-0">
                  {s.winners.map((w, i) => (
                    <Avatar key={w.id} url={w.avatarUrl} name={w.name} size={24} style={{ marginLeft: i ? -8 : 0, border: `2px solid ${C.INK}` }} />
                  ))}
                </span>
                <p className="min-w-0 truncate text-[13px]">
                  <b>{s.winners.map((w) => w.name).join(" & ")}</b> · {s.category}
                </p>
              </div>
            ))}
          </Strip>
        )
      }
    >
      <div className="relative flex flex-col items-start gap-2" style={beside(card)}>
        <Caption tilt={-3} fill={C.YELLOW}>
          The sensational
        </Caption>
        <Title size={44} lines={3}>
          {card.name}
        </Title>
      </div>
      <div className="relative flex items-center gap-3">
        <Burst fill={medal(card.placement)} size={148}>
          <span style={{ fontSize: 50 }}>{place}</span>
          <span style={{ fontSize: 15 }}>{ofTeams.join(" ")}</span>
        </Burst>
        <div className="flex flex-col items-start gap-1.5">
          <Caption size={20} tilt={2}>
            <span className="num">{card.pointsLabel}</span> points
          </Caption>
          <Caption fill={C.CYAN_TINT} tilt={-1}>
            <span className="num">{card.tilesCompleted.toLocaleString()}</span> {card.tilesCompleted === 1 ? "tile" : "tiles"} · <span className="num">{card.linesCompleted.toLocaleString()}</span>{" "}
            {card.linesCompleted === 1 ? "line" : "lines"}
          </Caption>
          {card.dropValueLabel && (
            <Caption fill={C.YELLOW_TINT} tilt={1}>
              <Gp label={card.dropValueLabel} coins={card.coinsIconUrl} size={16} /> drop value
            </Caption>
          )}
        </div>
      </div>
      {card.mvp && (
        // Down at the foot of the cover, over the strip, as quiet as the Player card's stats line.
        <div className="relative mt-auto flex min-w-0 items-center gap-2 self-start" style={beside(card)}>
          <Caption size={13} fill={C.RED} tilt={-2} style={{ color: C.ON_LOUD, flexShrink: 0 }}>
            MVP
          </Caption>
          <Caption size={13} style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <Avatar url={card.mvp.person.avatarUrl} name={card.mvp.person.name} size={20} style={{ border: `2px solid ${C.INK}` }} />
            <span className="min-w-0">
              {card.mvp.person.name} · <span className="num">{card.mvp.shareLabel}</span> Points share{card.mvp.teamPercentLabel && ` · ${card.mvp.teamPercentLabel}`}
            </span>
          </Caption>
        </div>
      )}
    </Cover>
  );
}
