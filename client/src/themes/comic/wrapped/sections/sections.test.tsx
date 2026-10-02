// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { WrappedBingoModel, WrappedChartModel, WrappedDropModel, WrappedPersonModel, WrappedSectionArtModel, WrappedTeamModel } from "../../../../headless/types";
import { WrappedTeam as DefaultTeam } from "../../../default/wrapped/WrappedTeam";
import { WrappedBingo as DefaultBingo } from "../../../default/wrapped/WrappedBingo";
import { createWrappedProgressStore, WrappedProgressProvider } from "../../../../core/wrapped/sceneProgress";
import { ComicReveal } from "../ComicReveal";
import { WrappedTeam } from "./WrappedTeam";
import { WrappedBingo } from "./WrappedBingo";

afterEach(cleanup);

// jsdom has no matchMedia, which the colour scheme and reduced motion read.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
});

// The comic sections redraw the default sections' lines and change nothing they say (#421): every text the default section
// draws is in the comic one, in the same order, for a full model and for ones missing a field.

const person = (n: number, isYou = false): WrappedPersonModel => ({ id: `p${n}`, name: `Player${n}`, avatarUrl: `/a${n}.png`, isYou });
const drop = (key: string, item: string): WrappedDropModel => ({ key, itemName: item, quantityLabel: "×2", gpLabel: "12.3m", luck: { chanceLabel: "1 in 14", rateLabel: "1/512", killsLabel: "37 kills", shortLabel: "1/512 in 37 kills", sentence: "A 1/512 drop in 37 kills. Only 1 in 14 get it that fast." }, player: person(1), team: { name: "Red Team", color: "#ff0000" }, whenLabel: "Sat 14 Mar, 21:04", thumbnailUrl: null, screenshotUrl: null });
const art = (images = 0): WrappedSectionArtModel => ({ images: Array.from({ length: images }, (_, i) => ({ frames: [`/f${i}a.png`, `/f${i}b.png`] as [string, string], name: i === 0 ? `Artist${i}` : null, role: null })), credits: images ? [{ name: "Extra Credit", role: "Art" }] : [] });
const chart = (): WrappedChartModel => ({ start: 0, end: 1000, maxPoints: 100, series: [{ teamId: "t1", name: "Red Team", color: "#ff0000", isMine: true, points: [{ t: 0, points: 0, event: null }, { t: 500, points: 40, event: null }, { t: 1000, points: 100, event: null }] }] });

const team = (over: Partial<WrappedTeamModel> = {}): WrappedTeamModel => ({
  kind: "team",
  art: art(2),
  name: "Red Team",
  color: "#ff0000",
  placement: 1,
  placementLabel: "1st of 4",
  teamCount: 4,
  pointsLabel: "310",
  tilesCompleted: 7,
  linesCompleted: 3,
  mvp: { person: person(1, true), shareLabel: "42%" },
  topGpEarner: { person: person(2), gpLabel: "255m" },
  biggestDrop: drop("d1", "Twisted bow"),
  chart: chart(),
  superlatives: [{ category: "Team MVP", winners: [person(3), person(4)] }, { category: "The Grinder", winners: [person(5)] }],
  ...over,
});

const bingo = (over: Partial<WrappedBingoModel> = {}): WrappedBingoModel => ({
  kind: "bingo",
  art: art(1),
  totalSubmissions: 64,
  totalSubmissionsLabel: "64",
  totalGpLabel: "1.4b",
  rarestDrop: drop("r1", "Jar of souls"),
  mostReacted: { drop: drop("m1", "Dragon warhammer"), reactionsLabel: "6 reactions" },
  leaderboard: [
    { teamId: "t1", name: "Red Team", color: "#ff0000", placement: 1, placementLabel: "1st", pointsLabel: "330", isMine: true },
    { teamId: "t2", name: "Blue Team", color: "#0000ff", placement: 2, placementLabel: "2nd", pointsLabel: "245", isMine: false },
  ],
  race: chart(),
  steal: { person: person(6), teamName: "Blue Team", positionLabel: "24th", rankLabel: "4th", placesBeatenLabel: "20 places" },
  moderation: {
    reviewedLabel: "64 reviews",
    medianLabel: "2 h 57 min",
    fastestLabel: "6 min",
    withinHourLabel: "27%",
    busiestHourLabel: "4 AM",
    topReviewer: { person: person(7), reviewedLabel: "40 reviews" },
    reviewers: [{ person: person(7), rejectionLabel: "13%", reviewedLabel: "40 reviews" }, { person: person(8), rejectionLabel: "25%", reviewedLabel: "24 reviews" }],
    banter: "Somebody had to deal with the nonsense.",
    art: art(2),
  },
  teamSuperlatives: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ teamId: `t${n}`, teamName: `Team ${n}`, color: null, superlatives: [{ category: "Team MVP", winners: [person(n)] }] })),
  ...over,
});

/** The draw of a section's page text: each text node, in order, lowercased with all but letters and digits dropped. */
function lines(ui: ReactElement): string[] {
  const store = createWrappedProgressStore();
  const { container, unmount } = render(
    <WrappedProgressProvider source={store} reveal={ComicReveal}>
      {ui}
    </WrappedProgressProvider>,
  );
  const out: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    // What a screen reader skips (the sound effects) isn't one of the section's lines.
    if ((n.parentElement as HTMLElement).closest("[aria-hidden='true']")) continue;
    const t = (n.textContent ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (t) out.push(t);
  }
  unmount();
  return out;
}

/** Every line of `base` is in `comic`, in order (the comic may letter more between them, never fewer). */
function expectContainsInOrder(base: string[], comic: string[]) {
  const text = comic.join("");
  let from = 0;
  for (const line of base) {
    const at = text.indexOf(line, from);
    expect(at, `"${line}" missing or out of order in the comic section`).toBeGreaterThanOrEqual(0);
    from = at + line.length;
  }
}

describe("the comic Team section keeps the default's lines, in order", () => {
  const cases: [string, WrappedTeamModel][] = [
    ["a full Team", team()],
    ["no art, no colour", team({ art: art(0), color: null })],
    ["no MVP or top drop value", team({ mvp: null, topGpEarner: null })],
    ["only a top drop value", team({ mvp: null })],
    ["no biggest drop, chart or superlatives", team({ biggestDrop: null, chart: null, superlatives: [] })],
    ["only the climb", team({ biggestDrop: null, superlatives: [] })],
    ["a last-place Team with one Tile and one Line", team({ placement: 4, placementLabel: "4th of 4", tilesCompleted: 1, linesCompleted: 1 })],
  ];
  for (const [name, model] of cases) {
    it(name, () => {
      const base = lines(<DefaultTeam section={model} />);
      expect(base.length).toBeGreaterThan(3);
      expectContainsInOrder(base, lines(<WrappedTeam section={model} />));
    });
  }
});

describe("the comic Bingo section keeps the default's lines, in order", () => {
  const cases: [string, WrappedBingoModel][] = [
    ["a full Bingo", bingo()],
    ["no art", bingo({ art: art(0), moderation: { ...bingo().moderation!, art: art(0) } })],
    ["nothing moderated, no Steal", bingo({ moderation: null, steal: null })],
    ["no race, no rarest drop, no crowd favourite", bingo({ race: null, rarestDrop: null, mostReacted: null })],
    ["a rarest drop with no Luck", bingo({ rarestDrop: { ...drop("r2", "Pet rock"), luck: null }, mostReacted: null })],
    ["moderation with no wait stats or banter", bingo({ moderation: { ...bingo().moderation!, medianLabel: null, fastestLabel: null, withinHourLabel: null, busiestHourLabel: null, banter: null, topReviewer: null } })],
    ["moderation with no reviewers", bingo({ moderation: { ...bingo().moderation!, reviewers: [], banter: null, topReviewer: null } })],
    ["no Superlatives", bingo({ teamSuperlatives: [] })],
    ["only the leaderboard and totals", bingo({ race: null, rarestDrop: null, mostReacted: null, steal: null, moderation: null, teamSuperlatives: [] })],
  ];
  for (const [name, model] of cases) {
    it(name, () => {
      const base = lines(<DefaultBingo section={model} />);
      expect(base.length).toBeGreaterThan(3);
      expectContainsInOrder(base, lines(<WrappedBingo section={model} />));
    });
  }

  it("draws one Scene per page and a Reveal per panel, none left empty", () => {
    const store = createWrappedProgressStore();
    const { container, unmount } = render(
      <WrappedProgressProvider source={store} reveal={ComicReveal}>
        <WrappedBingo section={bingo()} />
      </WrappedProgressProvider>,
    );
    const scenes = [...container.querySelectorAll("[data-wrapped-scene]")];
    // Everyone; the highlights; the Steal and Behind the scenes; the reviewers and the first two Teams; the other five Teams over two pages.
    expect(scenes.length).toBe(6);
    for (const scene of scenes) {
      const steps = [...scene.querySelectorAll("[data-wrapped-step]")].map((el) => Number((el as HTMLElement).dataset.wrappedStep));
      expect(steps.length).toBeGreaterThan(0);
      // Steps count up from 0 with no gap, so the camera has a stop for every panel.
      const unique = [...new Set(steps)].sort((a, b) => a - b);
      expect(unique).toEqual(unique.map((_, i) => i));
    }
    unmount();
  });
});
