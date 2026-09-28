import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import type { WrappedPersonModel, WrappedPlayerCardModel, WrappedShareCardDropModel, WrappedShareCardModel, WrappedTeamCardModel } from "../../../headless/types";
import { CardImage } from "../../../core/wrapped/ShareCards";

// The default theme's share cards: Wrapped's own look (huge black numerals, small spaced-out kickers, hairline
// borders), always on the dark palette so a card reads the same whoever shares it, lit by the Team's colour. Colours
// are written out here rather than taken from the page's tokens, which follow the viewer's light or dark scheme.

const C = {
  bg: "#09090b",
  surface: "#141417",
  outline: "#26262b",
  fg: "#fafafa",
  muted: "#a1a1aa",
  subtle: "#71717a",
  gold: "#fbbf24",
  silver: "#cbd5e1",
  bronze: "#d97706",
  neutral: "#52525b",
};

const medal = (placement: number) => (placement === 1 ? C.gold : placement === 2 ? C.silver : placement === 3 ? C.bronze : C.fg);

export function WrappedShareCard({ card }: { card: WrappedShareCardModel }) {
  switch (card.kind) {
    case "player":
      return <PlayerCard card={card} />;
    case "team":
      return <TeamCard card={card} />;
  }
}

/** The card's frame: a glow of `accent` from the top, then the Bingo's name over the content. */
function Frame({ accent, card, bodyRef, children }: { accent: string | null; card: WrappedShareCardModel; bodyRef?: Ref<HTMLDivElement>; children: ReactNode }) {
  const glow = accent ?? C.neutral;
  return (
    <div
      className="flex size-full flex-col px-9 pt-8 pb-8"
      style={{ backgroundColor: C.bg, backgroundImage: `radial-gradient(120% 55% at 50% 0%, color-mix(in srgb, ${glow} 35%, transparent) 0%, color-mix(in srgb, ${glow} 10%, transparent) 45%, transparent 75%)`, color: C.fg, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="h-1.5 w-16 shrink-0 rounded-full" style={{ backgroundColor: glow }} />
      <p className="mt-4 truncate text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: C.muted }}>
        {card.bingoName}
      </p>
      {/* The card's groups, top to bottom, with the room left over shared out between them. Clipped, so a card that
          still overflows loses its tail rather than spilling; the inner gutter keeps an avatar's ring whole. */}
      <div ref={bodyRef} className="-mx-2 flex min-h-0 flex-1 flex-col justify-between gap-5 overflow-hidden px-2 pt-4">
        {children}
      </div>
    </div>
  );
}

/** A small spaced-out label over a value. */
function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${className}`} style={{ color: C.subtle }}>
      {children}
    </p>
  );
}

/** A GP figure with the Coins icon, sized to it; just the figure if the icon doesn't load. */
function Gp({ label, coins, size, className = "" }: { label: string; coins: string; size: number; className?: string }) {
  return (
    <span className={`num inline-flex min-w-0 items-center font-black leading-none ${className}`} style={{ fontSize: size, color: C.gold, gap: size * 0.18 }}>
      <CardImage src={coins} className="shrink-0 object-contain [image-rendering:pixelated]" style={{ width: size * 0.95, height: size * 0.95 }} />
      {label}
    </span>
  );
}

function Avatar({ url, name, size, ring }: { url: string; name: string; size: number; ring?: string | null }) {
  const style: CSSProperties = { width: size, height: size, boxShadow: ring ? `0 0 0 3px ${C.bg}, 0 0 0 5px ${ring}` : undefined };
  return (
    <CardImage
      src={url || null}
      className="shrink-0 rounded-full object-cover"
      style={style}
      fallback={
        <span className="flex shrink-0 items-center justify-center rounded-full font-black" style={{ ...style, backgroundColor: C.surface, color: C.muted, fontSize: size * 0.45 }}>
          {name.charAt(0).toUpperCase()}
        </span>
      }
    />
  );
}

/** Overlapping avatars, for a Superlative's tied winners. */
function Avatars({ people, size }: { people: WrappedPersonModel[]; size: number }) {
  return (
    <span className="flex shrink-0">
      {people.map((p, i) => (
        <span key={p.id} className="rounded-full" style={{ marginLeft: i ? -size * 0.3 : 0, boxShadow: `0 0 0 2px ${C.bg}` }}>
          <Avatar url={p.avatarUrl} name={p.name} size={size} />
        </span>
      ))}
    </span>
  );
}

/** An item's wiki icon on its tile; an empty tile when the item has none. */
function ItemTile({ drop, size }: { drop: WrappedShareCardDropModel; size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-lg border" style={{ width: size, height: size, backgroundColor: C.surface, borderColor: C.outline }}>
      <CardImage src={drop.iconUrl} className="object-contain [image-rendering:pixelated]" style={{ width: size * 0.73, height: size * 0.73 }} />
    </span>
  );
}

function DropRow({ drop, coins, tag, detail, size }: { drop: WrappedShareCardDropModel; coins: string; tag: string; detail?: ReactNode; size: number }) {
  return (
    <div>
      <Label className="mb-1.5">{tag}</Label>
      <div className="flex min-w-0 items-center gap-3">
        <ItemTile drop={drop} size={size} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-tight">
            {drop.itemName}
            {drop.quantityLabel && (
              <span className="num ml-1.5 font-normal" style={{ color: C.muted }}>
                {drop.quantityLabel}
              </span>
            )}
          </p>
          {detail && (
            <p className="mt-0.5 truncate text-[13px] leading-tight" style={{ color: C.muted }}>
              {detail}
            </p>
          )}
        </div>
        {drop.gpLabel && <Gp label={drop.gpLabel} coins={coins} size={18} className="shrink-0" />}
      </div>
    </div>
  );
}

const luckDetail = (luckLabel: string) => (
  <>
    <span className="num font-semibold" style={{ color: C.gold }}>
      {luckLabel}
    </span>{" "}
    luck
  </>
);

/** What a full Player card leaves out, in this order, while it doesn't fit: text is never shrunk to cram them in. */
const LEAVE_OUT = ["driestStreak", "ehb", "achievements"] as const;
type Optional = (typeof LEAVE_OUT)[number];

/**
 * Which of the Player card's optional fields to show: all it has, then one fewer at a time, in LEAVE_OUT's order, while
 * the body (`ref`) still overflows. Measured before paint, so the card is never seen (or drawn) overflowing.
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
  const accent = card.team?.color ?? null;
  const fit = useFit(card);
  const facts = [card.team?.name, card.partnerLabel].filter(Boolean);
  const badges = [card.pointsShare?.teamRankLabel, card.pointsShare?.bingoRankLabel].filter((b): b is string => !!b);
  const small = [
    card.submissions && { label: "Submissions", value: card.submissions.countLabel, extra: card.submissions.comparisonLabel },
    fit.shows("achievements") && { label: "Achievements", value: card.achievementsLabel!, extra: null },
    fit.shows("ehb") && { label: "EHB gained", value: card.ehbLabel!, extra: null },
  ].filter((s): s is { label: string; value: string; extra: string | null } => !!s);
  const streak = fit.shows("driestStreak") ? card.driestStreak : null;
  return (
    <Frame accent={accent} card={card} bodyRef={fit.ref}>
      <div>
        <div className="flex items-center gap-5">
          <Avatar url={card.avatarUrl} name={card.name} size={68} ring={accent} />
          <div className="min-w-0">
            <h2 className="truncate text-[34px] font-black leading-[1.1] tracking-tight">{card.name}</h2>
            {facts.length > 0 && (
              <p className="mt-1 flex min-w-0 items-center gap-2 text-[14px]" style={{ color: C.muted }}>
                {card.team?.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: card.team.color }} />}
                <span className="truncate">{facts.join(" · ")}</span>
              </p>
            )}
          </div>
        </div>
        {(badges.length > 0 || card.draftLabel) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {badges.map((b) => (
              <span key={b} className="num rounded-md border px-2.5 py-1 text-[13px] font-bold" style={{ borderColor: C.outline, backgroundColor: C.surface }}>
                {b}
              </span>
            ))}
            {card.draftLabel && (
              <span className="num px-1 text-[13px] font-semibold" style={{ color: C.muted }}>
                {card.draftLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {(card.pointsShare || card.dropValueLabel || small.length > 0 || card.titles.length > 0) && (
        <div>
          {(card.pointsShare || card.dropValueLabel) && (
            <div className="grid grid-cols-2 gap-6">
              {card.pointsShare && (
                <div className="min-w-0">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="num text-[44px] font-black leading-none tracking-tight">{card.pointsShare.shareLabel}</span>
                    {card.pointsShare.teamPercentLabel && (
                      <span className="num truncate text-[14px] font-semibold" style={{ color: C.muted }}>
                        {card.pointsShare.teamPercentLabel}
                      </span>
                    )}
                  </div>
                  <Label className="mt-2">Points share</Label>
                </div>
              )}
              {card.dropValueLabel && (
                <div className="min-w-0">
                  <Gp label={card.dropValueLabel} coins={card.coinsIconUrl} size={44} className="tracking-tight" />
                  <Label className="mt-2">Drop value</Label>
                </div>
              )}
            </div>
          )}
          {small.length > 0 && (
            <div className="mt-4 flex gap-7">
              {small.map((s) => (
                <div key={s.label} className="min-w-0">
                  <p className="num text-[20px] font-black leading-none">
                    {s.value}
                    {s.extra && (
                      <span className="ml-1.5 text-[13px] font-semibold" style={{ color: C.muted }}>
                        {s.extra}
                      </span>
                    )}
                  </p>
                  <Label className="mt-1.5">{s.label}</Label>
                </div>
              ))}
            </div>
          )}
          {card.titles.length > 0 && (
            // At most 3, wrapping onto a second line rather than cutting one off.
            <div className="mt-4 flex flex-wrap gap-2">
              {card.titles.map((t) => (
                <span key={t.id} className="rounded-full border px-3 py-1 text-[13px] font-semibold" style={{ borderColor: C.outline, backgroundColor: C.surface }}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {(card.topDrop || card.luckiestDrop || streak) && (
        <div className="flex flex-col gap-3">
          {card.topDrop && (
            <DropRow
              drop={card.topDrop}
              coins={card.coinsIconUrl}
              tag={card.topDrop.isLuckiest ? "Top drop · Luckiest drop" : "Top drop"}
              detail={card.topDrop.luckLabel && luckDetail(card.topDrop.luckLabel)}
              size={40}
            />
          )}
          {card.luckiestDrop && <DropRow drop={card.luckiestDrop} coins={card.coinsIconUrl} tag="Luckiest drop" detail={luckDetail(card.luckiestDrop.luckLabel)} size={40} />}
          {streak && (
            <div>
              <Label>Driest streak</Label>
              <p className="mt-1 text-[14px]">
                <span className="num font-bold">{streak.killsLabel}</span> at {streak.boss}
                <span style={{ color: C.muted }}>
                  {" "}
                  · only <span className="num">{streak.chanceLabel}</span> go that dry
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </Frame>
  );
}

function TeamCard({ card }: { card: WrappedTeamCardModel }) {
  const counts = [
    { value: card.tilesCompleted.toLocaleString(), label: card.tilesCompleted === 1 ? "Tile" : "Tiles" },
    { value: card.linesCompleted.toLocaleString(), label: card.linesCompleted === 1 ? "Line" : "Lines" },
  ];
  return (
    <Frame accent={card.color} card={card}>
      <div>
        <h2 className="line-clamp-2 text-[38px] font-black leading-[1.05] tracking-tight">{card.name}</h2>
        <div className="mt-3 flex items-baseline gap-4">
          <span className="num text-[64px] font-black leading-none tracking-tight" style={{ color: medal(card.placement) }}>
            {card.placementLabel}
          </span>
          <span className="text-[15px]" style={{ color: C.muted }}>
            <span className="num font-semibold" style={{ color: C.fg }}>
              {card.pointsLabel}
            </span>{" "}
            points
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-5">
        {counts.map((s) => (
          <div key={s.label}>
            <div className="num text-[34px] font-black leading-none">{s.value}</div>
            <Label className="mt-2">{s.label}</Label>
          </div>
        ))}
        {card.dropValueLabel && (
          <div className="min-w-0">
            <Gp label={card.dropValueLabel} coins={card.coinsIconUrl} size={34} />
            <Label className="mt-2">Drop value</Label>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        {card.mvp && (
          <div>
            <Label className="mb-1.5">MVP</Label>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar url={card.mvp.person.avatarUrl} name={card.mvp.person.name} size={36} />
              <p className="min-w-0 truncate text-[16px] font-bold">
                {card.mvp.person.name}
                <span className="num ml-2 text-[13px] font-normal" style={{ color: C.muted }}>
                  {card.mvp.shareLabel} Points share{card.mvp.teamPercentLabel && ` · ${card.mvp.teamPercentLabel}`}
                </span>
              </p>
            </div>
          </div>
        )}
        {card.biggestDrop && <DropRow drop={card.biggestDrop} coins={card.coinsIconUrl} tag="Biggest drop" detail={card.biggestDrop.player?.name} size={36} />}
        {card.superlatives.length > 0 && (
          <div>
            <Label className="mb-1.5">Superlatives</Label>
            <div className="flex flex-col gap-2">
              {card.superlatives.map((s) => (
                <div key={s.category} className="flex min-w-0 items-center gap-3">
                  <Avatars people={s.winners} size={26} />
                  <p className="min-w-0 truncate text-[14px]">
                    <span className="font-bold">{s.winners.map((w) => w.name).join(" & ")}</span>
                    <span style={{ color: C.muted }}> · {s.category}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Frame>
  );
}
