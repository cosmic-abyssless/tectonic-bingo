// PROTOTYPE (throwaway, #315) — what should the comic theme's share cards look like?
// Two directions for the comic theme's WrappedShareCard slot, on the real Wrapped Outro, switchable via
// `?variant=A|B`, with `?fill=real|max|sparse` to push each one through real data, every field at its longest, and
// almost nothing. Fields left out to fit (streak → EHB → Achievements, as the default card does) are measured live and
// shown in the switcher, along with any card that still overflows.
//   A  Comic cover: a masthead, the Wrapped art as the cover star, SFX bursts for the big numbers.
//   B  Panel page: a comic page of bordered panels, narration captions, SFX bursts.
// Round 2: C (papercut collage) cut; the rounded SFX puffs and the speech bubbles gone; B's Title chips on both.
// The card model has no art, so the prototype takes it from the Wrapped page (the section's Category image, else a
// side image). Web fonts are embedded when the image is drawn (data-embed-fonts), so Bangers makes it into the PNG.
// Lives on branch prototype/315-comic-share-cards only; nothing here is production code.

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWrappedModel } from "../../../headless";
import type { WrappedPersonModel, WrappedPlayerCardModel, WrappedShareCardDropModel, WrappedShareCardModel, WrappedTeamCardModel } from "../../../headless/types";
import { wikiIconUrl } from "../../../api/wikiIcons";
import { CardImage } from "../../../core/wrapped/ShareCards";
import { PrototypeSwitcher, usePrototypeParam } from "../../../core/ui/PrototypeSwitcher";
import { getColors, TECTONIC_LOGO } from "../board/colors";
import { burstPoints } from "../ui/Burst";
import { onFill } from "../ui/tones";
import { COMIC_FONT, COMIC_LOGO_FONT } from "../font";

const VARIANTS = ["A", "B"];
const VARIANT_NAMES: Record<string, string> = { A: "Comic cover", B: "Panel page" };
const FILLS = ["real", "max", "sparse"];

// Always the newsprint palette, so a card reads the same whoever shares it (as the default card is always dark).
const K = getColors("light");
const BODY = "ui-sans-serif, system-ui, sans-serif";

// ---------- the slot ----------

export function ShareCardPrototype({ card }: { card: WrappedShareCardModel }) {
  const variant = usePrototypeParam("variant", VARIANTS);
  const fill = usePrototypeParam("fill", FILLS);
  const art = useCardArt(card.kind);
  const note = useNote();
  const filled = useMemo(() => (card.kind === "player" ? fillPlayer(card, fill) : fillTeam(card, fill)), [card, fill]);
  const fitKey = `${variant}|${fill}|${card.key}`;

  let body: ReactNode;
  if (filled.kind === "player") {
    body = variant === "A" ? <CoverPlayer card={filled} art={art} fitKey={fitKey} /> : <PanelPlayer card={filled} art={art} fitKey={fitKey} />;
  } else {
    body = variant === "A" ? <CoverTeam card={filled} art={art} fitKey={fitKey} /> : <PanelTeam card={filled} art={art} fitKey={fitKey} />;
  }
  return (
    <>
      <div data-embed-fonts className="size-full" style={{ fontFamily: BODY, color: K.INK }}>
        {body}
      </div>
      {card.kind === "player" && createPortal(<PrototypeSwitcher variants={VARIANTS} names={VARIANT_NAMES} fills={FILLS} note={note || undefined} />, document.body)}
    </>
  );
}

/** A Category image for the card's section, else a side image (a different one for each card where there are two). */
function useCardArt(kind: "player" | "team"): string | null {
  const w = useWrappedModel();
  const from = (id: string) => {
    const s = w.sections.find((x) => x.id === id)?.section;
    return s && "art" in s ? s.art.images.map((i) => i.frames[0]) : [];
  };
  const side = w.sideArt.map((f) => f[0]);
  const list = kind === "player" ? [...from("you"), ...side] : [...from("team"), ...side.slice(1), ...side];
  return list[0] ?? null;
}

// ---------- ?fill= ----------

const icon = (name: string) => wikiIconUrl(name) ?? null;
const mdrop = (key: string, itemName: string, gpLabel: string | null, quantityLabel: string | null = null): WrappedShareCardDropModel => ({ key, itemName, iconUrl: icon(itemName), quantityLabel, gpLabel });
const person = (id: string, name: string, avatarUrl = ""): WrappedPersonModel => ({ id, name, avatarUrl, isYou: false });

function fillPlayer(c: WrappedPlayerCardModel, fill: string): WrappedPlayerCardModel {
  if (fill === "max")
    return {
      ...c,
      name: "Xx Zezima xX",
      team: { name: "The Absolutely Unkillable Dragonslayers", color: c.team?.color ?? "#7c3aed" },
      partnerLabel: "with Lynx Titan",
      draftLabel: "Pick #27 · Round 4",
      pointsShare: { shareLabel: "1,234.5", teamPercentLabel: "34% of Team", teamRankLabel: "Team #1 of 12", bingoRankLabel: "Bingo #3 of 142" },
      dropValueLabel: "1.23b",
      submissions: { countLabel: "148", comparisonLabel: "2.1× avg" },
      achievementsLabel: "27",
      ehbLabel: "312.4",
      titles: [
        { id: "t1", name: "Most Dedicated Grinder" },
        { id: "t2", name: "Luckiest Player Alive" },
        { id: "t3", name: "Chief Dry Streak Officer" },
      ],
      topDrop: { ...mdrop("top", "Tumeken's shadow (uncharged)", "1.18b"), isLuckiest: false, luckLabel: null },
      luckiestDrop: { ...mdrop("luck", "Pet kraken", null), luckLabel: "1 in 5,000" },
      driestStreak: { boss: "Corporeal Beast", killsLabel: "1,512 kills", chanceLabel: "1 in 250" },
    };
  if (fill === "sparse")
    return { ...c, partnerLabel: null, draftLabel: null, pointsShare: null, dropValueLabel: null, submissions: { countLabel: "2", comparisonLabel: "0.1× avg" }, achievementsLabel: null, ehbLabel: null, titles: [], topDrop: null, luckiestDrop: null, driestStreak: null };
  return c;
}

function fillTeam(c: WrappedTeamCardModel, fill: string): WrappedTeamCardModel {
  const you = c.mvp?.person ?? person("p0", "Zezima");
  if (fill === "max")
    return {
      ...c,
      name: "The Absolutely Unkillable Dragonslayers",
      color: c.color ?? "#7c3aed",
      placement: 1,
      placementLabel: "1st of 12",
      pointsLabel: "12,345",
      tilesCompleted: 48,
      linesCompleted: 9,
      dropValueLabel: "12.3b",
      mvp: { person: you, shareLabel: "1,234.5", teamPercentLabel: "34% of Team" },
      biggestDrop: { ...mdrop("big", "Tumeken's shadow (uncharged)", "1.18b"), player: person("p1", "Lynx Titan") },
      superlatives: [
        { category: "Most likely to go AFK at Zulrah", winners: [you, person("p2", "Woox")] },
        { category: "Best trash talker", winners: [person("p3", "B0aty")] },
        { category: "Captain's favourite", winners: [person("p4", "Settled"), person("p5", "Framed"), person("p6", "Odablock")] },
      ],
    };
  if (fill === "sparse") return { ...c, placement: 4, placementLabel: "4th of 4", pointsLabel: "120", tilesCompleted: 3, linesCompleted: 0, dropValueLabel: null, mvp: null, biggestDrop: null, superlatives: [] };
  return c;
}

// ---------- fitting (surfaced in the switcher) ----------

let notes: Record<string, string> = {};
let noteText = "";
const subs = new Set<() => void>();
function setNote(key: string, text: string) {
  if ((notes[key] ?? "") === text) return;
  notes = { ...notes, [key]: text };
  noteText = Object.entries(notes)
    .filter(([, t]) => t)
    .map(([k, t]) => `${k}: ${t}`)
    .join(" · ");
  subs.forEach((f) => f());
}
const useNote = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => noteText,
  );

type Opt = "driestStreak" | "ehb" | "achievements";
const LEAVE_OUT: Opt[] = ["driestStreak", "ehb", "achievements"];
const NONE: Record<Opt, boolean> = { driestStreak: false, ehb: false, achievements: false };

/** Leaves out optional fields in LEAVE_OUT's order while the card (`ref`, clipped) overflows; reports what it did. */
function useFit(fitKey: string, has: Record<Opt, boolean>, label: string) {
  const ref = useRef<HTMLDivElement>(null);
  const present = LEAVE_OUT.filter((f) => has[f]);
  const [fit, setFit] = useState({ key: fitKey, left: 0 });
  const left = fit.key === fitKey ? fit.left : 0;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const over = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    if (over && left < present.length) {
      setFit({ key: fitKey, left: left + 1 });
      return;
    }
    const out = present.slice(0, left);
    setNote(label, [out.length ? `left out ${out.join(", ")}` : "", over ? "STILL OVERFLOWS" : ""].filter(Boolean).join("; "));
  });
  const out = present.slice(0, left);
  return { ref, shows: (f: Opt) => has[f] && !out.includes(f) };
}

type DropLine = { d: WrappedShareCardDropModel; tag: string; luck: string | null };

const playerHas =(c: WrappedPlayerCardModel): Record<Opt, boolean> => ({ driestStreak: !!c.driestStreak, ehb: !!c.ehbLabel, achievements: !!c.achievementsLabel });

// ---------- shared bits ----------

type Ink = { color: string; opacity: number };
const INK_BLACK: Ink = { color: "#000000", opacity: 0.22 };
const INK_CYAN: Ink = { color: "#00a8e1", opacity: 0.35 };
const INK_MAGENTA: Ink = { color: "#e5007e", opacity: 0.28 };
const INK_YELLOW: Ink = { color: "#ffd400", opacity: 0.6 };

const halftones = new Map<string, string>();

/**
 * A real halftone screen: dots on a 45° grid whose size follows the tone, drawn once into an SVG. "up" is a card-sized
 * sheet going from nothing at 35% of the way down to full tone at the foot (anchored to the bottom); "corner" goes
 * from full tone in the bottom-right corner to nothing ~300px away (anchored there), so any panel gets the same fade.
 */
function halftone(ink: Ink, shape: "up" | "corner", step = 7): CSSProperties {
  const key = `${ink.color}|${ink.opacity}|${shape}|${step}`;
  let url = halftones.get(key);
  if (!url) {
    const [w, h] = shape === "up" ? [540, 675] : [540, 420];
    const tone = (x: number, y: number) => {
      const t = shape === "up" ? (y / h - 0.35) / 0.65 : 1 - Math.hypot(w - x, h - y) / 300;
      return Math.min(1, Math.max(0, t)) ** 1.15;
    };
    const maxR = step * 0.62;
    const circles: string[] = [];
    // Staggered rows: a square screen turned 45°.
    for (let row = 0, y = 0; y <= h + step; row++, y += step / 2) {
      for (let x = row % 2 ? step / 2 : 0; x <= w + step; x += step) {
        const r = maxR * tone(x, y);
        if (r >= 0.35) circles.push(`<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}"/>`);
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g fill="${ink.color}" fill-opacity="${ink.opacity}">${circles.join("")}</g></svg>`;
    url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    halftones.set(key, url);
  }
  return { backgroundImage: url, backgroundRepeat: "no-repeat", backgroundPosition: shape === "up" ? "center bottom" : "right bottom" };
}
const hard = (px = 4) => `${px}px ${px}px 0 ${K.INK}`;
const medalFill = (p: number) => (p === 1 ? K.YELLOW : p === 2 ? "#d9dde3" : p === 3 ? K.ORANGE : K.PAPER_RAISED);
const splitPlacement = (label: string) => {
  const [big, ...rest] = label.split(" ");
  return { big: big ?? label, rest: rest.join(" ") };
};
const hex = (c: string | null | undefined, fallback: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback);
function Avatar({ url, name, size, style }: { url: string; name: string; size: number; style?: CSSProperties }) {
  const s: CSSProperties = { width: size, height: size, ...style };
  return (
    <CardImage
      src={url || null}
      className="shrink-0 rounded-full object-cover"
      style={s}
      fallback={
        <span className="flex shrink-0 items-center justify-center rounded-full" style={{ ...s, background: K.YELLOW, color: K.INK, fontFamily: COMIC_FONT, fontSize: size * 0.5 }}>
          {name.charAt(0).toUpperCase()}
        </span>
      }
    />
  );
}

function Gp({ label, coins, size, color = K.INK }: { label: string; coins: string; size: number; color?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center leading-none" style={{ fontFamily: COMIC_FONT, fontSize: size, color, gap: size * 0.15 }}>
      <CardImage src={coins} className="shrink-0 object-contain [image-rendering:pixelated]" style={{ width: size * 0.9, height: size * 0.9 }} />
      {label}
    </span>
  );
}

function ItemIcon({ drop, size }: { drop: WrappedShareCardDropModel; size: number }) {
  return <CardImage src={drop.iconUrl} className="shrink-0 object-contain [image-rendering:pixelated]" style={{ width: size, height: size }} />;
}

/** The Wrapped art, static (its first frame): the sticker already carries its torn paper; this adds the shadow. */
function Sticker({ src, style }: { src: string; style?: CSSProperties }) {
  return <CardImage src={src} className="object-contain" style={{ filter: "drop-shadow(0 6px 8px rgb(0 0 0 / 0.35))", ...style }} />;
}

/** An SFX starburst (the comic Burst's shape, drawn statically). */
function Burst({ fill, size, rotate = -6, spikes = 16, children }: { fill: string; size: number; rotate?: number; spikes?: number; children: ReactNode }) {
  const pts = burstPoints(spikes, 36, 50, 5);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size, transform: `rotate(${rotate}deg)` }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
        <polygon points={pts} fill={K.INK} transform="translate(3 3.5)" />
        <polygon points={pts} fill={fill} stroke={K.INK} strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none" style={{ fontFamily: COMIC_FONT, color: K.INK }}>
        {children}
      </div>
    </div>
  );
}

/** A narration caption: a rectangle of tint, thick ink border, Bangers. */
function Caption({ children, fill = K.YELLOW_TINT, tilt = 0, size = 16, style }: { children: ReactNode; fill?: string; tilt?: number; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ background: fill, border: `3px solid ${K.INK}`, boxShadow: hard(3), padding: "3px 8px", fontFamily: COMIC_FONT, fontSize: size, lineHeight: 1.05, letterSpacing: "0.03em", textTransform: "uppercase", transform: tilt ? `rotate(${tilt}deg)` : undefined, ...style }}>
      {children}
    </div>
  );
}

// ================================================================================================
// A. Comic cover
// ================================================================================================

function Masthead({ bingoName, issue }: { bingoName: string; issue: string }) {
  return (
    <div className="relative flex shrink-0 items-stretch" style={{ background: K.PAPER_RAISED, borderBottom: `4px solid ${K.INK}` }}>
      <div className="flex items-center" style={{ background: TECTONIC_LOGO.bg, color: TECTONIC_LOGO.fg, fontFamily: COMIC_LOGO_FONT, fontWeight: 900, fontSize: 30, lineHeight: 1, padding: "6px 10px", textTransform: "uppercase", borderRight: `4px solid ${K.INK}` }}>
        Tectonic
      </div>
      <div className="min-w-0 flex-1 px-3 py-1.5">
        <div style={{ fontFamily: COMIC_FONT, fontSize: 12, letterSpacing: "0.08em", color: K.INK_SUBTLE, lineHeight: 1 }}>WRAPPED · {issue}</div>
        <div className="truncate" style={{ fontFamily: COMIC_FONT, fontSize: 32, lineHeight: 1.05, color: K.INK }}>
          {bingoName}
        </div>
      </div>
      <div className="flex flex-col items-center justify-center px-2 text-center" style={{ borderLeft: `4px solid ${K.INK}`, fontFamily: COMIC_FONT, fontSize: 13, lineHeight: 1, background: K.YELLOW }}>
        <span>FINAL</span>
        <span>ISSUE!</span>
      </div>
    </div>
  );
}

/** The cover's printed ground: the accent, with rays from behind the star and halftone rising from the foot. */
function CoverGround({ accent }: { accent: string }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: accent, backgroundImage: `repeating-conic-gradient(from 0deg at 72% 58%, rgb(255 255 255 / 0.17) 0deg 5deg, transparent 5deg 12deg)` }} />
      <div className="absolute inset-0" style={halftone(INK_BLACK, "up", 8)} />
    </>
  );
}

function Title({ children, size, lines = 2 }: { children: ReactNode; size: number; lines?: number }) {
  return (
    <div
      style={{
        fontFamily: COMIC_FONT,
        fontSize: size,
        lineHeight: 0.98,
        color: K.TITLE_FILL,
        WebkitTextStroke: `${Math.max(1.5, size / 28)}px ${K.INK}`,
        textShadow: `${size / 14}px ${size / 14}px 0 ${K.INK}`,
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
    </div>
  );
}

function CoverStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative flex shrink-0 items-stretch" style={{ background: K.PAPER_RAISED, borderTop: `4px solid ${K.INK}` }}>
      <div className="flex items-center justify-center px-2 text-center" style={{ background: K.RED, color: K.ON_LOUD, fontFamily: COMIC_FONT, fontSize: 15, lineHeight: 1, width: 64, borderRight: `4px solid ${K.INK}` }}>
        {label}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2">{children}</div>
    </div>
  );
}

function StripDrop({ drop, tag, detail, coins }: { drop: WrappedShareCardDropModel; tag: string; detail?: string | null; coins: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex shrink-0 items-center justify-center" style={{ width: 40, height: 40, border: `3px solid ${K.INK}`, background: K.YELLOW_TINT }}>
        <ItemIcon drop={drop} size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate" style={{ fontFamily: COMIC_FONT, fontSize: 12, lineHeight: 1, color: K.RED, letterSpacing: "0.04em" }}>{tag.toUpperCase()}</div>
        <div className="line-clamp-2 text-[14px] font-bold leading-tight">
          {drop.itemName}
          {drop.quantityLabel && <span className="ml-1 font-normal">{drop.quantityLabel}</span>}
        </div>
        {(drop.gpLabel || detail) && (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] leading-tight" style={{ color: K.INK_SUBTLE }}>
            {drop.gpLabel && <Gp label={drop.gpLabel} coins={coins} size={15} />}
            {detail && <span className="truncate">{detail}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** B's Title chips, used by both directions. */
function TitleChips({ titles }: { titles: { id: string; name: string }[] }) {
  if (titles.length === 0) return null;
  return (
    <div className="relative flex flex-wrap gap-1.5">
      {titles.map((t) => (
        <span key={t.id} style={{ fontFamily: COMIC_FONT, fontSize: 13, background: K.MAGENTA, color: K.ON_LOUD, border: `2px solid ${K.INK}`, padding: "1px 7px", letterSpacing: "0.03em" }}>
          ★ {t.name}
        </span>
      ))}
    </div>
  );
}

const dropLines = (c: WrappedPlayerCardModel): DropLine[] => {
  const out: DropLine[] = [];
  if (c.topDrop) out.push({ d: c.topDrop, tag: c.topDrop.isLuckiest ? "Top drop · Luckiest drop" : "Top drop", luck: c.topDrop.luckLabel });
  if (c.luckiestDrop) out.push({ d: c.luckiestDrop, tag: "Luckiest drop", luck: c.luckiestDrop.luckLabel });
  return out;
};

function CoverPlayer({ card, art, fitKey }: { card: WrappedPlayerCardModel; art: string | null; fitKey: string }) {
  const fit = useFit(fitKey, playerHas(card), "Player");
  const accent = hex(card.team?.color, K.BLUE);
  const small = [
    card.submissions && `${card.submissions.countLabel} submissions${card.submissions.comparisonLabel ? ` (${card.submissions.comparisonLabel})` : ""}`,
    fit.shows("achievements") && `${card.achievementsLabel} achievements`,
    fit.shows("ehb") && `${card.ehbLabel} EHB gained`,
  ].filter((s): s is string => !!s);
  const streak = fit.shows("driestStreak") ? card.driestStreak : null;
  const teamLine = [card.team?.name, card.partnerLabel].filter(Boolean).join(" · ");
  const drops = dropLines(card);
  return (
    <div ref={fit.ref} className="flex size-full flex-col overflow-hidden" style={{ background: K.PAPER_RAISED, padding: 12 }}>
      <div className="relative flex flex-1 flex-col" style={{ border: `4px solid ${K.INK}` }}>
        <CoverGround accent={accent} />
        <Masthead bingoName={card.bingoName} issue="PLAYER CARD" />
        <div className="relative flex flex-1 flex-col gap-3 px-4 pt-3 pb-4">
          {art && (
            <div className="absolute flex items-end justify-end" style={{ right: 0, bottom: 0, top: 30, width: "44%" }}>
              <Sticker src={art} style={{ maxHeight: "100%", maxWidth: "100%" }} />
            </div>
          )}
          {/* Like the Team card: a tag, then the name as the title, then one hero burst with its captions. */}
          <div className="relative flex flex-col items-start gap-2" style={{ maxWidth: art ? "66%" : "100%" }}>
            <div className="flex items-center gap-2">
              <Caption tilt={-3} size={14} fill={K.YELLOW}>
                Starring
              </Caption>
              {card.draftLabel && (
                <Caption size={12} fill={K.PAPER_RAISED} tilt={2}>
                  {card.draftLabel}
                </Caption>
              )}
            </div>
            <div className="flex min-w-0 max-w-full items-center gap-3">
              <Avatar url={card.avatarUrl} name={card.name} size={64} style={{ border: `4px solid ${K.INK}`, boxShadow: hard(3) }} />
              <div className="min-w-0">
                <Title size={50}>{card.name}</Title>
                {teamLine && (
                  <div className="truncate" style={{ fontFamily: COMIC_FONT, fontSize: 20, lineHeight: 1.1, letterSpacing: "0.02em", color: K.TITLE_FILL, WebkitTextStroke: `0.8px ${K.INK}`, textShadow: hard(2) }}>
                    {teamLine}
                  </div>
                )}
              </div>
            </div>
          </div>
          {(card.pointsShare || card.dropValueLabel) && (
            <div className="relative flex items-center gap-3">
              {card.pointsShare && (
                <Burst fill={K.YELLOW} size={148} rotate={-8}>
                  <span style={{ fontSize: 12 }}>POINTS SHARE</span>
                  <span style={{ fontSize: 36 }}>{card.pointsShare.shareLabel}</span>
                  {card.pointsShare.teamPercentLabel && <span style={{ fontSize: 12 }}>{card.pointsShare.teamPercentLabel}</span>}
                </Burst>
              )}
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                {card.pointsShare && (
                  <Caption size={20} fill={K.PAPER_RAISED} tilt={2}>
                    {card.pointsShare.teamRankLabel}
                  </Caption>
                )}
                {card.pointsShare?.bingoRankLabel && (
                  <Caption size={14} fill={K.CYAN_TINT} tilt={-1}>
                    {card.pointsShare.bingoRankLabel}
                  </Caption>
                )}
                {card.dropValueLabel && (
                  <Caption size={14} fill={K.YELLOW_TINT} tilt={1}>
                    <Gp label={card.dropValueLabel} coins={card.coinsIconUrl} size={16} /> drop value
                  </Caption>
                )}
              </div>
            </div>
          )}
          {(small.length > 0 || card.titles.length > 0) && (
            // Down at the foot of the cover, over the strip.
            <div className="relative mt-auto flex flex-col items-start gap-2">
              {small.length > 0 && (
                <Caption size={13} fill={K.PAPER_RAISED} style={{ maxWidth: art ? "66%" : "100%" }}>
                  {small.join(" · ")}
                </Caption>
              )}
              <TitleChips titles={card.titles} />
            </div>
          )}
        </div>
        {(drops.length > 0 || streak) && (
          <CoverStrip label="IN THIS ISSUE">
            {drops.length > 0 && (
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${drops.length}, minmax(0, 1fr))` }}>
                {drops.map(({ d, tag, luck }) => (
                  <StripDrop key={d.key} drop={d} coins={card.coinsIconUrl} tag={tag} detail={luck && `${luck} luck`} />
                ))}
              </div>
            )}
            {streak && (
              <div className="truncate text-[12px] leading-tight">
                <span style={{ fontFamily: COMIC_FONT, color: K.RED, letterSpacing: "0.04em" }}>DRIEST STREAK: </span>
                <b>{streak.killsLabel}</b> at {streak.boss} · only {streak.chanceLabel} go that dry
              </div>
            )}
          </CoverStrip>
        )}
      </div>
    </div>
  );
}

function CoverTeam({ card, art, fitKey }: { card: WrappedTeamCardModel; art: string | null; fitKey: string }) {
  const fit = useFit(fitKey, NONE, "Team");
  const accent = hex(card.color, K.BLUE);
  const place = splitPlacement(card.placementLabel);
  return (
    <div ref={fit.ref} className="flex size-full flex-col overflow-hidden" style={{ background: K.PAPER_RAISED, padding: 12 }}>
      <div className="relative flex flex-1 flex-col" style={{ border: `4px solid ${K.INK}` }}>
        <CoverGround accent={accent} />
        <Masthead bingoName={card.bingoName} issue="TEAM CARD" />
        <div className="relative flex flex-1 flex-col gap-3 px-4 pt-3 pb-4">
          {art && (
            <div className="absolute flex items-end justify-end" style={{ right: 0, bottom: 0, top: 30, width: "48%" }}>
              <Sticker src={art} style={{ maxHeight: "100%", maxWidth: "100%" }} />
            </div>
          )}
          <div className="relative flex flex-col items-start gap-2" style={{ maxWidth: art ? "66%" : "100%" }}>
            <Caption tilt={-3} size={14} fill={K.YELLOW}>
              The sensational
            </Caption>
            <Title size={44} lines={3}>
              {card.name}
            </Title>
          </div>
          <div className="relative flex items-center gap-3">
            <Burst fill={medalFill(card.placement)} size={148} rotate={-8}>
              <span style={{ fontSize: 50 }}>{place.big}</span>
              <span style={{ fontSize: 15 }}>{place.rest}</span>
            </Burst>
            <div className="flex flex-col items-start gap-1.5">
              <Caption size={20} fill={K.PAPER_RAISED} tilt={2}>
                {card.pointsLabel} points
              </Caption>
              <Caption size={14} fill={K.CYAN_TINT} tilt={-1}>
                {card.tilesCompleted} {card.tilesCompleted === 1 ? "tile" : "tiles"} · {card.linesCompleted} {card.linesCompleted === 1 ? "line" : "lines"}
              </Caption>
              {card.dropValueLabel && (
                <Caption size={14} fill={K.YELLOW_TINT} tilt={1}>
                  <Gp label={card.dropValueLabel} coins={card.coinsIconUrl} size={16} /> drop value
                </Caption>
              )}
            </div>
          </div>
          {card.mvp && (
            // Down at the foot of the cover, over the strip, as quiet as the Player card's stats line.
            <div className="relative mt-auto flex min-w-0 items-center gap-2 self-start" style={{ maxWidth: art ? "66%" : "100%" }}>
              <Caption size={13} fill={K.RED} tilt={-2} style={{ color: K.ON_LOUD, flexShrink: 0 }}>
                MVP
              </Caption>
              <Caption size={13} fill={K.PAPER_RAISED} style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <Avatar url={card.mvp.person.avatarUrl} name={card.mvp.person.name} size={20} style={{ border: `2px solid ${K.INK}` }} />
                <span className="truncate">
                  {card.mvp.person.name} · {card.mvp.shareLabel} Points share{card.mvp.teamPercentLabel && ` · ${card.mvp.teamPercentLabel}`}
                </span>
              </Caption>
            </div>
          )}
        </div>
        {(card.biggestDrop || card.superlatives.length > 0) && (
          <CoverStrip label="ALSO IN THIS ISSUE">
            {card.biggestDrop && <StripDrop drop={card.biggestDrop} coins={card.coinsIconUrl} tag="BIGGEST DROP" detail={card.biggestDrop.player?.name} />}
            {card.superlatives.map((s) => (
              <div key={s.category} className="flex min-w-0 items-center gap-2">
                <span className="flex shrink-0">
                  {s.winners.map((w, i) => (
                    <Avatar key={w.id} url={w.avatarUrl} name={w.name} size={24} style={{ marginLeft: i ? -8 : 0, border: `2px solid ${K.INK}` }} />
                  ))}
                </span>
                <span className="min-w-0 truncate text-[13px]">
                  <b>{s.winners.map((w) => w.name).join(" & ")}</b> · {s.category}
                </span>
              </div>
            ))}
          </CoverStrip>
        )}
      </div>
    </div>
  );
}

// ================================================================================================
// B. Panel page
// ================================================================================================

function Panel({ children, fill = K.PAPER_RAISED, style, className = "" }: { children?: ReactNode; fill?: string; style?: CSSProperties; className?: string }) {
  return (
    <div className={`relative min-w-0 ${className}`} style={{ border: `3px solid ${K.INK}`, background: fill, ...style }}>
      {children}
    </div>
  );
}

const speedLines = (ink = "rgb(11 11 13 / 0.08)"): CSSProperties => ({ backgroundImage: `repeating-linear-gradient(115deg, ${ink} 0 2px, transparent 2px 11px)` });

/** A panel with the Wrapped art as its subject (or the avatar, big, without any). */
function ArtPanel({ art, accent, fallback }: { art: string | null; accent: string; fallback: ReactNode }) {
  return (
    <Panel fill={accent} className="flex-[2] overflow-hidden" style={{ minHeight: 170 }}>
      <div className="absolute inset-0" style={halftone(INK_BLACK, "corner")} />
      <div className="absolute inset-0 flex items-end justify-center p-2">{art ? <Sticker src={art} style={{ maxHeight: "100%", maxWidth: "100%" }} /> : fallback}</div>
    </Panel>
  );
}

function PanelPlayer({ card, art, fitKey }: { card: WrappedPlayerCardModel; art: string | null; fitKey: string }) {
  const fit = useFit(fitKey, playerHas(card), "Player");
  const accent = hex(card.team?.color, K.BLUE);
  const small = [
    card.submissions && { label: "Submissions", value: card.submissions.countLabel, extra: card.submissions.comparisonLabel },
    fit.shows("achievements") && { label: "Achievements", value: card.achievementsLabel!, extra: null },
    fit.shows("ehb") && { label: "EHB gained", value: card.ehbLabel!, extra: null },
  ].filter((s): s is { label: string; value: string; extra: string | null } => !!s);
  const streak = fit.shows("driestStreak") ? card.driestStreak : null;
  const drops = dropLines(card);
  return (
    <div ref={fit.ref} className="flex size-full flex-col gap-2 overflow-hidden" style={{ background: K.PAPER_RAISED, padding: 12 }}>
      <Caption size={17} fill={K.YELLOW}>
        <span className="block truncate">Meanwhile, at {card.bingoName}…</span>
      </Caption>
      <div className="flex flex-1 gap-2">
        <Panel fill={`color-mix(in srgb, ${accent} 22%, ${K.PAPER_RAISED})`} className="flex flex-[3] flex-col justify-center gap-2 p-3" style={speedLines()}>
          <div className="flex min-w-0 items-center gap-3">
            <Avatar url={card.avatarUrl} name={card.name} size={60} style={{ border: `3px solid ${K.INK}` }} />
            <div className="min-w-0">
              <div style={{ fontFamily: COMIC_FONT, fontSize: 36, lineHeight: 1, overflowWrap: "anywhere" }}>{card.name}</div>
              {(card.team || card.partnerLabel) && <div className="truncate text-[13px] font-semibold">{[card.team?.name, card.partnerLabel].filter(Boolean).join(" · ")}</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[card.pointsShare?.teamRankLabel, card.pointsShare?.bingoRankLabel, card.draftLabel].filter(Boolean).map((b, i) => (
              <span key={b} style={{ fontFamily: COMIC_FONT, fontSize: 14, border: `2px solid ${K.INK}`, background: i === 0 ? K.YELLOW : K.PAPER_RAISED, padding: "1px 7px", letterSpacing: "0.03em" }}>
                {b}
              </span>
            ))}
          </div>
          <TitleChips titles={card.titles} />
        </Panel>
        <ArtPanel art={art} accent={accent} fallback={<Avatar url={card.avatarUrl} name={card.name} size={140} style={{ border: `4px solid ${K.INK}` }} />} />
      </div>
      {(card.pointsShare || card.dropValueLabel) && (
        <div className="flex gap-2">
          {card.pointsShare && (
            <Panel fill={K.CYAN_TINT} className="flex flex-1 items-center justify-center overflow-hidden py-1" style={halftone(INK_CYAN, "corner")}>
              <Caption size={12} style={{ position: "absolute", left: -3, top: -3, boxShadow: "none" }}>
                Points share
              </Caption>
              <Burst fill={K.YELLOW} size={132}>
                <span style={{ fontSize: 13 }}>POW!</span>
                <span style={{ fontSize: 32 }}>{card.pointsShare.shareLabel}</span>
                {card.pointsShare.teamPercentLabel && <span style={{ fontSize: 11 }}>{card.pointsShare.teamPercentLabel}</span>}
              </Burst>
            </Panel>
          )}
          {card.dropValueLabel && (
            <Panel fill={K.RED_TINT} className="flex flex-1 items-center justify-center overflow-hidden py-1" style={halftone(INK_MAGENTA, "corner")}>
              <Caption size={12} style={{ position: "absolute", left: -3, top: -3, boxShadow: "none" }}>
                Drop value
              </Caption>
              <Burst fill={K.PAPER_RAISED} size={128} spikes={12} rotate={7}>
                <span style={{ fontSize: 15 }}>KA-CHING!</span>
                <span className="mt-1">
                  <Gp label={card.dropValueLabel} coins={card.coinsIconUrl} size={26} />
                </span>
              </Burst>
            </Panel>
          )}
        </div>
      )}
      {small.length > 0 && (
        <div className="flex gap-2">
          {small.map((s) => (
            <Panel key={s.label} className="flex-1 px-2.5 py-1.5">
              <div style={{ fontFamily: COMIC_FONT, fontSize: 11, color: K.INK_SUBTLE, letterSpacing: "0.05em" }}>{s.label.toUpperCase()}</div>
              <div style={{ fontFamily: COMIC_FONT, fontSize: 28, lineHeight: 1 }}>
                {s.value}
                {s.extra && <span style={{ fontSize: 14, color: K.RED, marginLeft: 5 }}>{s.extra}</span>}
              </div>
            </Panel>
          ))}
        </div>
      )}
      {drops.length > 0 && (
        <div className="flex gap-2">
          {drops.map(({ d, tag, luck }, i) => (
            <DropPanel key={d.key} drop={d} tag={tag} detail={luck && `${luck} luck`} coins={card.coinsIconUrl} tint={i ? K.CYAN_TINT : K.YELLOW_TINT} ink={i ? INK_CYAN : INK_YELLOW} />
          ))}
        </div>
      )}
      {streak && (
        <Caption size={13} fill={K.YELLOW_TINT}>
          Driest streak: {streak.killsLabel} at {streak.boss}. Only {streak.chanceLabel} go that dry.
        </Caption>
      )}
    </div>
  );
}

/** A drop in its own panel: a corner caption, the item's icon in an inked box, its name, GP and `detail`. */
function DropPanel({ drop, tag, detail, coins, tint, ink }: { drop: WrappedShareCardDropModel; tag: string; detail?: ReactNode; coins: string; tint: string; ink: Ink }) {
  return (
    <Panel fill={tint} className="flex flex-1 items-center gap-2.5 overflow-hidden px-2.5 pt-6 pb-2" style={halftone(ink, "corner")}>
      <Caption size={12} style={{ position: "absolute", left: -3, top: -3, boxShadow: "none" }}>
        {tag}
      </Caption>
      <span className="flex shrink-0 items-center justify-center" style={{ width: 46, height: 46, border: `3px solid ${K.INK}`, background: K.PAPER_RAISED }}>
        <ItemIcon drop={drop} size={32} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="line-clamp-2 text-[14px] font-bold">
          {drop.itemName}
          {drop.quantityLabel && ` ${drop.quantityLabel}`}
        </div>
        {(drop.gpLabel || detail) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px]">
            {drop.gpLabel && <Gp label={drop.gpLabel} coins={coins} size={16} />}
            {detail && <span className="truncate font-semibold" style={{ color: K.MAGENTA }}>{detail}</span>}
          </div>
        )}
      </div>
    </Panel>
  );
}

function PanelTeam({ card, art, fitKey }: { card: WrappedTeamCardModel; art: string | null; fitKey: string }) {
  const fit = useFit(fitKey, NONE, "Team");
  const accent = hex(card.color, K.BLUE);
  const place = splitPlacement(card.placementLabel);
  const stats = [
    { label: card.tilesCompleted === 1 ? "Tile" : "Tiles", value: <>{card.tilesCompleted}</> },
    { label: card.linesCompleted === 1 ? "Line" : "Lines", value: <>{card.linesCompleted}</> },
    ...(card.dropValueLabel ? [{ label: "Drop value", value: <Gp label={card.dropValueLabel} coins={card.coinsIconUrl} size={26} /> }] : []),
  ];
  return (
    <div ref={fit.ref} className="flex size-full flex-col gap-2 overflow-hidden" style={{ background: K.PAPER_RAISED, padding: 12 }}>
      <Caption size={17} fill={K.YELLOW}>
        <span className="block truncate">Final standings · {card.bingoName}</span>
      </Caption>
      <div className="flex flex-1 gap-2">
        <Panel fill={`color-mix(in srgb, ${accent} 22%, ${K.PAPER_RAISED})`} className="flex flex-[3] flex-col justify-center gap-1 p-3" style={speedLines()}>
          <div style={{ fontFamily: COMIC_FONT, fontSize: 36, lineHeight: 1, overflowWrap: "anywhere" }}>{card.name}</div>
          <div className="flex items-center gap-2">
            <Burst fill={medalFill(card.placement)} size={118} rotate={-8}>
              <span style={{ fontSize: 40 }}>{place.big}</span>
              <span style={{ fontSize: 13 }}>{place.rest}</span>
            </Burst>
            <Caption size={20} tilt={2}>
              {card.pointsLabel} pts
            </Caption>
          </div>
        </Panel>
        <ArtPanel art={art} accent={accent} fallback={null} />
      </div>
      <div className="flex gap-2">
        {stats.map((s) => (
          <Panel key={s.label} className="flex-1 px-2.5 py-1.5">
            <div style={{ fontFamily: COMIC_FONT, fontSize: 11, color: K.INK_SUBTLE, letterSpacing: "0.05em" }}>{s.label.toUpperCase()}</div>
            <div style={{ fontFamily: COMIC_FONT, fontSize: 28, lineHeight: 1 }}>{s.value}</div>
          </Panel>
        ))}
      </div>
      {(card.mvp || card.biggestDrop) && (
        <div className="flex gap-2">
          {card.mvp && (
            <Panel fill={K.RED_TINT} className="flex flex-1 items-center gap-2.5 overflow-hidden px-2.5 pt-6 pb-2" style={halftone(INK_MAGENTA, "corner")}>
              <Caption size={12} fill={K.RED} style={{ position: "absolute", left: -3, top: -3, boxShadow: "none", color: K.ON_LOUD }}>
                MVP
              </Caption>
              <Avatar url={card.mvp.person.avatarUrl} name={card.mvp.person.name} size={46} style={{ border: `3px solid ${K.INK}` }} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate" style={{ fontFamily: COMIC_FONT, fontSize: 22, lineHeight: 1.05 }}>
                  {card.mvp.person.name}
                </div>
                <div className="truncate text-[12px] font-semibold">
                  {card.mvp.shareLabel} Points share{card.mvp.teamPercentLabel && ` · ${card.mvp.teamPercentLabel}`}
                </div>
              </div>
            </Panel>
          )}
          {card.biggestDrop && (
            <DropPanel drop={card.biggestDrop} tag="Biggest drop" detail={card.biggestDrop.player?.name} coins={card.coinsIconUrl} tint={K.YELLOW_TINT} ink={INK_YELLOW} />
          )}
        </div>
      )}
      {card.superlatives.length > 0 && (
        <Panel className="flex flex-col gap-1.5 px-2.5 py-2" style={speedLines("rgb(11 11 13 / 0.05)")}>
          {card.superlatives.map((s) => (
            <div key={s.category} className="flex min-w-0 items-center gap-2">
              <span className="flex shrink-0">
                {s.winners.map((w, i) => (
                  <Avatar key={w.id} url={w.avatarUrl} name={w.name} size={26} style={{ marginLeft: i ? -8 : 0, border: `2px solid ${K.INK}` }} />
                ))}
              </span>
              <span className="min-w-0 truncate text-[13px]">
                <b>{s.winners.map((w) => w.name).join(" & ")}</b>
              </span>
              <span className="ml-auto shrink-0" style={{ fontFamily: COMIC_FONT, fontSize: 12, background: K.CYAN_TINT, border: `2px solid ${K.INK}`, padding: "0 6px", maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.category}
              </span>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
