import { describe, expect, it } from "vitest";
import type { AvatarUser, BingoWrapped, MyWrappedResponse, PlayerWrapped, WrappedDrop, WrappedYou } from "@bingo/shared";
import { aboveAverage, buildWrappedStory, dropLuck, ordinal, rateLabel, rejectionBanter, shortDuration } from "./wrappedModel";

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
  return { state: { published: true, publishedAt: iso(48), publishOnFinish: false, pendingSubmissions: 0 }, preview: false, bingo: bingo(), player, moderator: null, ...extra };
}

const player = (you: Partial<WrappedYou> = {}): PlayerWrapped => ({ userId: "me", teamId: "a", you: { ...emptyYou, ...you }, duo: null, captain: null });
const opts = { viewerId: "me", viewerName: "me rsn", startsAt: T0, endsAt: T0 + 24 * HOUR };
const actions = { goToBoard: () => {}, goToRewind: () => {} };
const story = (data: MyWrappedResponse) => buildWrappedStory(data, opts, actions, "winter");
const kinds = (data: MyWrappedResponse) => story(data).sections.map((s) => s.id);

describe("buildWrappedStory", () => {
  it("tells a Player intro → You → Team → Bingo → outro", () => {
    expect(kinds(response(player({ submissions: 5, pointsShare: 12 })))).toEqual(["intro", "you", "team", "bingo", "outro"]);
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

  it("skips the You section when it has nothing to say, and each part of it that has nothing", () => {
    expect(kinds(response(player()))).toEqual(["intro", "team", "bingo", "outro"]);

    const petOnly = drop("s1", { itemName: "Pet", gpValue: null, luckOneIn: 1.2 });
    const you = story(response(player({ submissions: 1, topDrops: [petOnly], luckiestDrop: petOnly, firstDrop: petOnly, lastDrop: petOnly, wom: { ehb: 0, bosses: [{ metric: "zulrah", name: "Zulrah", kills: 0 }], asOf: iso(24) } }))).sections.find((s) => s.id === "you")!.section;
    if (you.kind !== "you") throw new Error("not you");
    // A drop with no GP value isn't a "top drop"; below 1 in 2 isn't lucky; no WOM gains; one drop has no "last".
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
  });
});
