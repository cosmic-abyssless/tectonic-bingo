import { describe, expect, it } from "vitest";
import type { AvatarUser, BingoWrapped, MyWrappedResponse, PlayerWrapped, WrappedCaptain, WrappedDrop, WrappedDuo, WrappedYou } from "@bingo/shared";
import type { WrappedOutroModel, WrappedShareCardModel } from "./types";
import { aboveAverage, buildWrappedStory, carriedBanter, draftGrade, dropLuck, ordinal, rateLabel, rejectionBanter, shortDuration } from "./wrappedModel";

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
  return { state: { published: true, publishedAt: iso(48), publishOnFinish: false, pendingSubmissions: 0 }, preview: false, bingo: bingo(), player, moderator: null, art: { sections: {}, additionalCredits: {}, side: [] }, ...extra };
}

const player = (you: Partial<WrappedYou> = {}): PlayerWrapped => ({ userId: "me", teamId: "a", you: { ...emptyYou, ...you }, duo: null, captain: null });
const opts = { viewerId: "me", viewerName: "me rsn", viewerAvatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png", startsAt: T0, endsAt: T0 + 24 * HOUR, siteLabel: "tectonic.bingo" };
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
      response(player({ submissions: 5 }), { art: { sections: { intro: [piece("intro")], team: [piece("team"), piece("team2")], duo: [piece("duo")] }, additionalCredits: {}, side: [frames("side")] } }),
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
    expect(kinds(response(player(), { art: { sections: { you: [{ frames, credit: null }] }, additionalCredits: {}, side: [] } }))).toEqual(["intro", "team", "bingo", "outro"]);
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
    expect(b.race?.series[0]!.points[0]).toEqual({ t: T0, points: 0 });
    expect(b.race?.series[0]!.points.at(-1)).toEqual({ t: T0 + 24 * HOUR, points: 300 });
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
  const scored = (you: Partial<WrappedYou> = {}) => player({ submissions: 3, pointsShare: 42.125, teamRank: 1, teamSize: 8, bingoRank: 3, bingoPlayers: 42, gpGained: 1_500_000_000, ...you });

  it("gives a Player their Player, Team and Bingo cards, and anyone else the Bingo card only", () => {
    expect(cardsOf(response(scored())).map((c) => c.kind)).toEqual(["player", "team", "bingo"]);
    expect(cardsOf(response(null)).map((c) => c.kind)).toEqual(["bingo"]);
  });

  it("footers every card with the Bingo and the site, and names its file", () => {
    for (const c of cardsOf(response(scored()))) {
      expect(c.bingoName).toBe("Winter Bingo");
      expect(c.siteLabel).toBe("tectonic.bingo");
      expect(c.fileName).toBe(`winter-wrapped-${c.kind}.png`);
    }
  });

  it("reads a Player's ranks as the Bingo's then the Team's, and only the Team's in Wrapped published before the Bingo's was stored", () => {
    expect(card(response(scored()), "player")!.pointsShare).toEqual({ shareLabel: "42.13", rankLabel: "#3 of 42 · #1 of 8 on Team" });
    expect(card(response(scored({ bingoRank: undefined, bingoPlayers: undefined })), "player")!.pointsShare!.rankLabel).toBe("#1 of 8 on Team");
  });

  it("fills the Player card: name, avatar, Team, Duo partner, pick, Drop value, up to 3 Titles and top drops", () => {
    const titles = ["Carry", "Closer", "Spoon", "Dry"].map((name) => ({ id: name.toLowerCase(), name, text: "x" }));
    const drops = [drop("s1"), drop("s2", { itemName: "Elysian sigil", quantity: 2, gpValue: 700_000_000 }), drop("s3", { gpValue: 5_000_000 }), drop("s4", { gpValue: 1_000_000 })];
    const data = response({
      ...scored({ titles, topDrops: drops, draft: { pickNumber: 7, position: 9 }, driestStreak: { boss: "Vorkath", kills: 191, oneIn: 30 } }),
      duo: { partner: u("pal"), combinedPointsShare: 50, myPointsShare: 42, partnerPointsShare: 8, rank: 1, duoCount: 2, pickNumber: 7 },
    });
    const c = card(data, "player")!;
    expect(c).toMatchObject({ name: "me rsn", avatarUrl: opts.viewerAvatarUrl, team: { name: "Red", color: "#f00" }, partnerLabel: "with pal rsn", pickLabel: "Pick #7", dropValueLabel: "1.5b" });
    expect(c.titles.map((t) => t.name)).toEqual(["Carry", "Closer", "Spoon"]);
    expect(c.topDrops.map((d) => [d.itemName, d.quantityLabel, d.gpLabel, d.iconUrl])).toEqual([
      ["Twisted bow", null, "1.2b", "/wiki-icons/Twisted%20bow.png"],
      ["Elysian sigil", "×2", "700m", "/wiki-icons/Elysian%20sigil.png"],
      ["Twisted bow", null, "5m", "/wiki-icons/Twisted%20bow.png"],
    ]);
    expect(c.driestStreak).toEqual({ boss: "Vorkath", killsLabel: "191 kills", chanceLabel: "1 in 30" });
  });

  it("leaves out each part of the Player card without data, and the card itself with nothing to show", () => {
    const c = card(response(player({ gpGained: 3_000_000 })), "player")!;
    expect(c).toMatchObject({ partnerLabel: null, pickLabel: null, pointsShare: null, titles: [], topDrops: [], driestStreak: null, dropValueLabel: "3m" });
    expect(cardsOf(response(player())).map((c) => c.kind)).toEqual(["team", "bingo"]);
  });

  it("fills the Team card with its placement, points, Tiles and lines, MVP and biggest drop", () => {
    const data = response(scored());
    data.bingo.teams[1]!.biggestDrop = drop("s5", { player: u("pal"), itemName: "Tumeken's shadow (uncharged)" });
    expect(card(data, "team")).toMatchObject({
      name: "Red",
      color: "#f00",
      placement: 2,
      placementLabel: "2nd of 2",
      pointsLabel: "200",
      tilesCompleted: 4,
      linesCompleted: 1,
      mvp: { person: { name: "me rsn", isYou: true }, shareLabel: "40.5" },
      biggestDrop: { itemName: "Tumeken's shadow (uncharged)", gpLabel: "1.2b", player: { name: "pal rsn" } },
    });
  });

  it("fills the Bingo card: the winner (every Team tied for first), totals, rarest drop with its Player, and the biggest Steal", () => {
    const data = response(null);
    data.bingo.biggestSteal = { player: u("pal"), teamId: "a", pickNumber: 9, position: 12, rank: 2, placesBeaten: 10 };
    expect(card(data, "bingo")).toMatchObject({
      winners: [{ name: "Blue", color: "#f00" }],
      winnerPointsLabel: "300",
      totalGpLabel: "5b",
      submissionsLabel: "120",
      rarestDrop: { itemName: "Twisted bow", chanceLabel: "1 in 90,000", player: { name: "me rsn" } },
      steal: { person: { name: "pal rsn" }, pickLabel: "Pick #9", rankLabel: "2nd", placesBeatenLabel: "10 places" },
    });
    data.bingo.teams[1]!.placement = 1;
    expect(card(data, "bingo")!.winners.map((w) => w.name)).toEqual(["Blue", "Red"]);
  });

  it("leaves out the Bingo card's parts without data, and the card with nothing at all", () => {
    const data = response(null);
    data.bingo.rarestDrop = drop("s9", { luckOneIn: null });
    expect(card(data, "bingo")).toMatchObject({ rarestDrop: null, steal: null });
    const empty = response(null, { bingo: { ...bingo(), teams: [], totalGp: 0, totalSubmissions: 0, rarestDrop: null } });
    expect(cardsOf(empty)).toEqual([]);
  });

  it("offers the jump to the cards only when the Outro was reached on an earlier visit", () => {
    expect(story(response(null)).outroReachedBefore).toBe(false);
    expect(buildWrappedStory(response(null), { ...opts, outroReachedBefore: true }, actions, "winter").outroReachedBefore).toBe(true);
  });
});
