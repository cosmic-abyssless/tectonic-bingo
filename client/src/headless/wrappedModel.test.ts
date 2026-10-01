import { describe, expect, it } from "vitest";
import { achievementDef } from "@bingo/shared";
import type { AvatarUser, BingoWrapped, MyWrappedResponse, PlayerWrapped, WrappedCaptain, WrappedDrop, WrappedDuo, WrappedYou } from "@bingo/shared";
import type { WrappedOutroModel, WrappedShareCardModel, WrappedTeamModel } from "./types";
import { aboveAverage, buildWrappedStory, carriedBanter, draftGrade, dropLuck, ordinal, rankedArt, rateLabel, rejectionBanter, shortDuration } from "./wrappedModel";

const T0 = Date.UTC(2026, 0, 3, 12);
const HOUR = 3_600_000;
const iso = (hours: number) => new Date(T0 + hours * HOUR).toISOString();

const u = (id: string): AvatarUser => ({ id, discordUsername: id, discordGlobalName: null, discordGuildNick: null, discordId: "1", discordAvatar: null, rsn: `${id} rsn` });

function drop(submissionId: string, opts: Partial<WrappedDrop> = {}): WrappedDrop {
  return { submissionId, teamId: "a", player: u("me"), itemName: "Twisted bow", quantity: 1, gpValue: 1_200_000_000, luckOneIn: 3000, at: iso(5), screenshotUrl: "/uploads/s.png", ...opts };
}

const emptyYou: WrappedYou = {
  submissions: 0,
  bingoAverageSubmissions: 4,
  pointsShare: 0,
  teamPointsFraction: 0,
  teamRank: 3,
  teamSize: 3,
  gpGained: 0,
  buyIn: null,
  coveredBuyIn: null,
  topDrops: [],
  luckiestDrop: null,
  driestStreak: null,
  firstDrop: null,
  lastDrop: null,
  mostActiveDay: null,
  titles: [],
  achievements: [],
  wom: null,
  draft: null,
};

function bingo(): BingoWrapped {
  const team = (teamId: string, name: string, placement: number, points: number) => ({
    teamId,
    name,
    color: "#f00",
    placement,
    points,
    tilesCompleted: 4,
    linesCompleted: 1,
    mvp: { player: u("me"), pointsShare: 40.5 },
    topGpEarner: null,
    biggestDrop: null,
    pointsOverTime: [{ at: iso(2), points: points / 2 }, { at: iso(20), points }],
  });
  return {
    bingoName: "Winter Bingo",
    totalSubmissions: 120,
    totalGp: 5_000_000_000,
    rarestDrop: drop("s9", { teamId: "b", luckOneIn: 90_000 }),
    mostReacted: null,
    teams: [team("b", "Blue", 1, 300), team("a", "Red", 2, 200)],
    biggestSteal: null,
    moderation: { reviewed: 0, medianReviewMs: null, fastestReviewMs: null, withinHourFraction: null, busiestHour: null, topReviewer: null, reviewers: [] },
  };
}

function response(player: PlayerWrapped | null, extra: Partial<MyWrappedResponse> = {}): MyWrappedResponse {
  return { state: { published: true, publishedAt: iso(48), publishOnFinish: false, pendingSubmissions: 0 }, preview: false, bingo: bingo(), player, moderator: null, art: { sections: {}, additionalCredits: {}, side: [], playerCard: [] }, ...extra };
}

const player = (you: Partial<WrappedYou> = {}): PlayerWrapped => ({ userId: "me", teamId: "a", you: { ...emptyYou, ...you }, duo: null, captain: null });
const opts = { viewerId: "me", viewerName: "me rsn", viewerAvatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png", startsAt: T0, endsAt: T0 + 24 * HOUR };
const actions = { goToBoard: () => {}, goToRewind: () => {}, outroReached: () => {} };
const story = (data: MyWrappedResponse) => buildWrappedStory(data, opts, actions, "winter");
const kinds = (data: MyWrappedResponse) => story(data).sections.map((s) => s.id);

describe("buildWrappedStory", () => {
  it("tells a Player intro → You → Team → Bingo → outro", () => {
    expect(kinds(response(player({ submissions: 5, pointsShare: 12 })))).toEqual(["intro", "you", "team", "bingo", "outro"]);
  });

  it("gives each section its Wrapped art, and a section without any none", () => {
    const frames = (name: string): [string, string] => [`/uploads/wrapped-art/${name}-1.webp`, `/uploads/wrapped-art/${name}-2.webp`];
    const piece = (name: string) => ({ frames: frames(name), credit: null });
    const built = story(
      response(player({ submissions: 5 }), { art: { sections: { intro: [piece("intro")], team: [piece("team"), piece("team2")], duo: [piece("duo")] }, additionalCredits: {}, side: [frames("side")], playerCard: [frames("card")] } }),
    );
    const sections = built.sections;
    expect(built.sideArt.map((f) => f[0])).toEqual(["/uploads/wrapped-art/side-1.webp"]);
    expect(sections.map((s) => [s.id, s.section.art.images.map((i) => i.frames[0])])).toEqual([
      ["intro", ["/uploads/wrapped-art/intro-1.webp"]],
      ["you", []],
      ["team", ["/uploads/wrapped-art/team-1.webp", "/uploads/wrapped-art/team2-1.webp"]],
      ["bingo", []],
      ["outro", []],
    ]);
  });

  it("doesn't tell You just because it has art", () => {
    const frames: [string, string] = ["/a.webp", "/b.webp"];
    expect(kinds(response(player(), { art: { sections: { you: [{ frames, credit: null }] }, additionalCredits: {}, side: [], playerCard: [] } }))).toEqual(["intro", "team", "bingo", "outro"]);
  });

  it("gives a viewer who isn't a Player the Bingo only", () => {
    expect(kinds(response(null))).toEqual(["intro", "bingo", "outro"]);
  });

  it("adds a reviewing Moderator's slide after You, whether or not they played", () => {
    const moderator = { reviewed: 30, medianReviewMs: 20 * 60_000, rejectionRate: 0.1 };
    expect(kinds(response(player({ submissions: 2 }), { moderator }))).toEqual(["intro", "you", "moderator", "team", "bingo", "outro"]);
    expect(kinds(response(null, { moderator }))).toEqual(["intro", "moderator", "bingo", "outro"]);
    expect(kinds(response(null, { moderator: { ...moderator, reviewed: 0 } }))).toEqual(["intro", "bingo", "outro"]);
  });

  it("names the Moderator on their slide", () => {
    const moderator = { reviewed: 30, medianReviewMs: 20 * 60_000, rejectionRate: 0.1 };
    const mod = story(response(null, { moderator })).sections.find((s) => s.id === "moderator")!.section;
    expect(mod.kind === "moderator" && mod.name).toBe("me rsn");
  });

  it("captions each image with its own credit and lists each category's additional credits, the same for every category (#281)", () => {
    const frames = (name: string): [string, string] => [`/${name}-1.webp`, `/${name}-2.webp`];
    const art = {
      sections: {
        outro: [{ frames: frames("o1"), credit: { name: "Zezima", role: "Board design" } }, { frames: frames("o2"), credit: null }],
        moderators: [{ frames: frames("m1"), credit: { name: "Woox", role: null } }],
      },
      additionalCredits: { outro: [{ name: "Lynx", role: "Art" }], team: [{ name: "B0aty", role: "" }] },
      side: [],
      playerCard: [],
    };
    const moderation = { ...bingo().moderation, reviewed: 12 };
    const model = story(response(player({ submissions: 1 }), { art, bingo: { ...bingo(), moderation } }));
    const section = (id: string) => model.sections.find((s) => s.id === id)!.section;
    expect(section("outro").art).toEqual({
      images: [
        { frames: frames("o1"), name: "Zezima", role: "Board design" },
        { frames: frames("o2"), name: null, role: null },
      ],
      credits: [{ name: "Lynx", role: "Art" }],
    });
    expect(section("team").art).toEqual({ images: [], credits: [{ name: "B0aty", role: null }] });
    const b = section("bingo");
    expect(b.kind === "bingo" && b.moderation?.art).toEqual({ images: [{ frames: frames("m1"), name: "Woox", role: null }], credits: [] });
    expect(b.art).toEqual({ images: [], credits: [] });
  });

  it("skips the You section when it has nothing to say, and each part of it that has nothing", () => {
    expect(kinds(response(player()))).toEqual(["intro", "team", "bingo", "outro"]);

    const petOnly = drop("s1", { itemName: "Pet", gpValue: null, luckOneIn: 1.2 });
    const you = story(response(player({ submissions: 1, topDrops: [petOnly], luckiestDrop: petOnly, firstDrop: petOnly, lastDrop: petOnly, wom: { ehb: 0, bosses: [{ metric: "zulrah", name: "Zulrah", kills: 0 }], asOf: iso(24) } }))).sections.find((s) => s.id === "you")!.section;
    if (you.kind !== "you") throw new Error("not you");
    // A drop with no Drop value isn't a "top drop"; below 1 in 2 isn't lucky; no WOM gains; one drop has no "last".
    expect(you.topDrops).toEqual([]);
    expect(you.luckiestDrop).toBeNull();
    expect(you.wom).toBeNull();
    expect(you.gp).toBeNull();
    expect(you.titles).toEqual([]);
    expect(you.firstLast?.last).toBeNull();
    expect(you.submissions).toEqual({ countLabel: "1 Submission", comparison: null });
  });

  it("words the numbers", () => {
    const you = story(response(player({ submissions: 10, pointsShare: 40.456, bingoAveragePointsShare: 10, teamPointsFraction: 0.42, teamRank: 1, gpGained: 1_500_000_000, buyIn: 20_000_000, coveredBuyIn: true, topDrops: [drop("s1", { luckKills: 37 })], driestStreak: { boss: "Zulrah", kills: 191, oneIn: 30 } }))).sections[1]!.section;
    if (you.kind !== "you") throw new Error("not you");
    expect(you.submissions).toEqual({ countLabel: "10 Submissions", comparison: "2.5× the average Player" });
    expect(you.points).toEqual({ shareLabel: "40.46", comparison: "4× the average Player", teamPercentLabel: "42% of your Team's points", rankLabel: null, isTop: true });
    expect(you.gp).toEqual({ gainedLabel: "1.5b", buyInLabel: "20m", coveredBuyIn: true });
    expect(you.topDrops[0]).toMatchObject({ itemName: "Twisted bow", gpLabel: "1.2b", luck: { chanceLabel: "1 in 3,000", killsLabel: "37 kills" }, thumbnailUrl: expect.stringContaining("/uploads/"), player: { name: "me rsn", isYou: true }, team: { name: "Red" } });
    // (1 − 1/57)^191 ≈ 1/30.
    expect(you.driestStreak).toEqual({ boss: "Zulrah", killsLabel: "191 kills", rateLabel: "1/57", chanceLabel: "1 in 30" });
  });

  it("never measures a Player against a number they fell short of", () => {
    const you = story(response(player({ submissions: 2, pointsShare: 3, bingoAveragePointsShare: 10, teamPointsFraction: 0.05, teamRank: 9, teamSize: 10 }))).sections[1]!.section;
    if (you.kind !== "you") throw new Error("not you");
    expect(you.submissions).toEqual({ countLabel: "2 Submissions", comparison: null });
    expect(you.points).toEqual({ shareLabel: "3", comparison: null, teamPercentLabel: null, rankLabel: null, isTop: false });

    // The top half of the Team gets its rank; an even share of the Team's points gets its percent.
    const mid = story(response(player({ submissions: 2, pointsShare: 11, bingoAveragePointsShare: 10, teamPointsFraction: 0.1, teamRank: 5, teamSize: 10 }))).sections[1]!.section;
    if (mid.kind !== "you") throw new Error("not you");
    expect(mid.points).toMatchObject({ comparison: null, teamPercentLabel: "10% of your Team's points", rankLabel: "5th on your Team" });
    // Wrapped published before the average was stored has no comparison.
    expect(aboveAverage(5, undefined)).toBeNull();
  });

  it("leaves a screenshot out where the data does", () => {
    const b = story(response(null, { bingo: { ...bingo(), rarestDrop: drop("s9", { teamId: "b", screenshotUrl: null }) } })).sections.find((s) => s.id === "bingo")!.section;
    if (b.kind !== "bingo") throw new Error("not bingo");
    expect(b.rarestDrop).toMatchObject({ thumbnailUrl: null, screenshotUrl: null });
  });

  it("marks the viewer's Team on the leaderboard and charts every Team from 0 to the end", () => {
    const b = story(response(player({ submissions: 1 }))).sections.find((s) => s.id === "bingo")!.section;
    if (b.kind !== "bingo") throw new Error("not bingo");
    expect(b.leaderboard.map((t) => [t.name, t.placementLabel, t.isMine])).toEqual([["Blue", "1st", false], ["Red", "2nd", true]]);
    expect(b.moderation).toBeNull();
    expect(b.race?.maxPoints).toBe(300);
    expect(b.race?.series[0]!.points[0]).toEqual({ t: T0, points: 0, event: null });
    expect(b.race?.series[0]!.points.at(-1)).toEqual({ t: T0 + 24 * HOUR, points: 300, event: null });
  });

  it("says how each Achievement was earned, from the catalogue", () => {
    const achievements = [
      { key: "night_owl", name: "Night Owl", itemName: "Owl", earnedAt: iso(3) },
      { key: "retired", name: "Retired", itemName: "Bones", earnedAt: iso(4) },
    ];
    const you = story(response(player({ submissions: 1, achievements }))).sections.find((s) => s.id === "you")!.section;
    if (you.kind !== "you") throw new Error("not you");
    expect(you.achievements[0]!.description).toBe(achievementDef("night_owl").description);
    expect(you.achievements[1]!.description).toBeNull();
  });

  it("places the biggest Steal by Players drafted, the same way as their rank", () => {
    const steal = { player: u("x"), teamId: "b", pickNumber: 7, position: 9, rank: 2, placesBeaten: 7 };
    const b = story(response(null, { bingo: { ...bingo(), biggestSteal: steal } })).sections.find((s) => s.id === "bingo")!.section;
    if (b.kind !== "bingo") throw new Error("not bingo");
    expect(b.steal).toMatchObject({ teamName: "Blue", positionLabel: "9th", rankLabel: "2nd", placesBeatenLabel: "7 places" });
  });

  it("words each award on the chart as the stats chart does, and leaves it out of older Wrapped", () => {
    const withEvents = { ...bingo() };
    withEvents.teams = withEvents.teams.map((t) => ({
      ...t,
      pointsOverTime: [
        { at: iso(2), points: 50, source: "node" as const, label: "ZULRAH — Page 1", delta: 50 },
        { at: iso(3), points: 40, source: "adjustment" as const, label: "Duplicate", delta: -10 },
      ],
    }));
    const b = story(response(null, { bingo: withEvents })).sections.find((s) => s.id === "bingo")!.section;
    if (b.kind !== "bingo") throw new Error("not bingo");
    expect(b.race?.series[0]!.points.slice(1, 3).map((p) => p.event && [p.event.deltaLabel, p.event.label])).toEqual([
      ["+50", "ZULRAH — Page 1"],
      ["-10", "Moderator adjustment: Duplicate"],
    ]);
    const old = story(response(null)).sections.find((s) => s.id === "bingo")!.section;
    if (old.kind !== "bingo") throw new Error("not bingo");
    expect(old.race?.series[0]!.points.every((p) => p.event === null)).toBe(true);
  });

  it("labels a Moderator's preview", () => {
    const s = story(response(null, { preview: true, state: { published: false, publishedAt: null, publishOnFinish: false, pendingSubmissions: 0 } }));
    expect(s.preview).toBe(true);
    expect(s.publishedLabel).toBeNull();
  });
});

describe("labels", () => {
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
  });

  it("short durations", () => {
    expect([40_000, 23 * 60_000, 125 * 60_000, 120 * 60_000, 76 * HOUR].map(shortDuration)).toEqual(["40 s", "23 min", "2 h 5 min", "2 h", "3 d 4 h"]);
  });

  it("a drop's Luck as a drop rate and the kills it took", () => {
    // A 1/512 drop in 37 kills: 1 − (511/512)^37 ≈ 1 in 14.3 (Poisson: 1 − e^(−37/512)).
    const oneIn = 1 / -Math.expm1(-37 / 512);
    expect(dropLuck(oneIn, 37)).toEqual({ chanceLabel: "1 in 14", rateLabel: "1/512", killsLabel: "37 kills", shortLabel: "1/512 in 37 kills", sentence: "A 1/512 drop in 37 kills. Only 1 in 14 get it that fast." });
    expect(dropLuck(14, null)).toMatchObject({ rateLabel: null, sentence: "Only 1 in 14 get it that fast." });
    expect(dropLuck(1.5, 3)).toBeNull();
    expect(dropLuck(3, 19)?.sentence).toBe("A 1/47 drop in 19 kills. 1 in 3 get it that fast.");
    expect([1 / 512, 1 / 3.25, 1 / 5000].map(rateLabel)).toEqual(["1/512", "1/3.3", "1/5,000"]);
  });

  it("rejection banter climbs with the rate", () => {
    expect(new Set([0, 0.01, 0.1, 0.2, 0.5].map(rejectionBanter)).size).toBe(5);
    expect(rejectionBanter(0.01)).not.toMatch(/behaved/);
  });
});

describe("Your Duo and Your Draft", () => {
  const duo = (over: Partial<WrappedDuo> = {}): WrappedDuo => ({
    partner: u("pal"), combinedPointsShare: 40, myPointsShare: 30, partnerPointsShare: 10, rank: 2, duoCount: 5, pickNumber: 4, ...over,
  });
  const captain = (picks: [number, number, number][], drafted = 20): WrappedCaptain => ({
    teamId: "a",
    drafted,
    picks: picks.map(([pickNumber, position, rank]) => ({ players: [u(`p${pickNumber}`)], pickNumber, position, rank })),
  });
  const sectionOf = (data: MyWrappedResponse, id: string) => story(data).sections.find((s) => s.id === id)?.section;

  it("tells a Duo after You, and a Captain's Draft after that, only to those who had one", () => {
    const both = { ...player({ submissions: 3 }), duo: duo(), captain: captain([[1, 1, 3]]) };
    expect(kinds(response(both))).toEqual(["intro", "you", "duo", "captain", "team", "bingo", "outro"]);
    expect(kinds(response(player({ submissions: 3 })))).toEqual(["intro", "you", "team", "bingo", "outro"]);
    expect(kinds(response({ ...player({ submissions: 3 }), captain: captain([]) }))).not.toContain("captain");
  });

  it("words the Duo: combined share and rank, the split and who carried whom, and their moments", () => {
    const moment = { kind: "tile" as const, tileName: "Zulrah", date: "2026-01-03", mine: drop("s1"), theirs: drop("s2", { player: u("pal") }) };
    const d = sectionOf(response({ ...player({ submissions: 3 }), duo: duo({ moments: [moment] }) }), "duo")!;
    if (d.kind !== "duo") throw new Error("not the Duo");
    expect(d.combinedShareLabel).toBe("40");
    expect(d.rankLabel).toBe("2nd of 5 Duos");
    expect(d.split).toEqual({ myPercent: 75, partnerPercent: 25, myShareLabel: "30", partnerShareLabel: "10" });
    expect(d.carried).toBe("You carried pal rsn. They owe you one.");
    expect(d.pickLabel).toBe("Pick 4");
    expect(d.moments.map((m) => m.label)).toEqual(["Both on Zulrah"]);
    // Published before moments were stored, and a Duo where neither scored.
    const bare = sectionOf(response({ ...player({ submissions: 3 }), duo: duo({ combinedPointsShare: 0, myPointsShare: 0, partnerPointsShare: 0, duoCount: 1 }) }), "duo")!;
    if (bare.kind !== "duo") throw new Error("not the Duo");
    expect([bare.split, bare.carried, bare.rankLabel, bare.moments]).toEqual([null, null, null, []]);
  });

  it("teases whoever carried, either way", () => {
    expect(carriedBanter(0.2, "Pal")).toBe("Pal carried you. Buy them something nice.");
    expect(carriedBanter(0.5, "Pal")).toMatch(/down the middle/);
  });

  it("lists every pick against where it finished, names the best Steal, and never a bust", () => {
    const c = sectionOf(response({ ...player({ submissions: 3 }), captain: captain([[1, 1, 12], [8, 8, 2], [9, 9, 6], [12, 12, 0]]) }), "captain")!;
    if (c.kind !== "captain") throw new Error("not the Draft");
    expect(c.picks.map((p) => [p.pickLabel, p.positionLabel, p.rankLabel, p.beat])).toEqual([
      ["Pick 1", "Drafted 1st", "Finished 12th", false],
      ["Pick 8", "Drafted 8th", "Finished 2nd", true],
      ["Pick 9", "Drafted 9th", "Finished 6th", true],
      ["Pick 12", "Drafted 12th", null, false],
    ]);
    expect(c.steal).toMatchObject({ pickLabel: "Pick 8", positionLabel: "8th", rankLabel: "2nd", placesBeatenLabel: "6 places" });
    expect(JSON.stringify(c)).not.toMatch(/bust/i);
  });

  it("never makes a pick that scored nothing the Steal, however low the tied rank for 0 sits", () => {
    const zero = captain([[1, 1, 3], [52, 70, 49]]);
    zero.picks[0]!.pointsShare = 20;
    zero.picks[1]!.pointsShare = 0;
    const c = sectionOf(response({ ...player({ submissions: 3 }), captain: zero }), "captain")!;
    if (c.kind !== "captain") throw new Error("not the Draft");
    expect(c.steal).toBeNull();
    expect(c.picks[1]).toMatchObject({ rankLabel: null, beat: false });
  });

  it("grades a draft on how picks did against their draft positions, gently at the bottom", () => {
    expect(draftGrade(captain([[5, 5, 1], [10, 10, 3]]))?.letter).toBe("A+");
    expect(draftGrade(captain([[5, 5, 5]]))?.letter).toBe("B+");
    expect(draftGrade(captain([[1, 1, 20]]))).toEqual({ letter: "C", line: "The draft is a lottery anyway." });
    expect(draftGrade(captain([[1, 1, 0]]))).toBeNull();
    // Published before `drafted` was stored: the widest position or rank stands in.
    expect(draftGrade({ ...captain([[5, 5, 1]]), drafted: undefined })?.letter).toBe("A+");
    // No pick ever beat its spot: no Steal.
    const c = sectionOf(response({ ...player({ submissions: 3 }), captain: captain([[1, 1, 4]]) }), "captain")!;
    if (c.kind !== "captain") throw new Error("not the Draft");
    expect(c.steal).toBeNull();
  });
});

describe("share cards", () => {
  const cardsOf = (data: MyWrappedResponse) => (story(data).sections.find((s) => s.id === "outro")!.section as WrappedOutroModel).cards;
  const card = <K extends WrappedShareCardModel["kind"]>(data: MyWrappedResponse, kind: K) => cardsOf(data).find((c): c is Extract<WrappedShareCardModel, { kind: K }> => c.kind === kind);
  const scored = (you: Partial<WrappedYou> = {}) => player({ submissions: 3, pointsShare: 42.125, teamPointsFraction: 0.34, teamRank: 1, teamSize: 8, bingoRank: 3, bingoPlayers: 42, gpGained: 1_500_000_000, ...you });
  const playerCard = (you: Partial<WrappedYou> = {}, extra: Partial<PlayerWrapped> = {}) => card(response({ ...scored(you), ...extra }), "player")!;

  it("gives a Player their Player and Team cards, and anyone else none", () => {
    expect(cardsOf(response(scored())).map((c) => c.kind)).toEqual(["player", "team"]);
    expect(cardsOf(response(null))).toEqual([]);
  });

  it("heads every card with the Bingo, draws GP with the Coins icon, and names its file", () => {
    for (const c of cardsOf(response(scored()))) {
      expect(c.bingoName).toBe("Winter Bingo");
      expect(c.coinsIconUrl).toBe("/wiki-icons/Coins%2010000.png");
      expect(c.fileName).toBe(`winter-wrapped-${c.kind}.png`);
    }
  });

  describe("art", () => {
    const frames = (name: string): [string, string] => [`/${name}-1.webp`, `/${name}-2.webp`];
    const piece = (name: string) => ({ frames: frames(name), credit: null });
    const art = (a: Partial<MyWrappedResponse["art"]>): MyWrappedResponse["art"] => ({ sections: {}, additionalCredits: {}, side: [], playerCard: [], ...a });
    const artOf = (a: Partial<MyWrappedResponse["art"]>, you: Partial<WrappedYou> = {}) => cardsOf(response(scored(you), { art: art(a) })).map((c) => [c.kind, c.artUrls]);

    it("splits the ranked Players into equal bands, one per Player card image, best first", () => {
      const pool = [1, 2, 3, 4];
      expect([1, 10, 11, 25, 40].map((rank) => rankedArt(pool, rank, 40))).toEqual([1, 1, 2, 3, 4]);
      // Tied Players share a rank, so they share a band: three tied at 9th, straddling the cut at 10th, all get the top one.
      expect(rankedArt(pool, 9, 40)).toBe(1);
      expect([1, 7, 20].map((rank) => rankedArt(["only"], rank, 20))).toEqual(["only", "only", "only"]);
      expect(rankedArt([], 1, 20)).toBeUndefined();
      expect(rankedArt(pool, undefined, undefined)).toBeUndefined();
    });

    it("gives the Player card its rank's Player card art", () => {
      const playerCard = [frames("p1"), frames("p2"), frames("p3"), frames("p4")];
      expect(artOf({ sections: { you: [piece("you")] }, playerCard }, { bingoRank: 1, bingoPlayers: 40 })[0]).toEqual(["player", ["/p1-1.webp"]]);
      expect(artOf({ sections: { you: [piece("you")] }, playerCard }, { bingoRank: 25, bingoPlayers: 40 })[0]).toEqual(["player", ["/p3-1.webp"]]);
      expect(artOf({ sections: { you: [piece("you")] }, playerCard }, { bingoRank: 40, bingoPlayers: 40 })[0]).toEqual(["player", ["/p4-1.webp"]]);
    });

    it("falls back to the You section's art, else a side image, with no Player card art or no Bingo rank", () => {
      expect(artOf({ sections: { you: [piece("you"), piece("you2")] } })[0]).toEqual(["player", ["/you-1.webp"]]);
      expect(artOf({ sections: { you: [piece("you")] }, playerCard: [frames("p1")] }, { bingoRank: undefined, bingoPlayers: undefined })[0]).toEqual(["player", ["/you-1.webp"]]);
      expect(artOf({ side: [frames("s1")] })[0]).toEqual(["player", ["/s1-1.webp"]]);
    });

    it("gives the Team card the Team section's first 3 images, else a side image, a different one from the Player card's where there are two", () => {
      expect(artOf({ sections: { team: [piece("t1"), piece("t2"), piece("t3"), piece("t4")] }, side: [frames("s1")] })[1]).toEqual(["team", ["/t1-1.webp", "/t2-1.webp", "/t3-1.webp"]]);
      expect(artOf({ sections: { team: [piece("t1")] } })[1]).toEqual(["team", ["/t1-1.webp"]]);
      expect(artOf({ side: [frames("s1"), frames("s2")] })).toEqual([
        ["player", ["/s1-1.webp"]],
        ["team", ["/s2-1.webp"]],
      ]);
      expect(artOf({ side: [frames("s1")] })).toEqual([
        ["player", ["/s1-1.webp"]],
        ["team", ["/s1-1.webp"]],
      ]);
    });

    it("leaves both cards without art when the Bingo has none", () => {
      expect(artOf({})).toEqual([
        ["player", []],
        ["team", []],
      ]);
    });
  });

  it("badges the Team's rank and the Bingo's apart, and only the Team's in Wrapped published before the Bingo's was stored", () => {
    expect(playerCard().pointsShare).toEqual({ shareLabel: "42.13", teamPercentLabel: "34% of Team", teamRankLabel: "Team #1 of 8", bingoRankLabel: "Bingo #3 of 42" });
    expect(playerCard({ bingoRank: undefined, bingoPlayers: undefined }).pointsShare).toMatchObject({ teamRankLabel: "Team #1 of 8", bingoRankLabel: null });
  });

  it("words the share of the Team's points as a whole percent, a sliver as <1%", () => {
    const pct = (teamPointsFraction: number) => playerCard({ teamPointsFraction }).pointsShare!.teamPercentLabel;
    expect(pct(0.5)).toBe("50% of Team");
    expect(pct(0.996)).toBe("100% of Team");
    expect(pct(0.006)).toBe("1% of Team");
    expect(pct(0.004)).toBe("<1% of Team");
    expect(pct(0)).toBeNull();
  });

  it("reads the pick with the round the draft used, a Captain as Captain, and nothing for anyone else undrafted", () => {
    // 2 Teams: picks 1–2 are round 1, 3–4 round 2.
    expect(playerCard({ draft: { pickNumber: 1, position: 1 } }).draftLabel).toBe("Pick #1 · Round 1");
    expect(playerCard({ draft: { pickNumber: 2, position: 2 } }).draftLabel).toBe("Pick #2 · Round 1");
    expect(playerCard({ draft: { pickNumber: 3, position: 3 } }).draftLabel).toBe("Pick #3 · Round 2");
    const captain: WrappedCaptain = { teamId: "a", drafted: 4, picks: [] };
    expect(playerCard({}, { captain }).draftLabel).toBe("Captain");
    expect(playerCard().draftLabel).toBeNull();
  });

  it("fills the Player card: name, avatar, Team, Duo partner, Drop value, Submissions against the average, Achievements, EHB and the first 3 Titles", () => {
    const titles = ["Carry", "Closer", "Spoon", "Dry"].map((name) => ({ id: name.toLowerCase(), name, text: "x" }));
    const achievements = ["a", "b"].map((key) => ({ key, name: key, itemName: key, earnedAt: iso(3) }));
    const c = playerCard(
      { titles, submissions: 12, bingoAverageSubmissions: 4, achievements, wom: { ehb: 12.34, bosses: [], asOf: iso(30) } },
      { duo: { partner: u("pal"), combinedPointsShare: 50, myPointsShare: 42, partnerPointsShare: 8, rank: 1, duoCount: 2, pickNumber: 7 } },
    );
    expect(c).toMatchObject({ name: "me rsn", avatarUrl: opts.viewerAvatarUrl, team: { name: "Red", color: "#f00" }, partnerLabel: "with pal rsn", dropValueLabel: "1.5b" });
    expect(c.submissions).toEqual({ countLabel: "12", comparisonLabel: "3× avg" });
    expect(c.achievementsLabel).toBe("2");
    expect(c.ehbLabel).toBe("12.3");
    expect(c.titles.map((t) => t.name)).toEqual(["Carry", "Closer", "Spoon"]);
  });

  it("shows one top drop and one luckiest drop, and a drop that's both once, tagged as both", () => {
    const tbow = drop("s1", { luckOneIn: 3000 });
    const pet = drop("s2", { itemName: "Pet snakeling", gpValue: null, luckOneIn: 5000 });
    const c = playerCard({ topDrops: [tbow, drop("s3", { gpValue: 5_000_000 })], luckiestDrop: pet });
    expect(c.topDrop).toMatchObject({ itemName: "Twisted bow", gpLabel: "1.2b", iconUrl: "/wiki-icons/Twisted%20bow.png", isLuckiest: false, luckLabel: null });
    expect(c.luckiestDrop).toMatchObject({ itemName: "Pet snakeling", gpLabel: null, luckLabel: "1 in 5,000" });

    const same = playerCard({ topDrops: [tbow], luckiestDrop: tbow });
    expect(same.topDrop).toMatchObject({ itemName: "Twisted bow", isLuckiest: true, luckLabel: "1 in 3,000" });
    expect(same.luckiestDrop).toBeNull();
  });

  it("leaves out each part of the Player card without data, and the card itself with nothing to show", () => {
    const c = card(response(player({ gpGained: 3_000_000, wom: { ehb: 0, bosses: [], asOf: iso(30) } })), "player")!;
    expect(c).toMatchObject({ partnerLabel: null, draftLabel: null, pointsShare: null, submissions: null, achievementsLabel: null, ehbLabel: null, titles: [], topDrop: null, luckiestDrop: null, driestStreak: null, dropValueLabel: "3m" });

    expect(cardsOf(response(player())).map((c) => c.kind)).toEqual(["team"]);
  });

  it("compares the Player card's Submissions with the Bingo average whether above or below it", () => {
    const vs = (submissions: number, bingoAverageSubmissions: number) => playerCard({ submissions, bingoAverageSubmissions }).submissions;
    expect(vs(12, 4)).toEqual({ countLabel: "12", comparisonLabel: "3× avg" });
    expect(vs(4, 4)).toEqual({ countLabel: "4", comparisonLabel: "1× avg" });
    expect(vs(2, 4)).toEqual({ countLabel: "2", comparisonLabel: "0.5× avg" });
    expect(vs(1, 40)).toEqual({ countLabel: "1", comparisonLabel: "<0.1× avg" });
    expect(vs(3, 0)).toEqual({ countLabel: "3", comparisonLabel: null });
  });

  it("fills the Team card with its placement, points, Tiles and lines, Drop value, MVP with its part of the Team, and biggest drop", () => {
    const data = response(scored());
    const red = data.bingo.teams[1]!;
    red.biggestDrop = drop("s5", { player: u("pal"), itemName: "Tumeken's shadow (uncharged)" });
    red.dropValue = 3_400_000_000;
    red.mvp = { player: u("me"), pointsShare: 40.5, teamPointsFraction: 0.271 };
    expect(card(data, "team")).toMatchObject({
      name: "Red",
      color: "#f00",
      placement: 2,
      placementLabel: "2nd of 2",
      pointsLabel: "200",
      tilesCompleted: 4,
      linesCompleted: 1,
      dropValueLabel: "3.4b",
      mvp: { person: { name: "me rsn", isYou: true }, shareLabel: "40.5", teamPercentLabel: "27% of Team" },
      biggestDrop: { itemName: "Tumeken's shadow (uncharged)", gpLabel: "1.2b", player: { name: "pal rsn" } },
      superlatives: [],
    });
  });

  it("leaves the Team's Drop value and MVP percent out of Wrapped published before they were stored", () => {
    expect(card(response(scored()), "team")).toMatchObject({ dropValueLabel: null, mvp: { shareLabel: "40.5", teamPercentLabel: null } });
  });

  it("shows the first 3 of a Team's Superlatives, in the Bingo's order, tied winners together", () => {
    const data = response(scored());
    data.bingo.teams[1]!.superlatives = [
      { category: "Team Spirit", winners: [u("pal"), u("me")] },
      { category: "The Grinder", winners: [u("me")] },
      { category: "Yapper", winners: [u("pal")] },
      { category: "From before the cap", winners: [u("me")] },
    ];
    const sups = card(data, "team")!.superlatives;
    expect(sups.map((s) => s.category)).toEqual(["Team Spirit", "The Grinder", "Yapper"]);
    expect(sups[0]!.winners.map((w) => w.name)).toEqual(["pal rsn", "me rsn"]);
    // The story's Team section still shows every one.
    const team = story(data).sections.find((s) => s.id === "team")!.section as WrappedTeamModel;
    expect(team.superlatives).toHaveLength(4);
  });

  it("offers the jump to the cards only when the Outro was reached on an earlier visit", () => {
    expect(story(response(null)).outroReachedBefore).toBe(false);
    expect(buildWrappedStory(response(null), { ...opts, outroReachedBefore: true }, actions, "winter").outroReachedBefore).toBe(true);
  });
});
