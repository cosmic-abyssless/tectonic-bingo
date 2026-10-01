// Wrapped (CONTEXT.md "Wrapped"): the story's sections, built from the published data (MyWrappedResponse) as it is.
// Nothing here recomputes a stat: it picks what to say, words it, and leaves out every part (and every section) that
// has nothing to say for this viewer. Pure, so it's tested without React.
import { achievementDef, isAchievementKey, type AvatarUser, type MyWrappedResponse, type WrappedArtSection, type WrappedCaptain, type WrappedDrop, type WrappedPointsPoint, type WrappedTeam } from "@bingo/shared";
import { thumbUrl } from "../api/imageVariants";
import { wikiIconUrl } from "../api/wikiIcons";
import { formatGp } from "../core/ui/gp";
import { avatarUrl, displayName } from "../core/ui/user";
import { formatOneIn } from "./rewindModel";
import type {
  WrappedBingoModel,
  WrappedCaptainModel,
  WrappedChartModel,
  WrappedDropModel,
  WrappedDuoModel,
  WrappedIntroModel,
  WrappedLuckModel,
  WrappedModel,
  WrappedModeratorModel,
  WrappedPersonModel,
  WrappedPlayerCardModel,
  WrappedSectionArtModel,
  WrappedSectionModel,
  WrappedShareCardDropModel,
  WrappedShareCardModel,
  WrappedTeamModel,
  WrappedTeamSuperlativesModel,
  WrappedYouModel,
} from "./types";

export interface WrappedStoryOptions {
  viewerId: string;
  /** The viewer's name as the Bingo shows it (their RSN, else their Discord name), for the intro and their Moderator art. */
  viewerName: string;
  /** Their avatar, for their Player card. */
  viewerAvatarUrl: string;
  /** When the Bingo started and ended (ms), for the intro's dates and the charts' span. */
  startsAt: number | null;
  endsAt: number | null;
  /** Whether the viewer reached the Outro on an earlier visit (WrappedModel.outroReachedBefore). */
  outroReachedBefore?: boolean;
}

const SECTION_LABEL: Record<WrappedSectionModel["kind"], string> = {
  intro: "Intro",
  you: "You",
  duo: "Your Duo",
  captain: "Your Draft",
  moderator: "Your reviews",
  team: "Your Team",
  bingo: "The Bingo",
  outro: "The end",
};

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** A review wait, short: "40 s", "23 min", "2 h 5 min", "3 d 4 h". */
export function shortDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
/** A Points share, as the Stats page shows it: up to two decimals. */
const share = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const whenLabel = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const localDayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dateLabel = (ms: number, withYear: boolean) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

/** The busiest review hour (a UTC hour of day) in the viewer's time zone: "9 pm". */
function hourLabel(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

/** Banter on a rejection rate (0–1), for "who had to deal with the most nonsense". */
export function rejectionBanter(rate: number): string {
  if (rate === 0) return "Not a single rejection. Too soft, or was everyone just that honest?";
  if (rate < 0.05) return "Barely a rejection in sight. Turns out people can read the rules.";
  if (rate < 0.15) return "Firm but fair.";
  if (rate < 0.3) return "Somebody had to deal with the nonsense.";
  return "Dealt with more nonsense than anyone should have to.";
}

/**
 * "2.3× the average Player", only when they clearly beat it (by a fifth). Wrapped never measures a Player against a
 * number they fell short of: below it, they just see their own.
 */
export function aboveAverage(value: number, average: number | undefined): string | null {
  const times = timesAverage(value, average);
  return times && `${times} the average Player`;
}

/** "2.3×", only when they clearly beat the average (by a fifth); else null. */
function timesAverage(value: number, average: number | undefined): string | null {
  if (!average || average <= 0 || value < average * 1.2) return null;
  return timesLabel(value / average);
}

/** A ratio to an average: "2.3×", "0.4×", and "<0.1×" for a sliver that would round to "0×". */
function timesLabel(ratio: number): string {
  return ratio > 0 && ratio < 0.05 ? "<0.1×" : `${ratio.toLocaleString(undefined, { maximumFractionDigits: 1 })}×`;
}

/** A part of a whole (0–1) as a whole percent, "<1%" for a sliver that would round to "0%"; null at none. */
export function wholePercent(fraction: number): string | null {
  if (!(fraction > 0)) return null;
  return fraction < 0.005 ? "<1%" : `${Math.round(fraction * 100)}%`;
}

/** A per-kill drop rate as Players write it: "1/512". */
export function rateLabel(perKill: number): string {
  const n = 1 / perKill;
  return `1/${(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString()}`;
}

/**
 * A drop's Luck, worded (CONTEXT.md "Luck"): "1 in N" is 1 / P(at least one drop in those kills), so the per-kill rate
 * behind it is −ln(1 − 1/N) / kills. Null below 1 in 2, where a drop wasn't lucky at all (as in Rewind).
 */
export function dropLuck(oneIn: number | null, kills: number | null | undefined): WrappedLuckModel | null {
  if (oneIn === null || oneIn < 2) return null;
  const chanceLabel = formatOneIn(oneIn);
  // "Only" once it's properly rare (1 in 10, the luck Titles' bar); a 1 in 3 is just a good day.
  const rarity = `${oneIn >= 10 ? "Only " : ""}${chanceLabel} get it that fast.`;
  if (!kills || kills <= 0) return { chanceLabel, rateLabel: null, killsLabel: null, shortLabel: `${chanceLabel} luck`, sentence: rarity.charAt(0).toUpperCase() + rarity.slice(1) };
  const rate = rateLabel(-Math.log1p(-1 / oneIn) / kills);
  const killsLabel = plural(kills, "kill");
  return { chanceLabel, rateLabel: rate, killsLabel, shortLabel: `${rate} in ${killsLabel}`, sentence: `A ${rate} drop in ${killsLabel}. ${rarity.charAt(0).toUpperCase() + rarity.slice(1)}` };
}

/**
 * Banter on how a Duo's Points share split (`mine`: the viewer's share of it, 0–1): who carried whom, as friendly
 * teasing either way.
 */
export function carriedBanter(mine: number, partnerName: string): string {
  if (mine >= 0.6) return `You carried ${partnerName}. They owe you one.`;
  if (mine <= 0.4) return `${partnerName} carried you. Buy them something nice.`;
  return "Split near enough down the middle: a real team effort.";
}

/**
 * A Captain's draft grade: how far their picks finished above (or below) where they were drafted, on average, as a
 * share of everyone drafted. Kind at the bottom end: a draft is half luck, and Wrapped never scolds.
 */
export function draftGrade(captain: WrappedCaptain): { letter: string; line: string } | null {
  const ranked = captain.picks.filter((p) => p.rank > 0);
  if (ranked.length === 0) return null;
  const drafted = captain.drafted ?? Math.max(...captain.picks.flatMap((p) => [p.position, p.rank]));
  const score = ranked.reduce((sum, p) => sum + (p.position - p.rank), 0) / ranked.length / Math.max(1, drafted);
  if (score >= 0.15) return { letter: "A+", line: "Robbed the draft blind." };
  if (score >= 0.05) return { letter: "A", line: "Picked like a seasoned scout." };
  if (score >= -0.05) return { letter: "B+", line: "Solid picks, no regrets." };
  if (score >= -0.15) return { letter: "B", line: "Some picks went better than others. That's drafting." };
  return { letter: "C", line: "The draft is a lottery anyway." };
}

/** Builds the whole story. `actions` come from the page (navigation). */
export function buildWrappedStory(data: MyWrappedResponse, opts: WrappedStoryOptions, actions: WrappedModel["actions"], slug: string): WrappedModel {
  const { bingo, player } = data;
  const teamById = new Map(bingo.teams.map((t) => [t.teamId, t]));
  const myTeamId = player?.teamId ?? null;

  const person = (u: AvatarUser): WrappedPersonModel => ({ id: u.id, name: displayName(u), avatarUrl: avatarUrl(u), isYou: u.id === opts.viewerId });
  const drop = (d: WrappedDrop, i = 0): WrappedDropModel => {
    const team = teamById.get(d.teamId);
    return {
      key: `${d.submissionId}:${d.itemName}:${i}`,
      itemName: d.itemName,
      quantityLabel: d.quantity > 1 ? `×${d.quantity.toLocaleString()}` : null,
      gpLabel: d.gpValue !== null && d.gpValue > 0 ? formatGp(d.gpValue) : null,
      luck: dropLuck(d.luckOneIn, d.luckKills),
      player: d.player ? person(d.player) : null,
      team: team ? { name: team.name, color: team.color } : null,
      whenLabel: whenLabel(d.at),
      thumbnailUrl: thumbUrl(d.screenshotUrl) ?? null,
      screenshotUrl: d.screenshotUrl,
    };
  };

  const chartOf = (teams: WrappedTeam[]): WrappedChartModel | null => {
    const toPoints = (pts: WrappedPointsPoint[]) =>
      pts.map((p) => ({
        t: Date.parse(p.at),
        points: p.points,
        event:
          p.label !== undefined && p.delta !== undefined
            ? { deltaLabel: `${p.delta > 0 ? "+" : ""}${p.delta.toLocaleString()}`, label: p.source === "adjustment" ? `Moderator adjustment: ${p.label}` : p.label, whenLabel: whenLabel(p.at) }
            : null,
      }));
    const all = teams.flatMap((t) => toPoints(t.pointsOverTime));
    if (all.length === 0) return null;
    const start = Math.min(opts.startsAt ?? Infinity, ...all.map((p) => p.t));
    const end = Math.max(opts.endsAt ?? -Infinity, ...all.map((p) => p.t));
    if (!(end > start)) return null;
    const series = teams.map((t) => {
      const pts = toPoints(t.pointsOverTime);
      // From 0 at the start, flat to the end after the last award.
      const last = pts.at(-1)?.points ?? 0;
      return { teamId: t.teamId, name: t.name, color: t.color, isMine: t.teamId === myTeamId, points: [{ t: start, points: 0, event: null }, ...pts, { t: end, points: last, event: null }] };
    });
    return { start, end, maxPoints: Math.max(1, ...all.map((p) => p.points)), series };
  };

  const sections: WrappedSectionModel[] = [];
  // A category's images, each captioned with who it credits, and its additional credits (CONTEXT.md "Credits").
  const art = (section: WrappedArtSection): WrappedSectionArtModel => ({
    images: (data.art?.sections?.[section] ?? []).map((piece) => ({ frames: piece.frames, name: piece.credit?.name ?? null, role: piece.credit?.role || null })),
    credits: (data.art?.additionalCredits?.[section] ?? []).map((c) => ({ name: c.name, role: c.role || null })),
  });

  // Intro.
  const intro: WrappedIntroModel = {
    kind: "intro",
    art: art("intro"),
    bingoName: bingo.bingoName,
    playerName: player ? opts.viewerName : null,
    datesLabel:
      opts.startsAt && opts.endsAt
        ? `${dateLabel(opts.startsAt, new Date(opts.startsAt).getFullYear() !== new Date(opts.endsAt).getFullYear())} – ${dateLabel(opts.endsAt, true)}`
        : null,
  };
  sections.push(intro);

  // You.
  if (player) {
    const y = player.you;
    const valued = y.topDrops.filter((d) => d.gpValue !== null && d.gpValue > 0);
    const achievedAt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const bosses = (y.wom?.bosses ?? []).filter((b) => b.kills > 0);
    const you: WrappedYouModel = {
      kind: "you",
      art: art("you"),
      // Against the average either way: below it just says they had a slow Bingo.
    submissions: y.submissions > 0 ? { countLabel: plural(y.submissions, "Submission"), comparison: aboveAverage(y.submissions, y.bingoAverageSubmissions) } : null,
      points:
        y.pointsShare > 0
          ? {
              shareLabel: share(y.pointsShare),
              comparison: aboveAverage(y.pointsShare, y.bingoAveragePointsShare),
              // Only at least their even share of the Team's points, and only from the top half of the Team.
              teamPercentLabel: y.teamPointsFraction >= 1 / Math.max(1, y.teamSize) ? `${percent(y.teamPointsFraction)} of your Team's points` : null,
              rankLabel: y.teamRank === 1 ? null : y.teamRank <= Math.ceil(y.teamSize / 2) ? `${ordinal(y.teamRank)} on your Team` : null,
              isTop: y.teamRank === 1,
            }
          : null,
      gp: y.gpGained > 0 ? { gainedLabel: formatGp(y.gpGained), buyInLabel: y.buyIn ? formatGp(y.buyIn) : null, coveredBuyIn: y.coveredBuyIn } : null,
      topDrops: valued.map(drop),
      luckiestDrop: y.luckiestDrop && dropLuck(y.luckiestDrop.luckOneIn, y.luckiestDrop.luckKills) ? drop(y.luckiestDrop) : null,
      driestStreak:
        y.driestStreak && y.driestStreak.kills > 0
          ? {
              boss: y.driestStreak.boss,
              killsLabel: plural(y.driestStreak.kills, "kill"),
              // "1 in N" is 1 / (1 − p)^kills, so the combined per-kill rate p is 1 − N^(−1/kills).
              rateLabel: rateLabel(-Math.expm1(-Math.log(y.driestStreak.oneIn) / y.driestStreak.kills)),
              chanceLabel: formatOneIn(y.driestStreak.oneIn),
            }
          : null,
      firstLast: y.firstDrop ? { first: drop(y.firstDrop), last: y.lastDrop && y.lastDrop.submissionId !== y.firstDrop.submissionId ? drop(y.lastDrop, 1) : null } : null,
      mostActiveDay: y.mostActiveDay && y.mostActiveDay.submissions > 1 ? { dateLabel: dayLabel(y.mostActiveDay.date), submissionsLabel: plural(y.mostActiveDay.submissions, "Submission"), drops: y.mostActiveDay.drops.map(drop) } : null,
      titles: y.titles,
      achievements: y.achievements.map((a) => ({
        key: a.key,
        name: a.name,
        itemName: a.itemName,
        // From the catalogue, so Wrapped published before it was stored says it too.
        description: isAchievementKey(a.key) ? achievementDef(a.key).description : null,
        earnedLabel: achievedAt(a.earnedAt),
      })),
      wom: y.wom && (y.wom.ehb > 0 || bosses.length > 0) ? { ehbLabel: y.wom.ehb.toLocaleString(undefined, { maximumFractionDigits: 1 }), bosses: bosses.map((b) => ({ name: b.name, killsLabel: plural(b.kills, "kill") })) } : null,
      draft: y.draft ? { pickLabel: `Pick ${y.draft.pickNumber}`, positionLabel: ordinal(y.draft.position) } : null,
    };
    const { kind: _kind, art: _art, titles, achievements, topDrops, ...parts } = you;
    if (titles.length || achievements.length || topDrops.length || Object.values(parts).some((p) => p !== null)) sections.push(you);
  }

  // Your Duo: only for a Player in a Duo.
  if (player?.duo) {
    const d = player.duo;
    const partner = person(d.partner);
    const mine = d.combinedPointsShare > 0 ? d.myPointsShare / d.combinedPointsShare : null;
    const myPercent = mine === null ? 0 : Math.round(mine * 100);
    const duo: WrappedDuoModel = {
      kind: "duo",
      art: art("duo"),
      partner,
      combinedShareLabel: share(d.combinedPointsShare),
      rankLabel: d.duoCount > 1 ? `${ordinal(d.rank)} of ${d.duoCount} Duos` : null,
      isTop: d.duoCount > 1 && d.rank === 1,
      split: mine === null ? null : { myPercent, partnerPercent: 100 - myPercent, myShareLabel: share(d.myPointsShare), partnerShareLabel: share(d.partnerPointsShare) },
      carried: mine === null ? null : carriedBanter(mine, partner.name),
      pickLabel: d.pickNumber !== null ? `Pick ${d.pickNumber}` : null,
      moments: (d.moments ?? []).map((m, i) => ({
        key: `${m.mine.submissionId}:${m.theirs.submissionId}`,
        // The day in the viewer's time zone, like the drops' own times under it (m.date is the UTC day they were paired on).
        label: m.kind === "tile" && m.tileName ? `Both on ${m.tileName}` : `Both on ${localDayLabel(m.mine.at < m.theirs.at ? m.mine.at : m.theirs.at)}`,
        mine: drop(m.mine, 10 + i),
        theirs: drop(m.theirs, 20 + i),
      })),
    };
    sections.push(duo);
  }

  // Your Draft: only for Captains.
  if (player?.captain && player.captain.picks.length > 0) {
    const c = player.captain;
    // A pick that scored nothing shares a tied rank with everyone else on 0: never a Steal, never highlighted, no rank shown.
    const scored = (p: WrappedCaptain["picks"][number]) => p.rank > 0 && (p.pointsShare === undefined || p.pointsShare > 0);
    const best = [...c.picks].filter((p) => scored(p) && p.position > p.rank).sort((a, b) => b.position - b.rank - (a.position - a.rank) || a.pickNumber - b.pickNumber)[0];
    const captain: WrappedCaptainModel = {
      kind: "captain",
      art: art("captain"),
      picks: c.picks.map((p) => ({
        key: String(p.pickNumber),
        pickLabel: `Pick ${p.pickNumber}`,
        people: p.players.map(person),
        positionLabel: `Drafted ${ordinal(p.position)}`,
        rankLabel: scored(p) ? `Finished ${ordinal(p.rank)}` : null,
        beat: scored(p) && p.rank < p.position,
      })),
      steal: best
        ? { people: best.players.map(person), pickLabel: `Pick ${best.pickNumber}`, positionLabel: ordinal(best.position), rankLabel: ordinal(best.rank), placesBeatenLabel: plural(best.position - best.rank, "place") }
        : null,
      grade: draftGrade(c),
    };
    sections.push(captain);
  }

  // Moderator: a reviewer's own slide, whether or not they played.
  if (data.moderator && data.moderator.reviewed > 0) {
    const m = data.moderator;
    const moderator: WrappedModeratorModel = {
      kind: "moderator",
      art: art("moderator"),
      name: opts.viewerName,
      reviewedLabel: plural(m.reviewed, "Submission"),
      medianLabel: shortDuration(m.medianReviewMs),
      rejectionLabel: percent(m.rejectionRate),
      banter: rejectionBanter(m.rejectionRate),
    };
    sections.push(moderator);
  }

  // Your Team.
  const myTeam = myTeamId ? teamById.get(myTeamId) : undefined;
  if (myTeam) {
    const team: WrappedTeamModel = {
      kind: "team",
      art: art("team"),
      name: myTeam.name,
      color: myTeam.color,
      placement: myTeam.placement,
      placementLabel: `${ordinal(myTeam.placement)} of ${bingo.teams.length}`,
      teamCount: bingo.teams.length,
      pointsLabel: myTeam.points.toLocaleString(),
      tilesCompleted: myTeam.tilesCompleted,
      linesCompleted: myTeam.linesCompleted,
      mvp: myTeam.mvp ? { person: person(myTeam.mvp.player), shareLabel: share(myTeam.mvp.pointsShare) } : null,
      topGpEarner: myTeam.topGpEarner ? { person: person(myTeam.topGpEarner.player), gpLabel: formatGp(myTeam.topGpEarner.gpGained) } : null,
      biggestDrop: myTeam.biggestDrop ? drop(myTeam.biggestDrop) : null,
      chart: chartOf([myTeam]),
      superlatives: (myTeam.superlatives ?? []).map((s) => ({ category: s.category, winners: s.winners.map(person) })),
    };
    sections.push(team);
  }

  // The Bingo.
  const mod = bingo.moderation;
  const b: WrappedBingoModel = {
    kind: "bingo",
    art: art("bingo"),
    totalSubmissions: bingo.totalSubmissions,
    totalSubmissionsLabel: bingo.totalSubmissions.toLocaleString(),
    totalGpLabel: formatGp(bingo.totalGp),
    rarestDrop: bingo.rarestDrop && dropLuck(bingo.rarestDrop.luckOneIn, bingo.rarestDrop.luckKills) ? drop(bingo.rarestDrop) : null,
    mostReacted: bingo.mostReacted ? { drop: drop(bingo.mostReacted.drop), reactionsLabel: plural(bingo.mostReacted.reactions, "reaction") } : null,
    leaderboard: bingo.teams.map((t) => ({ teamId: t.teamId, name: t.name, color: t.color, placement: t.placement, placementLabel: ordinal(t.placement), pointsLabel: t.points.toLocaleString(), isMine: t.teamId === myTeamId })),
    race: chartOf(bingo.teams),
    steal: bingo.biggestSteal
      ? {
          person: person(bingo.biggestSteal.player),
          teamName: teamById.get(bingo.biggestSteal.teamId)?.name ?? null,
          positionLabel: ordinal(bingo.biggestSteal.position),
          rankLabel: ordinal(bingo.biggestSteal.rank),
          placesBeatenLabel: plural(bingo.biggestSteal.placesBeaten, "place"),
        }
      : null,
    moderation:
      mod.reviewed > 0
        ? {
            reviewedLabel: plural(mod.reviewed, "review"),
            medianLabel: mod.medianReviewMs !== null ? shortDuration(mod.medianReviewMs) : null,
            fastestLabel: mod.fastestReviewMs !== null ? shortDuration(mod.fastestReviewMs) : null,
            withinHourLabel: mod.withinHourFraction !== null ? percent(mod.withinHourFraction) : null,
            busiestHourLabel: mod.busiestHour ? hourLabel(mod.busiestHour.hour) : null,
            topReviewer: mod.topReviewer ? { person: person(mod.topReviewer.user), reviewedLabel: plural(mod.topReviewer.reviewed, "review") } : null,
            reviewers: mod.reviewers.map((r) => ({ person: person(r.user), rejectionLabel: percent(r.rejectionRate), reviewedLabel: plural(r.reviewed, "review") })),
            banter: mod.reviewers.length > 1 ? rejectionBanter(mod.reviewers[0]!.rejectionRate) : null,
            art: art("moderators"),
          }
        : null,
    teamSuperlatives: bingo.teams
      .filter((t) => (t.superlatives ?? []).length > 0)
      .map((t): WrappedTeamSuperlativesModel => ({
        teamId: t.teamId,
        teamName: t.name,
        color: t.color,
        superlatives: t.superlatives!.map((s) => ({ category: s.category, winners: s.winners.map(person) })),
      })),
  };
  sections.push(b);

  sections.push({ kind: "outro", art: art("outro"), bingoName: bingo.bingoName, cards: shareCards(data, opts, slug, person) });

  return {
    slug,
    bingoName: bingo.bingoName,
    preview: data.preview,
    sideArt: data.art?.side ?? [],
    publishedLabel: !data.preview && data.state.publishedAt ? `Published ${dateLabel(Date.parse(data.state.publishedAt), false)}` : null,
    sections: sections.map((section) => ({ id: section.kind, label: SECTION_LABEL[section.kind], section })),
    outroReachedBefore: opts.outroReachedBefore ?? false,
    actions,
  };
}

/** Most Titles, and Superlatives, a share card shows. */
const CARD_TITLES = 3;
const CARD_SUPERLATIVES = 3;
/** Most of the Team section's Category images the Team card shows. */
const CARD_TEAM_ART = 3;
/** The wiki's icon of a stack of coins, beside every GP figure on a card. */
const COINS_ICON = "Coins 10000";

/**
 * The Player card art for a Points share rank in the Bingo (CONTEXT.md "Wrapped art"): the ranked Players split into
 * as many equal bands as there are images, best first, so tied Players (who share a rank) share an image. Undefined
 * with no art, or for Wrapped published before the rank was stored.
 */
export function rankedArt<T>(pool: readonly T[], bingoRank: number | undefined, bingoPlayers: number | undefined): T | undefined {
  if (pool.length === 0 || !bingoRank || !bingoPlayers) return undefined;
  const band = Math.floor(((bingoRank - 1) * pool.length) / bingoPlayers);
  return pool[Math.min(Math.max(band, 0), pool.length - 1)];
}

/**
 * The share cards the story ends on (WrappedOutroModel.cards): a Player's Player and Team cards, each left out when it
 * has nothing to show, and none for anyone else. Drops are shown with their item's wiki icon, never a screenshot, so a
 * card never needs one the viewer isn't allowed to see.
 */
export function shareCards(data: MyWrappedResponse, opts: WrappedStoryOptions, slug: string, person: (u: AvatarUser) => WrappedPersonModel): WrappedShareCardModel[] {
  const { bingo, player } = data;
  if (!player) return [];
  // Each card's art (CONTEXT.md "Share cards"). Fallbacks are a side image, the Team card a different one from the
  // Player card's where there are two.
  const sectionArt = (section: WrappedArtSection) => (data.art?.sections?.[section] ?? []).map((piece) => piece.frames[0]);
  const side = (data.art?.side ?? []).map((f) => f[0]);
  const ranked = rankedArt((data.art?.playerCard ?? []).map((f) => f[0]), player.you.bingoRank, player.you.bingoPlayers);
  const teamArt = sectionArt("team").slice(0, CARD_TEAM_ART);
  const one = (url: string | undefined) => (url ? [url] : []);
  const cardArt = {
    player: one(ranked ?? sectionArt("you")[0] ?? side[0]),
    team: teamArt.length > 0 ? teamArt : one(side[1] ?? side[0]),
  };
  const base = (kind: WrappedShareCardModel["kind"], label: string) => ({
    key: kind,
    label,
    bingoName: bingo.bingoName,
    fileName: `${slug}-wrapped-${kind}.png`,
    coinsIconUrl: wikiIconUrl(COINS_ICON)!,
    artUrls: cardArt[kind],
  });
  const cardDrop = (d: WrappedDrop): WrappedShareCardDropModel => ({
    key: `${d.submissionId}:${d.itemName}`,
    itemName: d.itemName,
    iconUrl: wikiIconUrl(d.itemName) ?? null,
    quantityLabel: d.quantity > 1 ? `×${d.quantity.toLocaleString()}` : null,
    gpLabel: d.gpValue !== null && d.gpValue > 0 ? formatGp(d.gpValue) : null,
  });
  const ofTeam = (fraction: number | undefined) => {
    const p = fraction === undefined ? null : wholePercent(fraction);
    return p && `${p} of Team`;
  };
  const cards: WrappedShareCardModel[] = [];
  const myTeam = bingo.teams.find((t) => t.teamId === player.teamId);

  const y = player.you;
  const top = y.topDrops.find((d) => d.gpValue !== null && d.gpValue > 0) ?? null;
  const luckiest = y.luckiestDrop;
  const luck = luckiest && dropLuck(luckiest.luckOneIn, luckiest.luckKills);
  const topIsLuckiest = !!top && !!luckiest && top.submissionId === luckiest.submissionId && top.itemName === luckiest.itemName;
  const ehb = y.wom?.ehb ?? 0;
  const playerCard: WrappedPlayerCardModel = {
    ...base("player", "Player card"),
    kind: "player",
    name: opts.viewerName,
    avatarUrl: opts.viewerAvatarUrl,
    team: myTeam ? { name: myTeam.name, color: myTeam.color } : null,
    partnerLabel: player.duo ? `with ${displayName(player.duo.partner)}` : null,
    // The round the draft used for the pick: a Duo is one pick, so both halves share it.
    draftLabel: y.draft ? `Pick #${y.draft.pickNumber} · Round ${Math.ceil(y.draft.pickNumber / Math.max(1, bingo.teams.length))}` : player.captain ? "Captain" : null,
    pointsShare:
      y.pointsShare > 0
        ? {
            shareLabel: share(y.pointsShare),
            teamPercentLabel: ofTeam(y.teamPointsFraction),
            teamRankLabel: `Team #${y.teamRank} of ${y.teamSize}`,
            bingoRankLabel: y.bingoRank && y.bingoPlayers ? `Bingo #${y.bingoRank} of ${y.bingoPlayers}` : null,
          }
        : null,
    dropValueLabel: y.gpGained > 0 ? formatGp(y.gpGained) : null,
    // Against the average either way: below it just says they had a slow Bingo.
    submissions: y.submissions > 0 ? { countLabel: y.submissions.toLocaleString(), comparisonLabel: y.bingoAverageSubmissions > 0 ? `${timesLabel(y.submissions / y.bingoAverageSubmissions)} avg` : null } : null,
    achievementsLabel: y.achievements.length > 0 ? y.achievements.length.toLocaleString() : null,
    ehbLabel: y.wom && ehb > 0 ? ehb.toLocaleString(undefined, { maximumFractionDigits: 1 }) : null,
    titles: y.titles.slice(0, CARD_TITLES).map((t) => ({ id: t.id, name: t.name })),
    topDrop: top ? { ...cardDrop(top), isLuckiest: topIsLuckiest, luckLabel: topIsLuckiest && luck ? luck.chanceLabel : null } : null,
    luckiestDrop: luckiest && luck && !topIsLuckiest ? { ...cardDrop(luckiest), luckLabel: luck.chanceLabel } : null,
    driestStreak: y.driestStreak && y.driestStreak.kills > 0 ? { boss: y.driestStreak.boss, killsLabel: plural(y.driestStreak.kills, "kill"), chanceLabel: formatOneIn(y.driestStreak.oneIn) } : null,
  };
  const p = playerCard;
  if (p.pointsShare || p.dropValueLabel || p.submissions || p.achievementsLabel || p.ehbLabel || p.titles.length || p.draftLabel || p.topDrop || p.luckiestDrop || p.driestStreak) {
    cards.push(playerCard);
  }

  if (myTeam) {
    cards.push({
      ...base("team", "Team card"),
      kind: "team",
      name: myTeam.name,
      color: myTeam.color,
      placement: myTeam.placement,
      placementLabel: `${ordinal(myTeam.placement)} of ${bingo.teams.length}`,
      pointsLabel: myTeam.points.toLocaleString(),
      tilesCompleted: myTeam.tilesCompleted,
      linesCompleted: myTeam.linesCompleted,
      dropValueLabel: myTeam.dropValue ? formatGp(myTeam.dropValue) : null,
      mvp: myTeam.mvp ? { person: person(myTeam.mvp.player), shareLabel: share(myTeam.mvp.pointsShare), teamPercentLabel: ofTeam(myTeam.mvp.teamPointsFraction) } : null,
      biggestDrop: myTeam.biggestDrop ? { ...cardDrop(myTeam.biggestDrop), player: myTeam.biggestDrop.player ? person(myTeam.biggestDrop.player) : null } : null,
      // Stored in the Bingo's category order, winnerless ones already left out; a Bingo from before the cap of 3 can
      // have more, and the card shows the first 3 (the story still shows every one).
      superlatives: (myTeam.superlatives ?? []).slice(0, CARD_SUPERLATIVES).map((s) => ({ category: s.category, winners: s.winners.map(person) })),
    });
  }
  return cards;
}
