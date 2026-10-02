// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { WrappedCaptainModel, WrappedDropModel, WrappedDuoModel, WrappedModeratorModel, WrappedPersonModel, WrappedSectionArtModel, WrappedYouModel } from "../../../../headless/types";
import { createWrappedProgressStore, WrappedProgressProvider } from "../../../../core/wrapped/sceneProgress";
import { WrappedCaptain as DefaultCaptain } from "../../../default/wrapped/WrappedCaptain";
import { WrappedDuo as DefaultDuo } from "../../../default/wrapped/WrappedDuo";
import { WrappedModerator as DefaultModerator } from "../../../default/wrapped/WrappedModerator";
import { WrappedYou as DefaultYou } from "../../../default/wrapped/WrappedYou";
import { ComicReveal } from "../ComicReveal";
import { WrappedCaptain } from "./WrappedCaptain";
import { WrappedDuo } from "./WrappedDuo";
import { WrappedModerator } from "./WrappedModerator";
import { WrappedYou } from "./WrappedYou";

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no matchMedia, which the colour scheme (and reduced motion) read.
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
});

// What the comic sections must keep (#420): every line of the default section, in its order, and nothing drawn for a part the
// model leaves out. The default sections are the reference, so the two can't drift apart in what they say.

const NO_ART: WrappedSectionArtModel = { images: [], credits: [] };
const ART: WrappedSectionArtModel = { images: [{ frames: ["/a.webp", "/b.webp"], name: null, role: null }], credits: [{ name: "Ink Pot", role: "Inks" }] };

const person = (id: string, name: string, isYou = false): WrappedPersonModel => ({ id, name, avatarUrl: `/${id}.png`, isYou });
const me = person("me", "Silent", true);
const pal = person("pal", "Nimble");

const drop = (key: string, itemName: string, over: Partial<WrappedDropModel> = {}): WrappedDropModel => ({
  key,
  itemName,
  quantityLabel: null,
  gpLabel: "12.3m",
  luck: { chanceLabel: "1 in 14", rateLabel: "1/512", killsLabel: "37 kills", shortLabel: "1/512 in 37 kills", sentence: "A 1/512 drop in 37 kills. Only 1 in 14 get it that fast." },
  player: me,
  team: { name: "Reds", color: "#f00" },
  whenLabel: "Sat 14 Mar, 21:04",
  thumbnailUrl: "/t.png",
  screenshotUrl: "/s.png",
  ...over,
});

const fullYou: WrappedYouModel = {
  kind: "you",
  art: ART,
  submissions: { countLabel: "42 Submissions", comparison: "3.2× the average Player" },
  points: { shareLabel: "100.58", comparison: "4× the average Player", teamPercentLabel: "30% of your Team's points", rankLabel: "2nd on your Team", isTop: true },
  gp: { gainedLabel: "187m", buyInLabel: "10m", coveredBuyIn: true },
  topDrops: [drop("t1", "Twisted bow", { quantityLabel: "×2" }), drop("t2", "Scythe of vitur")],
  luckiestDrop: drop("l", "Vorki"),
  driestStreak: { boss: "Chambers of Xeric", killsLabel: "191 kills", rateLabel: "1/57", chanceLabel: "1 in 30" },
  firstLast: { first: drop("f", "Pegasian crystal"), last: drop("z", "Vorki") },
  mostActiveDay: { dateLabel: "Sunday, 27 September", submissionsLabel: "7 Submissions", drops: [1, 2, 3, 4, 5, 6, 7].map((n) => drop(`d${n}`, `Item ${n}`)) },
  titles: [
    { id: "carry", name: "Carry", text: "30% of the team's points" },
    { id: "spoon", name: "Spoon", text: "A 1 in 14 drop" },
  ],
  achievements: [
    { key: "a", name: "First Blood", itemName: "Bronze sword", description: "Get a drop", earnedLabel: "22 Sep" },
    { key: "b", name: "Night Owl", itemName: "Rune scimitar", description: null, earnedLabel: "26 Sep" },
  ],
  wom: { ehbLabel: "42.6", bosses: [{ name: "Vorkath", killsLabel: "494 kills" }] },
  draft: { pickLabel: "Pick 7", positionLabel: "13th" },
};

const fullDuo: WrappedDuoModel = {
  kind: "duo",
  art: ART,
  partner: pal,
  combinedShareLabel: "100.57",
  rankLabel: "3rd of 24 Duos",
  isTop: false,
  split: { myPercent: 58, partnerPercent: 42, myShareLabel: "58.27", partnerShareLabel: "42.3" },
  carried: "You carried Nimble. They owe you one.",
  pickLabel: "Pick 19",
  moments: [{ key: "m1", label: "Both on Vorkath", mine: drop("m1a", "Vorki"), theirs: drop("m1b", "Dragonbone necklace", { player: pal }) }],
};

const fullCaptain: WrappedCaptainModel = {
  kind: "captain",
  art: ART,
  picks: [
    { key: "5", pickLabel: "Pick 5", people: [person("a", "Bandit"), person("b", "Pker")], positionLabel: "Drafted 9th", rankLabel: "Finished 23rd", beat: false },
    { key: "44", pickLabel: "Pick 44", people: [person("c", "Pilot")], positionLabel: "Drafted 62nd", rankLabel: "Finished 2nd", beat: true },
    { key: "53", pickLabel: "Pick 53", people: [person("d", "Runner")], positionLabel: "Drafted 71st", rankLabel: null, beat: false },
  ],
  steal: { people: [person("c", "Pilot")], pickLabel: "Pick 44", positionLabel: "62nd", rankLabel: "2nd", placesBeatenLabel: "60 places" },
  grade: { letter: "A", line: "Picked like a seasoned scout." },
};

const fullModerator: WrappedModeratorModel = { kind: "moderator", art: ART, name: "Nimble", reviewedLabel: "42 Submissions", medianLabel: "1 h 31 min", rejectionLabel: "0%", banter: "Not a single rejection." };

/** Renders a section the way the book does: its Reveals in the page's own provider, drawn as panels (the default's as plain divs). */
function draw(section: ReactElement, comic: boolean): HTMLElement {
  const store = createWrappedProgressStore();
  const { container } = render(<WrappedProgressProvider source={store} reveal={comic ? ComicReveal : undefined}>{section}</WrappedProgressProvider>);
  return container;
}

/** The words a section says, as the strings its text nodes hold, trimmed and without the empty ones. */
function lines(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  }
  return out;
}

/** Whether `needles` all appear in `haystack` (a joined text), each after the one before. */
function inOrder(needles: string[], haystack: string): string | null {
  let from = 0;
  for (const needle of needles) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return needle;
    from = at + needle.length;
  }
  return null;
}

const CASES: { name: string; comic: ReactElement; reference: ReactElement }[] = [
  { name: "You", comic: <WrappedYou section={fullYou} />, reference: <DefaultYou section={fullYou} /> },
  { name: "You without art", comic: <WrappedYou section={{ ...fullYou, art: NO_ART }} />, reference: <DefaultYou section={{ ...fullYou, art: NO_ART }} /> },
  { name: "Duo", comic: <WrappedDuo section={fullDuo} />, reference: <DefaultDuo section={fullDuo} /> },
  { name: "Captain", comic: <WrappedCaptain section={fullCaptain} />, reference: <DefaultCaptain section={fullCaptain} /> },
  { name: "Moderator", comic: <WrappedModerator section={fullModerator} />, reference: <DefaultModerator section={fullModerator} /> },
  { name: "Moderator without art", comic: <WrappedModerator section={{ ...fullModerator, art: NO_ART }} />, reference: <DefaultModerator section={{ ...fullModerator, art: NO_ART }} /> },
];

describe("the comic's You, Duo, Captain and Moderator pages", () => {
  for (const { name, comic, reference } of CASES) {
    it(`${name} says every line of the default section, in its order`, () => {
      const expected = lines(draw(reference, false));
      cleanup();
      const got = lines(draw(comic, true));
      const missing = inOrder(expected, got.join("\n"));
      expect(missing, `missing or out of order: ${missing}`).toBeNull();
    });
  }

  it("draws a panel only for a part with something to say", () => {
    const sparse: WrappedYouModel = { ...fullYou, art: NO_ART, submissions: { countLabel: "1 Submission", comparison: null }, points: null, gp: null, topDrops: [], luckiestDrop: null, driestStreak: null, firstLast: null, mostActiveDay: null, titles: [], achievements: [], wom: null, draft: null };
    const root = draw(<WrappedYou section={sparse} />, true);
    expect(root.querySelectorAll(".wrapped-panel")).toHaveLength(1);
    // One page: the second is for the story's later parts, which this Player has none of.
    expect(root.querySelectorAll("[data-wrapped-scene]")).toHaveLength(1);
    for (const panel of root.querySelectorAll(".wrapped-panel")) expect(panel.textContent?.trim()).not.toBe("");
  });

  it("splits You into four pages, and a Duo's moments onto a second", () => {
    expect(draw(<WrappedYou section={fullYou} />, true).querySelectorAll("[data-wrapped-scene]")).toHaveLength(4);
    cleanup();
    expect(draw(<WrappedDuo section={fullDuo} />, true).querySelectorAll("[data-wrapped-scene]")).toHaveLength(2);
    cleanup();
    expect(draw(<WrappedDuo section={{ ...fullDuo, moments: [] }} />, true).querySelectorAll("[data-wrapped-scene]")).toHaveLength(1);
  });

  it("leaves a Duo with nothing scored without a split or banter, and a Captain with no Steal or grade on one page", () => {
    const quiet = draw(<WrappedDuo section={{ ...fullDuo, split: null, carried: null, moments: [], rankLabel: null, pickLabel: null }} />, true);
    expect(quiet.textContent).not.toContain("Nimble carried");
    expect(quiet.querySelectorAll(".wrapped-panel")).toHaveLength(2);
    cleanup();
    const bare = draw(<WrappedCaptain section={{ ...fullCaptain, steal: null, grade: null }} />, true);
    expect(bare.querySelectorAll("[data-wrapped-scene]")).toHaveLength(1);
  });

  it("never singles out a pick that didn't beat its spot", () => {
    const root = draw(<WrappedCaptain section={fullCaptain} />, true);
    const text = root.textContent ?? "";
    expect(text).not.toMatch(/bust/i);
    // Only the pick that finished above its draft position carries a star.
    expect((text.match(/★/g) ?? []).length).toBe(1);
  });

  it("numbers every panel's step from 0 with none skipped", () => {
    for (const { comic } of CASES) {
      const root = draw(comic, true);
      for (const scene of root.querySelectorAll("[data-wrapped-scene]")) {
        const steps = [...new Set([...scene.querySelectorAll<HTMLElement>(".wrapped-panel")].map((p) => Number(p.dataset.wrappedStep)))].sort((a, b) => a - b);
        expect(steps).toEqual(steps.map((_, i) => i));
      }
      cleanup();
    }
  });
});
