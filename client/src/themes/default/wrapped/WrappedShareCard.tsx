import type { CSSProperties, ReactNode } from "react";
import type { WrappedBingoCardModel, WrappedPersonModel, WrappedPlayerCardModel, WrappedShareCardDropModel, WrappedShareCardModel, WrappedTeamCardModel } from "../../../headless/types";
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
    case "bingo":
      return <BingoCard card={card} />;
  }
}

/** The card's frame: a glow of `accent` from the top, a kicker over the content, and the footer. */
function Frame({ accent, kicker, card, children }: { accent: string | null; kicker: string; card: WrappedShareCardModel; children: ReactNode }) {
  const glow = accent ?? C.neutral;
  return (
    <div
      className="flex size-full flex-col px-9 pt-8 pb-6"
      style={{ backgroundColor: C.bg, backgroundImage: `radial-gradient(120% 55% at 50% 0%, color-mix(in srgb, ${glow} 35%, transparent) 0%, color-mix(in srgb, ${glow} 10%, transparent) 45%, transparent 75%)`, color: C.fg, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: glow }} />
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: C.muted }}>
        {kicker}
      </p>
      {/* The card's groups, top to bottom, with the room left over shared out between them. */}
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-6 pt-5">{children}</div>
      <footer className="mt-4 flex items-center justify-between gap-4 border-t pt-4 text-[12px]" style={{ borderColor: C.outline, color: C.muted }}>
        <span className="min-w-0 truncate font-semibold" style={{ color: C.fg }}>
          {card.bingoName}
        </span>
        <span className="shrink-0 tracking-wide">
          Wrapped · <span style={{ color: C.fg }}>{card.siteLabel}</span>
        </span>
      </footer>
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

function Stat({ value, label, color, size = 48 }: { value: string; label: string; color?: string; size?: number }) {
  return (
    <div className="min-w-0">
      <div className="num truncate font-black leading-none tracking-tight" style={{ fontSize: size, color: color ?? C.fg }}>
        {value}
      </div>
      <Label className="mt-2">{label}</Label>
    </div>
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

function Person({ person, detail }: { person: WrappedPersonModel; detail: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar url={person.avatarUrl} name={person.name} size={40} />
      <div className="min-w-0">
        <p className="truncate text-[17px] font-bold leading-tight">{person.name}</p>
        <p className="num truncate text-[13px] leading-tight" style={{ color: C.muted }}>
          {detail}
        </p>
      </div>
    </div>
  );
}

/** An item's wiki icon on its tile; an empty tile when the item has none. */
function ItemTile({ drop, size = 44 }: { drop: WrappedShareCardDropModel; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-lg border" style={{ width: size, height: size, backgroundColor: C.surface, borderColor: C.outline }}>
      <CardImage src={drop.iconUrl} className="object-contain [image-rendering:pixelated]" style={{ width: size * 0.73, height: size * 0.73 }} />
    </span>
  );
}

function DropRow({ drop, rank, detail, size }: { drop: WrappedShareCardDropModel; rank?: number; detail?: ReactNode; size?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {rank !== undefined && (
        <span className="num w-4 shrink-0 text-center text-[14px] font-bold" style={{ color: C.subtle }}>
          {rank}
        </span>
      )}
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
      {drop.gpLabel && (
        <span className="num shrink-0 text-[18px] font-black" style={{ color: C.gold }}>
          {drop.gpLabel}
        </span>
      )}
    </div>
  );
}

function PlayerCard({ card }: { card: WrappedPlayerCardModel }) {
  const accent = card.team?.color ?? null;
  const facts = [card.team?.name, card.partnerLabel, card.pickLabel].filter(Boolean);
  const stats = [card.pointsShare && { value: card.pointsShare.shareLabel, label: "Points share" }, card.dropValueLabel && { value: card.dropValueLabel, label: "Drop value", color: C.gold }].filter(
    (s): s is { value: string; label: string; color?: string } => !!s,
  );
  const streak = card.driestStreak;
  return (
    <Frame accent={accent} kicker="My Bingo" card={card}>
      <div className="flex items-center gap-5">
        <Avatar url={card.avatarUrl} name={card.name} size={72} ring={accent} />
        <div className="min-w-0">
          <h2 className="truncate text-[36px] font-black leading-[1.1] tracking-tight">{card.name}</h2>
          {facts.length > 0 && (
            <p className="mt-1 flex min-w-0 items-center gap-2 text-[15px]" style={{ color: C.muted }}>
              {card.team?.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: card.team.color }} />}
              <span className="truncate">{facts.join(" · ")}</span>
            </p>
          )}
        </div>
      </div>

      {(stats.length > 0 || card.titles.length > 0) && (
        <div>
          {stats.length > 0 && (
            <div className="grid grid-cols-2 gap-6">
              {stats.map((s) => (
                <Stat key={s.label} value={s.value} label={s.label} color={s.color} size={stats.length === 1 ? 56 : 44} />
              ))}
            </div>
          )}
          {card.pointsShare && (
            <p className="num mt-3 text-[15px] font-semibold" style={{ color: C.fg }}>
              {card.pointsShare.rankLabel}
            </p>
          )}
          {card.titles.length > 0 && (
            // One row, whatever the Titles are called, so the card's height never depends on them.
            <div className={`flex gap-2 overflow-hidden ${stats.length ? "mt-4" : ""}`}>
              {card.titles.map((t) => (
                <span key={t.id} className="shrink-0 rounded-full border px-3 py-1 text-[13px] font-semibold" style={{ borderColor: C.outline, backgroundColor: C.surface }}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        {card.topDrops.length > 0 && (
          <>
            <Label>Top drops</Label>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {card.topDrops.map((d, i) => (
                <DropRow key={d.key} drop={d} rank={i + 1} size={40} />
              ))}
            </div>
          </>
        )}
        {streak && (
          <div className={card.topDrops.length ? "mt-3.5" : ""}>
            <Label>Driest streak</Label>
            <p className="mt-1.5 text-[15px]">
              <span className="num font-bold">{streak.killsLabel}</span> at {streak.boss}
              <span style={{ color: C.muted }}>
                {" "}
                · only <span className="num">{streak.chanceLabel}</span> go that dry
              </span>
            </p>
          </div>
        )}
      </div>
    </Frame>
  );
}

function TeamCard({ card }: { card: WrappedTeamCardModel }) {
  return (
    <Frame accent={card.color} kicker="My Team" card={card}>
      <div>
        <h2 className="line-clamp-2 text-[44px] font-black leading-[1.05] tracking-tight">{card.name}</h2>
        <div className="num mt-5 text-[80px] font-black leading-none tracking-tight" style={{ color: medal(card.placement) }}>
          {card.placementLabel}
        </div>
        <p className="mt-2 text-[16px]" style={{ color: C.muted }}>
          <span className="num font-semibold" style={{ color: C.fg }}>
            {card.pointsLabel}
          </span>{" "}
          points
        </p>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Stat value={card.tilesCompleted.toLocaleString()} label={card.tilesCompleted === 1 ? "Tile completed" : "Tiles completed"} size={40} />
        <Stat value={card.linesCompleted.toLocaleString()} label={card.linesCompleted === 1 ? "Line completed" : "Lines completed"} size={40} />
      </div>
      <div className="flex flex-col gap-5">
        {card.mvp && (
          <div>
            <Label className="mb-2">MVP</Label>
            <Person person={card.mvp.person} detail={`${card.mvp.shareLabel} Points share`} />
          </div>
        )}
        {card.biggestDrop && (
          <div>
            <Label className="mb-2">Biggest drop</Label>
            <DropRow drop={card.biggestDrop} detail={card.biggestDrop.player?.name} />
          </div>
        )}
      </div>
    </Frame>
  );
}

function BingoCard({ card }: { card: WrappedBingoCardModel }) {
  const winner = card.winners[0];
  return (
    <Frame accent={winner?.color ?? null} kicker="The Bingo" card={card}>
      <div>
        <h2 className="line-clamp-2 text-[40px] font-black leading-[1.05] tracking-tight">{card.bingoName}</h2>
        {winner && (
          <div className="mt-6">
            <Label>{card.winners.length > 1 ? "Winners" : "Winner"}</Label>
            <div className="mt-2 flex min-w-0 items-center gap-3">
              {card.winners.map((w) => (
                <span key={w.name} className="size-4 shrink-0 rounded-full" style={{ backgroundColor: w.color ?? C.neutral }} />
              ))}
              <span className="truncate text-[34px] font-black leading-tight" style={{ color: C.gold }}>
                {card.winners.map((w) => w.name).join(" & ")}
              </span>
            </div>
            {card.winnerPointsLabel && (
              <p className="mt-1 text-[16px]" style={{ color: C.muted }}>
                <span className="num font-semibold" style={{ color: C.fg }}>
                  {card.winnerPointsLabel}
                </span>{" "}
                points
              </p>
            )}
          </div>
        )}
      </div>
      {(card.totalGpLabel || card.submissionsLabel) && (
        <div className="grid grid-cols-2 gap-6">
          {card.totalGpLabel && <Stat value={card.totalGpLabel} label="Drop value" color={C.gold} size={44} />}
          {card.submissionsLabel && <Stat value={card.submissionsLabel} label="Submissions" size={44} />}
        </div>
      )}
      <div className="flex flex-col gap-5">
        {card.rarestDrop && (
          <div>
            <Label className="mb-2">Rarest drop</Label>
            <DropRow
              drop={{ ...card.rarestDrop, gpLabel: null }}
              detail={
                <>
                  <span className="num font-semibold" style={{ color: C.gold }}>
                    {card.rarestDrop.chanceLabel}
                  </span>
                  {card.rarestDrop.player && <> · {card.rarestDrop.player.name}</>}
                </>
              }
            />
          </div>
        )}
        {card.steal && (
          <div>
            <Label className="mb-2">Biggest Steal</Label>
            <Person person={card.steal.person} detail={`${card.steal.pickLabel}, finished ${card.steal.rankLabel}: beat it by ${card.steal.placesBeatenLabel}`} />
          </div>
        )}
      </div>
    </Frame>
  );
}
