// PROTOTYPE (throwaway, #314) — what should the richer Player and Team share cards look like?
// Three layouts for the new card content, on the real Wrapped Outro, switchable via `?variant=A|B|C`, with
// `?fill=real|max|sparse|same` to push each through real data, everything at once, almost nothing, and a top drop that's
// also the luckiest. Fields left out to fit (streak → EHB → Achievements) are measured live and shown in the switcher.
// Team Drop value and the MVP's "% of Team" aren't stored yet, so they're mocked in every fill.
// Lives on branch prototype/314-share-cards only; nothing here is production code.

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useWrappedModel } from "../../../headless";
import type { WrappedPersonModel, WrappedPlayerCardModel, WrappedShareCardDropModel, WrappedShareCardModel, WrappedTeamCardModel } from "../../../headless/types";
import { wikiIconUrl } from "../../../api/wikiIcons";
import { CardImage } from "../../../core/wrapped/ShareCards";

export const VARIANTS = ["A", "B", "C"];
export const VARIANT_NAMES: Record<string, string> = { A: "Stacked, current look", B: "Bento tiles", C: "Hero + ledger" };
export const FILLS = ["real", "max", "sparse", "same"];

// ---------- the new card content ----------

type PDrop = WrappedShareCardDropModel & { luckLabel: string | null };

export interface ProtoPlayerCard {
  kind: "player";
  key: string;
  label: string;
  bingoName: string;
  siteLabel: string;
  fileName: string;
  name: string;
  avatarUrl: string;
  team: { name: string; color: string | null } | null;
  partnerLabel: string | null;
  /** "Pick #7 · Round 2" or "Captain". */
  draftLabel: string | null;
  teamRankLabel: string | null;
  bingoRankLabel: string | null;
  shareLabel: string | null;
  /** "34% of Team" / "<1% of Team". */
  teamPercentLabel: string | null;
  dropValueLabel: string | null;
  submissions: { countLabel: string; vsAvgLabel: string | null } | null;
  achievementsLabel: string | null;
  ehbLabel: string | null;
  titles: { id: string; name: string }[];
  topDrop: PDrop | null;
  luckiestDrop: PDrop | null;
  sameDrop: boolean;
  driestStreak: { boss: string; killsLabel: string; chanceLabel: string } | null;
}

export interface ProtoTeamCard {
  kind: "team";
  key: string;
  label: string;
  bingoName: string;
  siteLabel: string;
  fileName: string;
  name: string;
  color: string | null;
  placement: number;
  placementLabel: string;
  pointsLabel: string;
  tilesCompleted: number;
  linesCompleted: number;
  dropValueLabel: string | null;
  mvp: { person: WrappedPersonModel; shareLabel: string; teamPercentLabel: string } | null;
  biggestDrop: (WrappedShareCardDropModel & { player: WrappedPersonModel | null }) | null;
  superlatives: { category: string; winners: WrappedPersonModel[] }[];
}

type ProtoCard = ProtoPlayerCard | ProtoTeamCard;

const icon = (name: string) => wikiIconUrl(name) ?? null;
const drop = (key: string, itemName: string, gpLabel: string | null, luckLabel: string | null, quantityLabel: string | null = null): PDrop => ({
  key,
  itemName,
  iconUrl: icon(itemName),
  quantityLabel,
  gpLabel,
  luckLabel,
});

/** The Outro's cards rebuilt with #314's content, from the real story plus the chosen fill. No Bingo card. */
export function usePrototypeCards(cards: WrappedShareCardModel[], variant: string, fill: string): WrappedShareCardModel[] {
  const wrapped = useWrappedModel();
  const find = <K extends string>(kind: K) => wrapped.sections.find((s) => s.section.kind === kind)?.section;
  const you = find("you");
  const team = find("team");
  const isCaptain = !!find("captain");
  const player = cards.find((c): c is WrappedPlayerCardModel => c.kind === "player");
  const teamCard = cards.find((c): c is WrappedTeamCardModel => c.kind === "team");
  const y = you?.kind === "you" ? you : null;
  const t = team?.kind === "team" ? team : null;
  const out: ProtoCard[] = [];
  const suffix = `${variant}-${fill}`;

  if (player) {
    const ranks = player.pointsShare?.rankLabel.match(/^(?:#(\d+) of (\d+) · )?#(\d+) of (\d+) on Team$/);
    const pick = y?.draft ? Number(y.draft.pickLabel.replace(/\D/g, "")) : null;
    const teamCount = t?.teamCount ?? 1;
    const pct = y?.points?.teamPercentLabel?.match(/^(\S+%)/)?.[1];
    const top = player.topDrops[0] ? { ...player.topDrops[0], luckLabel: null } : null;
    const lucky = y?.luckiestDrop ? drop("lucky", y.luckiestDrop.itemName, y.luckiestDrop.gpLabel, y.luckiestDrop.luck?.chanceLabel ?? null, y.luckiestDrop.quantityLabel) : null;
    const same = !!top && !!lucky && top.itemName === lucky.itemName && top.gpLabel === lucky.gpLabel;
    const real: ProtoPlayerCard = {
      kind: "player",
      key: `player-${suffix}`,
      label: player.label,
      bingoName: player.bingoName,
      siteLabel: player.siteLabel,
      fileName: player.fileName,
      name: player.name,
      avatarUrl: player.avatarUrl,
      team: player.team,
      partnerLabel: player.partnerLabel,
      draftLabel: isCaptain ? "Captain" : pick ? `Pick #${pick} · Round ${Math.ceil(pick / teamCount)}` : null,
      teamRankLabel: ranks ? `Team #${ranks[3]} of ${ranks[4]}` : null,
      bingoRankLabel: ranks?.[1] ? `Bingo #${ranks[1]} of ${ranks[2]}` : null,
      shareLabel: player.pointsShare?.shareLabel ?? null,
      teamPercentLabel: pct ? `${pct} of Team` : player.pointsShare ? "<1% of Team" : null,
      dropValueLabel: player.dropValueLabel,
      submissions: y?.submissions
        ? { countLabel: y.submissions.countLabel.replace(/\D+$/, "").trim(), vsAvgLabel: y.submissions.comparison?.replace(" the average Player", " avg") ?? null }
        : null,
      achievementsLabel: y && y.achievements.length > 0 ? y.achievements.length.toLocaleString() : null,
      ehbLabel: y?.wom ? y.wom.ehbLabel : null,
      titles: (y?.titles ?? []).slice(0, 3).map((x) => ({ id: x.id, name: x.name })),
      topDrop: same ? { ...top!, luckLabel: lucky!.luckLabel } : top,
      luckiestDrop: same ? null : lucky,
      sameDrop: same,
      driestStreak: player.driestStreak,
    };
    const long = "Absolutely Enormous Clan Name";
    const card: ProtoPlayerCard =
      fill === "max"
        ? {
            ...real,
            bingoName: "Tectonic Summer Bingo 2026: Return of the Dry Streaks",
            name: real.name.length > 11 ? real.name : "Iron Zezima99",
            team: { name: long, color: real.team?.color ?? "#8b5cf6" },
            partnerLabel: "with Lord Dryness",
            draftLabel: "Pick #13 · Round 4",
            teamRankLabel: "Team #1 of 12",
            bingoRankLabel: "Bingo #3 of 142",
            shareLabel: "18.75",
            teamPercentLabel: "34% of Team",
            dropValueLabel: "1.24b",
            submissions: { countLabel: "1,148", vsAvgLabel: "12.1× avg" },
            achievementsLabel: "12",
            ehbLabel: "312.4",
            titles: [
              { id: "t1", name: "The Most Consistent Grinder" },
              { id: "t2", name: "Raid Enjoyer" },
              { id: "t3", name: "Certified Spooned" },
              { id: "t4", name: "Should never appear (4th)" },
            ].slice(0, 3),
            topDrop: drop("top", "Tumeken's shadow (uncharged)", "1.21b", null),
            luckiestDrop: drop("lucky", "Pet snakeling", null, "1 in 5,000"),
            sameDrop: false,
            driestStreak: { boss: "Phantom Muspah", killsLabel: "1,191 kills", chanceLabel: "1 in 30" },
          }
        : fill === "sparse"
          ? {
              ...real,
              partnerLabel: null,
              draftLabel: null,
              bingoRankLabel: null,
              teamRankLabel: "Team #7 of 8",
              shareLabel: "0.25",
              teamPercentLabel: "<1% of Team",
              dropValueLabel: null,
              submissions: { countLabel: "2", vsAvgLabel: null },
              achievementsLabel: null,
              ehbLabel: null,
              titles: [],
              topDrop: null,
              luckiestDrop: null,
              sameDrop: false,
              driestStreak: null,
            }
          : fill === "same"
            ? {
                ...real,
                draftLabel: "Captain",
                topDrop: drop("top", "Twisted bow", "1.45b", "1 in 312"),
                luckiestDrop: null,
                sameDrop: true,
              }
            : real;
    out.push(card);
  }

  if (teamCard) {
    const people = [...(t?.superlatives.flatMap((s) => s.winners) ?? []), ...(t?.mvp ? [t.mvp.person] : [])];
    const p = (i: number, name: string): WrappedPersonModel => ({ id: `p${i}`, name, avatarUrl: people[i % Math.max(1, people.length)]?.avatarUrl ?? "", isYou: false });
    const real: ProtoTeamCard = {
      kind: "team",
      key: `team-${suffix}`,
      label: teamCard.label,
      bingoName: teamCard.bingoName,
      siteLabel: teamCard.siteLabel,
      fileName: teamCard.fileName,
      name: teamCard.name,
      color: teamCard.color,
      placement: teamCard.placement,
      placementLabel: teamCard.placementLabel,
      pointsLabel: teamCard.pointsLabel,
      tilesCompleted: teamCard.tilesCompleted,
      linesCompleted: teamCard.linesCompleted,
      dropValueLabel: "3.42b", // mocked: not stored yet
      mvp: teamCard.mvp ? { ...teamCard.mvp, teamPercentLabel: "27% of Team" } : null, // % mocked
      biggestDrop: teamCard.biggestDrop,
      superlatives: (t?.superlatives ?? []).filter((s) => s.winners.length > 0).slice(0, 3),
    };
    const card: ProtoTeamCard =
      fill === "max"
        ? {
            ...real,
            name: "Absolutely Enormous Clan Name of Destiny",
            placement: 1,
            placementLabel: "1st of 12",
            pointsLabel: "12,480",
            tilesCompleted: 48,
            linesCompleted: 11,
            dropValueLabel: "14.8b",
            mvp: { person: p(0, "Iron Zezima99"), shareLabel: "18.75", teamPercentLabel: "34% of Team" },
            biggestDrop: { ...drop("big", "Tumeken's shadow (uncharged)", "1.21b", null), player: p(1, "Lord Dryness") },
            superlatives: [
              { category: "Most likely to go dry on purpose", winners: [p(0, "Iron Zezima99"), p(1, "Lord Dryness")] },
              { category: "Team Mom", winners: [p(2, "Sir Spoons-a-lot the Third")] },
              { category: "Biggest yapper", winners: [p(3, "Yappington"), p(4, "B0aty"), p(5, "Mr Mammal")] },
              { category: "4th category (hidden)", winners: [p(6, "Nobody")] },
              { category: "5th category (hidden)", winners: [p(7, "Nobody")] },
            ].slice(0, 3),
          }
        : fill === "sparse"
          ? { ...real, placement: 7, placementLabel: "7th of 8", pointsLabel: "40", tilesCompleted: 1, linesCompleted: 0, dropValueLabel: null, biggestDrop: null, superlatives: [] }
          : fill === "same"
            ? { ...real, superlatives: [{ category: "Team MVP", winners: [p(0, "Solo Winner")] }] }
            : real;
    out.push(card);
  }
  // The Card slot is typed for the real models; the prototype's own Card reads these.
  return out as unknown as WrappedShareCardModel[];
}

// ---------- what each card had to leave out, for the switcher ----------

let leftOut: Record<string, string> = {};
const listeners = new Set<() => void>();
const reportLeftOut = (key: string, text: string) => {
  if (leftOut[key] === text) return;
  leftOut = { ...leftOut, [key]: text };
  listeners.forEach((l) => l());
};
export function useLeftOutNote(): string {
  const snap = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => leftOut,
  );
  return Object.entries(snap)
    .map(([k, v]) => `${k.split("-")[0]}: ${v}`)
    .join(" · ");
}

/** Leaves the player card's optional fields out, streak → EHB → Achievements, until its body stops overflowing. */
const FIT_ORDER = ["streak", "ehb", "achievements"] as const;
type Fit = (typeof FIT_ORDER)[number];
function useFit(key: string, present: Record<Fit, boolean>) {
  const ref = useRef<HTMLDivElement>(null);
  const [dropped, setDropped] = useState(0);
  const cut = FIT_ORDER.filter((f) => present[f]).slice(0, dropped);
  const available = FIT_ORDER.filter((f) => present[f]).length;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const over = el.scrollHeight > el.clientHeight + 1;
    if (over && dropped < available) setDropped((d) => d + 1);
    else reportLeftOut(key, `${cut.length ? `left out ${cut.join(", ")}` : "everything fits"}${over ? " — STILL OVERFLOWS" : ""}`);
  });
  return { ref, show: (f: Fit) => present[f] && !cut.includes(f) };
}
function useTeamOverflow(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) reportLeftOut(key, el.scrollHeight > el.clientHeight + 1 ? "STILL OVERFLOWS" : "fits");
  });
  return ref;
}

// ---------- shared bits (the default theme's look) ----------

const C = { bg: "#09090b", surface: "#141417", outline: "#26262b", fg: "#fafafa", muted: "#a1a1aa", subtle: "#71717a", gold: "#fbbf24", silver: "#cbd5e1", bronze: "#d97706", neutral: "#52525b" };
const medal = (n: number) => (n === 1 ? C.gold : n === 2 ? C.silver : n === 3 ? C.bronze : C.fg);
const COINS = wikiIconUrl("Coins 10000")!;

export function PrototypeShareCard({ card, variant }: { card: WrappedShareCardModel; variant: string }) {
  const c = card as unknown as ProtoCard;
  if (c.kind === "player") return variant === "B" ? <PlayerB card={c} /> : variant === "C" ? <PlayerC card={c} /> : <PlayerA card={c} />;
  return variant === "B" ? <TeamB card={c} /> : variant === "C" ? <TeamC card={c} /> : <TeamA card={c} />;
}

/** A GP figure with the Coins icon, sized to it; without the icon if it doesn't load. */
function Gp({ label, size, color = C.gold, className = "" }: { label: string; size: number; color?: string; className?: string }) {
  return (
    <span className={`num inline-flex items-center font-black leading-none ${className}`} style={{ fontSize: size, color, gap: size * 0.18 }}>
      <CardImage src={COINS} className="shrink-0 object-contain [image-rendering:pixelated]" style={{ width: size * 0.95, height: size * 0.95 }} />
      {label}
    </span>
  );
}

function Label({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${className}`} style={{ color: C.subtle, ...style }}>
      {children}
    </p>
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

function ItemTile({ drop, size = 44 }: { drop: WrappedShareCardDropModel; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-lg border" style={{ width: size, height: size, backgroundColor: C.surface, borderColor: C.outline }}>
      <CardImage src={drop.iconUrl} className="object-contain [image-rendering:pixelated]" style={{ width: size * 0.73, height: size * 0.73 }} />
    </span>
  );
}

function Frame({ accent, children, bodyRef, kicker }: { accent: string | null; children: ReactNode; bodyRef?: React.Ref<HTMLDivElement>; kicker?: ReactNode }) {
  const glow = accent ?? C.neutral;
  return (
    <div
      className="flex size-full flex-col px-9 pt-8 pb-8"
      style={{ backgroundColor: C.bg, backgroundImage: `radial-gradient(120% 55% at 50% 0%, color-mix(in srgb, ${glow} 35%, transparent) 0%, color-mix(in srgb, ${glow} 10%, transparent) 45%, transparent 75%)`, color: C.fg, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="h-1.5 w-16 shrink-0 rounded-full" style={{ backgroundColor: glow }} />
      {kicker}
      <div ref={bodyRef} className="-mx-2 flex min-h-0 flex-1 flex-col justify-between gap-5 overflow-hidden px-2 pt-4">
        {children}
      </div>
    </div>
  );
}

const Kicker = ({ children }: { children: ReactNode }) => (
  <p className="mt-4 line-clamp-1 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: C.muted }}>
    {children}
  </p>
);

const facts = (card: ProtoPlayerCard) => [card.team?.name, card.partnerLabel, card.draftLabel].filter(Boolean).join(" · ");

function Titles({ titles, size = 13 }: { titles: { id: string; name: string }[]; size?: number }) {
  if (!titles.length) return null;
  // Wraps rather than cutting any off: at most 3, so at most two lines.
  return (
    <div className="flex flex-wrap gap-2">
      {titles.map((t) => (
        <span key={t.id} className="rounded-full border px-3 py-1 font-semibold" style={{ fontSize: size, borderColor: C.outline, backgroundColor: C.surface }}>
          {t.name}
        </span>
      ))}
    </div>
  );
}

// ---------- Variant A: stacked, the current card extended ----------

function PlayerA({ card }: { card: ProtoPlayerCard }) {
  const accent = card.team?.color ?? null;
  const fit = useFit(card.key, { streak: !!card.driestStreak, ehb: !!card.ehbLabel, achievements: !!card.achievementsLabel });
  const minor = [
    card.submissions && { label: "Submissions", value: card.submissions.countLabel, extra: card.submissions.vsAvgLabel },
    fit.show("achievements") && { label: "Achievements", value: card.achievementsLabel!, extra: null },
    fit.show("ehb") && { label: "EHB gained", value: card.ehbLabel!, extra: null },
  ].filter((m): m is { label: string; value: string; extra: string | null } => !!m);
  return (
    <Frame accent={accent} bodyRef={fit.ref} kicker={<Kicker>{card.bingoName}</Kicker>}>
      <div>
        <div className="flex items-center gap-5">
          <Avatar url={card.avatarUrl} name={card.name} size={68} ring={accent} />
          <div className="min-w-0">
            <h2 className="truncate text-[34px] font-black leading-[1.1] tracking-tight">{card.name}</h2>
            {facts(card) && (
              <p className="mt-1 flex min-w-0 items-center gap-2 text-[14px]" style={{ color: C.muted }}>
                {card.team?.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: card.team.color }} />}
                <span className="truncate">{facts(card)}</span>
              </p>
            )}
          </div>
        </div>
        {(card.teamRankLabel || card.bingoRankLabel) && (
          <div className="mt-4 flex gap-2">
            {[card.teamRankLabel, card.bingoRankLabel].filter(Boolean).map((r) => (
              <span key={r} className="num rounded-md border px-2.5 py-1 text-[13px] font-bold" style={{ borderColor: C.outline, backgroundColor: C.surface }}>
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="grid grid-cols-2 gap-6">
          {card.shareLabel && (
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="num text-[44px] font-black leading-none tracking-tight">{card.shareLabel}</span>
                <span className="num text-[14px] font-semibold" style={{ color: C.muted }}>
                  {card.teamPercentLabel}
                </span>
              </div>
              <Label className="mt-2">Points share</Label>
            </div>
          )}
          {card.dropValueLabel && (
            <div className="min-w-0">
              <Gp label={card.dropValueLabel} size={44} className="tracking-tight" />
              <Label className="mt-2">Drop value</Label>
            </div>
          )}
        </div>
        {minor.length > 0 && (
          <div className="mt-4 flex gap-7">
            {minor.map((m) => (
              <div key={m.label}>
                <p className="num text-[20px] font-black leading-none">
                  {m.value}
                  {m.extra && (
                    <span className="ml-1.5 text-[13px] font-semibold" style={{ color: C.muted }}>
                      {m.extra}
                    </span>
                  )}
                </p>
                <Label className="mt-1.5">{m.label}</Label>
              </div>
            ))}
          </div>
        )}
        {card.titles.length > 0 && (
          <div className="mt-4">
            <Titles titles={card.titles} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {card.topDrop && <DropLine drop={card.topDrop} tag={card.sameDrop ? "Top drop · Luckiest drop" : "Top drop"} />}
        {card.luckiestDrop && <DropLine drop={card.luckiestDrop} tag="Luckiest drop" />}
        {fit.show("streak") && card.driestStreak && (
          <div>
            <Label>Driest streak</Label>
            <p className="mt-1 text-[14px]">
              <span className="num font-bold">{card.driestStreak.killsLabel}</span> at {card.driestStreak.boss}
              <span style={{ color: C.muted }}>
                {" "}
                · only <span className="num">{card.driestStreak.chanceLabel}</span> go that dry
              </span>
            </p>
          </div>
        )}
      </div>
    </Frame>
  );
}

function DropLine({ drop, tag }: { drop: PDrop; tag: string }) {
  return (
    <div>
      <Label className="mb-1.5">{tag}</Label>
      <div className="flex min-w-0 items-center gap-3">
        <ItemTile drop={drop} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-tight">
            {drop.itemName}
            {drop.quantityLabel && <span className="num ml-1.5 font-normal" style={{ color: C.muted }}>{drop.quantityLabel}</span>}
          </p>
          {drop.luckLabel && (
            <p className="num mt-0.5 text-[13px] leading-tight" style={{ color: C.muted }}>
              <span className="font-semibold" style={{ color: C.gold }}>{drop.luckLabel}</span> luck
            </p>
          )}
        </div>
        {drop.gpLabel && <Gp label={drop.gpLabel} size={18} />}
      </div>
    </div>
  );
}

function TeamA({ card }: { card: ProtoTeamCard }) {
  const ref = useTeamOverflow(card.key);
  const stats = [
    { value: card.tilesCompleted.toLocaleString(), label: card.tilesCompleted === 1 ? "Tile" : "Tiles" },
    { value: card.linesCompleted.toLocaleString(), label: card.linesCompleted === 1 ? "Line" : "Lines" },
  ];
  return (
    <Frame accent={card.color} bodyRef={ref} kicker={<Kicker>{card.bingoName}</Kicker>}>
      <div>
        <h2 className="line-clamp-2 text-[38px] font-black leading-[1.05] tracking-tight">{card.name}</h2>
        <div className="mt-3 flex items-baseline gap-4">
          <span className="num text-[64px] font-black leading-none tracking-tight" style={{ color: medal(card.placement) }}>
            {card.placementLabel}
          </span>
          <span className="text-[15px]" style={{ color: C.muted }}>
            <span className="num font-semibold" style={{ color: C.fg }}>{card.pointsLabel}</span> points
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-5">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="num text-[34px] font-black leading-none">{s.value}</div>
            <Label className="mt-2">{s.label}</Label>
          </div>
        ))}
        {card.dropValueLabel && (
          <div>
            <Gp label={card.dropValueLabel} size={34} />
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
                  {card.mvp.shareLabel} Points share · {card.mvp.teamPercentLabel}
                </span>
              </p>
            </div>
          </div>
        )}
        {card.biggestDrop && (
          <div>
            <Label className="mb-1.5">Biggest drop</Label>
            <div className="flex min-w-0 items-center gap-3">
              <ItemTile drop={card.biggestDrop} size={36} />
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                {card.biggestDrop.itemName}
                {card.biggestDrop.player && <span className="ml-2 font-normal" style={{ color: C.muted }}>{card.biggestDrop.player.name}</span>}
              </p>
              {card.biggestDrop.gpLabel && <Gp label={card.biggestDrop.gpLabel} size={17} />}
            </div>
          </div>
        )}
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

// ---------- Variant B: bento tiles ----------

function Cell({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${className}`} style={{ backgroundColor: "rgb(20 20 23 / 0.85)", borderColor: C.outline, ...style }}>
      {children}
    </div>
  );
}

function PlayerB({ card }: { card: ProtoPlayerCard }) {
  const accent = card.team?.color ?? null;
  const fit = useFit(card.key, { streak: !!card.driestStreak, ehb: !!card.ehbLabel, achievements: !!card.achievementsLabel });
  const small = [
    card.submissions && { label: "Submissions", value: card.submissions.countLabel, extra: card.submissions.vsAvgLabel },
    fit.show("achievements") && { label: "Achievements", value: card.achievementsLabel!, extra: null },
    fit.show("ehb") && { label: "EHB", value: card.ehbLabel!, extra: null },
  ].filter((m): m is { label: string; value: string; extra: string | null } => !!m);
  return (
    <Frame accent={accent} bodyRef={fit.ref}>
      <div className="flex items-center gap-4">
        <Avatar url={card.avatarUrl} name={card.name} size={60} ring={accent} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: C.muted }}>
            {card.bingoName}
          </p>
          <h2 className="truncate text-[30px] font-black leading-[1.1] tracking-tight">{card.name}</h2>
          {facts(card) && (
            <p className="truncate text-[13px]" style={{ color: C.muted }}>
              {facts(card)}
            </p>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-6 content-start gap-2.5">
        {card.shareLabel && (
          <Cell className="col-span-3 row-span-2 flex flex-col justify-between">
            <Label>Points share</Label>
            <div>
              <div className="num text-[52px] font-black leading-none tracking-tight">{card.shareLabel}</div>
              <p className="num mt-1 text-[14px] font-semibold" style={{ color: accent ?? C.muted }}>
                {card.teamPercentLabel}
              </p>
            </div>
          </Cell>
        )}
        {[card.teamRankLabel, card.bingoRankLabel].filter(Boolean).map((r) => {
          const [scope, rest] = r!.split(" #");
          return (
            <Cell key={r} className={`${card.bingoRankLabel && card.teamRankLabel ? "col-span-3" : "col-span-3 row-span-2 flex flex-col justify-center"}`}>
              <Label>{scope} rank</Label>
              <p className="num mt-1 text-[22px] font-black leading-none">#{rest}</p>
            </Cell>
          );
        })}
        {card.dropValueLabel && (
          <Cell className="col-span-3">
            <Label>Drop value</Label>
            <Gp label={card.dropValueLabel} size={28} className="mt-1.5" />
          </Cell>
        )}
        {card.draftLabel && (
          <Cell className="col-span-3">
            <Label>Draft</Label>
            <p className="num mt-1.5 truncate text-[18px] font-black leading-tight">{card.draftLabel}</p>
          </Cell>
        )}
        {small.map((m) => (
          <Cell key={m.label} className={small.length === 1 ? "col-span-6" : small.length === 2 ? "col-span-3" : "col-span-2"}>
            <Label>{m.label}</Label>
            <p className="num mt-1.5 text-[20px] font-black leading-none">{m.value}</p>
            {m.extra && <p className="num mt-1 text-[11px] font-semibold" style={{ color: C.muted }}>{m.extra}</p>}
          </Cell>
        ))}
        {card.topDrop && <DropCell drop={card.topDrop} tag={card.sameDrop ? "Top & luckiest" : "Top drop"} wide={!card.luckiestDrop} />}
        {card.luckiestDrop && <DropCell drop={card.luckiestDrop} tag="Luckiest drop" wide={!card.topDrop} />}
        {fit.show("streak") && card.driestStreak && (
          <Cell className="col-span-6">
            <p className="text-[13px]">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: C.subtle }}>Driest</span>
              <span className="num font-bold">{card.driestStreak.killsLabel}</span> at {card.driestStreak.boss}
              <span style={{ color: C.muted }}> · only {card.driestStreak.chanceLabel} go that dry</span>
            </p>
          </Cell>
        )}
      </div>
      <Titles titles={card.titles} size={12} />
    </Frame>
  );
}

function DropCell({ drop, tag, wide }: { drop: PDrop; tag: string; wide: boolean }) {
  return (
    <Cell className={`${wide ? "col-span-6" : "col-span-3"} flex items-center gap-3`}>
      <ItemTile drop={drop} size={48} />
      <div className="min-w-0 flex-1">
        <Label>{tag}</Label>
        <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-tight">{drop.itemName}</p>
        <div className="mt-1 flex items-center gap-2">
          {drop.gpLabel && <Gp label={drop.gpLabel} size={14} />}
          {drop.luckLabel && <span className="num text-[12px] font-bold" style={{ color: C.gold }}>{drop.luckLabel}</span>}
        </div>
      </div>
    </Cell>
  );
}

function TeamB({ card }: { card: ProtoTeamCard }) {
  const ref = useTeamOverflow(card.key);
  return (
    <Frame accent={card.color} bodyRef={ref}>
      <div>
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: C.muted }}>
          {card.bingoName}
        </p>
        <h2 className="mt-1 line-clamp-2 text-[34px] font-black leading-[1.05] tracking-tight">{card.name}</h2>
      </div>
      <div className="grid flex-1 grid-cols-6 content-start gap-2.5">
        <Cell className="col-span-3 row-span-2 flex flex-col justify-between">
          <Label>Finished</Label>
          <div>
            <div className="num text-[48px] font-black leading-none tracking-tight" style={{ color: medal(card.placement) }}>
              {card.placementLabel.split(" of ")[0]}
            </div>
            <p className="num mt-1 text-[13px]" style={{ color: C.muted }}>
              of {card.placementLabel.split(" of ")[1]} · <span style={{ color: C.fg }}>{card.pointsLabel}</span> pts
            </p>
          </div>
        </Cell>
        <Cell className="col-span-3">
          <Label>Drop value</Label>
          {card.dropValueLabel ? <Gp label={card.dropValueLabel} size={26} className="mt-1.5" /> : <p className="mt-1.5 text-[20px] font-black" style={{ color: C.subtle }}>—</p>}
        </Cell>
        <Cell className="col-span-3 flex gap-6">
          <div>
            <Label>Tiles</Label>
            <p className="num mt-1.5 text-[22px] font-black leading-none">{card.tilesCompleted}</p>
          </div>
          <div>
            <Label>Lines</Label>
            <p className="num mt-1.5 text-[22px] font-black leading-none">{card.linesCompleted}</p>
          </div>
        </Cell>
        {card.mvp && (
          <Cell className={`${card.biggestDrop ? "col-span-3" : "col-span-6"} flex items-center gap-3`}>
            <Avatar url={card.mvp.person.avatarUrl} name={card.mvp.person.name} size={40} />
            <div className="min-w-0">
              <Label>MVP</Label>
              <p className="truncate text-[15px] font-bold leading-tight">{card.mvp.person.name}</p>
              <p className="num truncate text-[11px]" style={{ color: C.muted }}>
                {card.mvp.shareLabel} · {card.mvp.teamPercentLabel}
              </p>
            </div>
          </Cell>
        )}
        {card.biggestDrop && (
          <Cell className={`${card.mvp ? "col-span-3" : "col-span-6"} flex items-center gap-3`}>
            <ItemTile drop={card.biggestDrop} size={40} />
            <div className="min-w-0">
              <Label>Biggest drop</Label>
              <p className="truncate text-[13px] font-semibold leading-tight">{card.biggestDrop.itemName}</p>
              {card.biggestDrop.gpLabel && <Gp label={card.biggestDrop.gpLabel} size={13} />}
            </div>
          </Cell>
        )}
        {card.superlatives.map((s) => (
          <Cell key={s.category} className={`${card.superlatives.length === 1 ? "col-span-6" : card.superlatives.length === 2 ? "col-span-3" : "col-span-2"} flex flex-col items-center text-center`}>
            <p className="line-clamp-2 min-h-[2lh] text-[10px] font-semibold uppercase leading-snug tracking-[0.12em]" style={{ color: C.subtle }}>
              {s.category}
            </p>
            <div className="mt-2">
              <Avatars people={s.winners} size={34} />
            </div>
            <p className="mt-1.5 line-clamp-2 text-[12px] font-bold leading-tight">{s.winners.map((w) => w.name).join(" & ")}</p>
          </Cell>
        ))}
      </div>
    </Frame>
  );
}

// ---------- Variant C: one hero number, then a ledger ----------

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-t py-2" style={{ borderColor: C.outline }}>
      <Label className="shrink-0">{label}</Label>
      <div className="flex min-w-0 items-center justify-end gap-2 text-right text-[15px] font-semibold">{children}</div>
    </div>
  );
}

function PlayerC({ card }: { card: ProtoPlayerCard }) {
  const accent = card.team?.color ?? null;
  const fit = useFit(card.key, { streak: !!card.driestStreak, ehb: !!card.ehbLabel, achievements: !!card.achievementsLabel });
  const ranks = [card.teamRankLabel, card.bingoRankLabel].filter(Boolean).join("   ·   ");
  return (
    <Frame accent={accent} bodyRef={fit.ref}>
      <div className="flex items-center gap-3">
        <Avatar url={card.avatarUrl} name={card.name} size={44} ring={accent} />
        <div className="min-w-0">
          <h2 className="truncate text-[22px] font-black leading-tight">{card.name}</h2>
          <p className="truncate text-[12px]" style={{ color: C.muted }}>
            {card.bingoName}
          </p>
        </div>
      </div>

      <div className="text-center">
        <Label>Points share</Label>
        <div className="num mt-1 text-[88px] font-black leading-none tracking-tighter">{card.shareLabel ?? "0"}</div>
        {card.teamPercentLabel && (
          <p className="num mt-1 text-[16px] font-bold" style={{ color: accent ?? C.fg }}>
            {card.teamPercentLabel}
          </p>
        )}
        {ranks && (
          <p className="num mt-2 whitespace-pre text-[13px] font-semibold" style={{ color: C.muted }}>
            {ranks}
          </p>
        )}
      </div>

      <div>
        {facts(card) && (
          <Row label="Team">
            {card.team?.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: card.team.color }} />}
            <span className="truncate">{facts(card)}</span>
          </Row>
        )}
        {card.dropValueLabel && (
          <Row label="Drop value">
            <Gp label={card.dropValueLabel} size={16} />
          </Row>
        )}
        {card.submissions && (
          <Row label="Submissions">
            <span className="num">{card.submissions.countLabel}</span>
            {card.submissions.vsAvgLabel && <span className="num font-normal" style={{ color: C.muted }}>{card.submissions.vsAvgLabel}</span>}
          </Row>
        )}
        {fit.show("achievements") && (
          <Row label="Achievements">
            <span className="num">{card.achievementsLabel}</span>
          </Row>
        )}
        {fit.show("ehb") && (
          <Row label="EHB gained">
            <span className="num">{card.ehbLabel}</span>
          </Row>
        )}
        {card.topDrop && (
          <Row label={card.sameDrop ? "Top & luckiest" : "Top drop"}>
            <ItemTile drop={card.topDrop} size={26} />
            <span className="truncate">{card.topDrop.itemName}</span>
            {card.topDrop.gpLabel && <Gp label={card.topDrop.gpLabel} size={15} />}
            {card.sameDrop && card.topDrop.luckLabel && <span className="num shrink-0 text-[13px]" style={{ color: C.gold }}>{card.topDrop.luckLabel}</span>}
          </Row>
        )}
        {card.luckiestDrop && (
          <Row label="Luckiest">
            <ItemTile drop={card.luckiestDrop} size={26} />
            <span className="truncate">{card.luckiestDrop.itemName}</span>
            <span className="num shrink-0 text-[13px]" style={{ color: C.gold }}>{card.luckiestDrop.luckLabel}</span>
          </Row>
        )}
        {fit.show("streak") && card.driestStreak && (
          <Row label="Driest">
            <span className="truncate">
              <span className="num">{card.driestStreak.killsLabel}</span> <span className="font-normal" style={{ color: C.muted }}>at {card.driestStreak.boss}</span>
            </span>
          </Row>
        )}
        {card.titles.length > 0 && (
          <div className="border-t pt-3" style={{ borderColor: C.outline }}>
            <p className="text-center text-[13px] font-semibold leading-snug" style={{ color: C.fg }}>
              {card.titles.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && <span style={{ color: C.subtle }}> ✦ </span>}
                  <span className="whitespace-nowrap">{t.name}</span>
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
    </Frame>
  );
}

function TeamC({ card }: { card: ProtoTeamCard }) {
  const ref = useTeamOverflow(card.key);
  const [place, of] = card.placementLabel.split(" of ");
  return (
    <Frame accent={card.color} bodyRef={ref}>
      <div>
        <h2 className="line-clamp-2 text-[26px] font-black leading-tight">{card.name}</h2>
        <p className="truncate text-[12px]" style={{ color: C.muted }}>
          {card.bingoName}
        </p>
      </div>
      <div className="text-center">
        <div className="num text-[104px] font-black leading-none tracking-tighter" style={{ color: medal(card.placement) }}>
          {place}
        </div>
        <p className="num mt-1 text-[15px]" style={{ color: C.muted }}>
          of {of} · <span className="font-bold" style={{ color: C.fg }}>{card.pointsLabel}</span> points
        </p>
      </div>
      <div>
        <Row label="Tiles · Lines">
          <span className="num">
            {card.tilesCompleted} · {card.linesCompleted}
          </span>
        </Row>
        {card.dropValueLabel && (
          <Row label="Drop value">
            <Gp label={card.dropValueLabel} size={16} />
          </Row>
        )}
        {card.mvp && (
          <Row label="MVP">
            <Avatar url={card.mvp.person.avatarUrl} name={card.mvp.person.name} size={24} />
            <span className="truncate">{card.mvp.person.name}</span>
            <span className="num shrink-0 font-normal" style={{ color: C.muted }}>{card.mvp.teamPercentLabel}</span>
          </Row>
        )}
        {card.biggestDrop && (
          <Row label="Biggest drop">
            <ItemTile drop={card.biggestDrop} size={26} />
            <span className="truncate">{card.biggestDrop.itemName}</span>
            {card.biggestDrop.gpLabel && <Gp label={card.biggestDrop.gpLabel} size={15} />}
          </Row>
        )}
        {card.superlatives.map((s) => (
          <Row key={s.category} label={s.category.length > 22 ? `${s.category.slice(0, 21)}…` : s.category}>
            <Avatars people={s.winners} size={24} />
            <span className="truncate">{s.winners.map((w) => w.name).join(" & ")}</span>
          </Row>
        ))}
      </div>
    </Frame>
  );
}
