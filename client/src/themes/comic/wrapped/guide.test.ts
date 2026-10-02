import { describe, expect, it } from "vitest";
import { buildPages, CONTENTS_SECTION, isAfter, nextStop, pageInSection, pageStart, panelPlace, PULL, prevStop, pullsBack, reachedAfter, sectionIds, sectionOfAnchor, sectionStart, withGroups, type GuideScene, type Stop } from "./guide";
import { deskGroups } from "./desk";

const scene = (id: string, sectionId: string, panels: number[], steps = panels.length): GuideScene => ({ id, sectionId, steps, panels });

// A book: the cover, the contents page, You (two pages, the first leaving step 1 out), Team, and an Outro of three pages
// (two share cards, then the back cover).
const scenes: GuideScene[] = [
  scene("c", "intro", [0]),
  scene("t", CONTENTS_SECTION, [0]),
  scene("y1", "you", [0, 2], 3),
  scene("y2", "you", [0, 1]),
  scene("tm", "team", [0, 1, 2]),
  scene("o1", "outro", [0]),
  scene("o2", "outro", [0]),
  scene("o3", "outro", [0, 1, 2]),
];
const labels = { you: "You", team: "Your Team", outro: "The end" };
const pages = buildPages(scenes, labels);

describe("buildPages", () => {
  it("makes the Intro the front cover, adds the contents page, and the Outro's last page the back cover", () => {
    expect(pages.map((p) => p.kind)).toEqual(["cover", "contents", "page", "page", "page", "page", "page", "back"]);
  });

  it("numbers the pages from the contents page, leaving the covers unnumbered", () => {
    expect(pages.map((p) => p.no)).toEqual([null, 1, 2, 3, 4, 5, 6, null]);
  });

  it("names each page for its footer", () => {
    expect(pages[1]!.role).toBe("In this issue");
    expect(pages[2]!.role).toBe("You");
    expect(pages[4]!.role).toBe("Your Team");
    expect(buildPages([scene("x", "mystery", [0])], {})[0]!.role).toBe("mystery");
  });

  it("takes a page with no Reveals as one panel, and sorts and dedupes the ones it has", () => {
    expect(buildPages([scene("a", "you", [], 2)], labels)[0]!.panels).toEqual([0]);
    expect(buildPages([scene("a", "you", [2, 0, 2, 1])], labels)[0]!.panels).toEqual([0, 1, 2]);
  });
});

describe("moving through the book", () => {
  it("goes through every panel of every page, front to back, and out the other side", () => {
    const seen: string[] = [];
    let at = pageStart(pages, 0)!;
    for (;;) {
      seen.push(`${at.page}.${at.step}`);
      const next = nextStop(pages, at);
      if (!next) break;
      at = next;
    }
    // Each page alone (as on a phone), so a page of more than one panel ends in its pull-back (step -1).
    expect(seen).toEqual(["0.0", "1.0", "2.0", "2.2", "2.-1", "3.0", "3.1", "3.-1", "4.0", "4.1", "4.2", "4.-1", "5.0", "6.0", "7.0", "7.1", "7.2", "7.-1"]);
  });

  it("skips the steps a page has no Reveal at (page 2 has none at step 1)", () => {
    expect(nextStop(pages, { page: 2, step: 0 })).toEqual({ page: 2, step: 2 });
    expect(prevStop(pages, { page: 2, step: 2 })).toEqual({ page: 2, step: 0 });
  });

  it("goes back to the last panel of the page before, and stops at the start", () => {
    expect(prevStop(pages, { page: 3, step: 0 })).toEqual({ page: 2, step: PULL });
    expect(prevStop(pages, { page: 7, step: 0 })).toEqual({ page: 6, step: 0 });
    expect(prevStop(pages, { page: 1, step: 0 })).toEqual({ page: 0, step: 0 });
    expect(prevStop(pages, { page: 0, step: 0 })).toBeNull();
    expect(nextStop(pages, { page: 7, step: PULL })).toBeNull();
  });

  it("finds a section's first panel", () => {
    expect(sectionStart(pages, "you")).toEqual({ page: 2, step: 0 });
    expect(sectionStart(pages, "team")).toEqual({ page: 4, step: 0 });
    expect(sectionStart(pages, CONTENTS_SECTION)).toEqual({ page: 1, step: 0 });
    expect(sectionStart(pages, "duo")).toBeNull();
    expect(sectionStart(pages, "outro")).toEqual({ page: 5, step: 0 });
  });

  it("says which of two stops comes later, the pull-back after every panel of its page", () => {
    expect(isAfter({ page: 2, step: 2 }, { page: 2, step: 0 })).toBe(true);
    expect(isAfter({ page: 2, step: 0 }, { page: 3, step: 0 })).toBe(false);
    expect(isAfter({ page: 2, step: PULL }, { page: 2, step: 2 })).toBe(true);
    expect(isAfter({ page: 2, step: 0 }, { page: 2, step: 0 })).toBe(false);
  });

  it("places a stop among its page's panels", () => {
    expect(panelPlace(pages, { page: 2, step: 2 })).toEqual({ index: 1, of: 2 });
    expect(panelPlace(pages, { page: 4, step: 0 })).toEqual({ index: 0, of: 3 });
  });
});

describe("spreads on the desk", () => {
  // On a wide screen: the cover alone, contents + y1, y2 + team, the two share card pages, the back cover alone.
  const wide = withGroups(pages, deskGroups(pages.map((p) => p.kind), "wide"));
  const walk = (from: Stop) => {
    const seen: string[] = [];
    let at: Stop | null = from;
    while (at) {
      seen.push(at.step === PULL ? `${at.page}.pull` : `${at.page}.${at.step}`);
      at = nextStop(wide, at);
    }
    return seen;
  };

  it("pulls back to the whole spread after its last panel, but not on a cover that is one panel", () => {
    expect(wide.map((p) => p.group)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(walk(pageStart(wide, 0)!)).toEqual(["0.0", "1.0", "2.0", "2.2", "2.pull", "3.0", "3.1", "4.0", "4.1", "4.2", "4.pull", "5.0", "6.0", "6.pull", "7.0", "7.1", "7.2", "7.pull"]);
  });

  it("goes back from a spread's first panel to the pull-back of the spread before", () => {
    expect(prevStop(wide, { page: 3, step: 0 })).toEqual({ page: 2, step: PULL });
    expect(prevStop(wide, { page: 2, step: PULL })).toEqual({ page: 2, step: 2 });
    // The cover has no pull-back to go back to.
    expect(prevStop(wide, { page: 1, step: 0 })).toEqual({ page: 0, step: 0 });
  });

  it("goes back through the book exactly the way it came", () => {
    const forward = walk(pageStart(wide, 0)!);
    const back: string[] = [];
    let at: Stop | null = { page: 7, step: PULL };
    while (at) {
      back.push(at.step === PULL ? `${at.page}.pull` : `${at.page}.${at.step}`);
      at = prevStop(wide, at);
    }
    expect(back.reverse()).toEqual(forward);
  });

  it("pulls back on a phone's page of more than one panel only", () => {
    const phone = withGroups(pages, deskGroups(pages.map((p) => p.kind), "phone"));
    expect(pullsBack(phone, 0)).toBe(false);
    expect(pullsBack(phone, 2)).toBe(true);
    expect(nextStop(phone, { page: 1, step: 0 })).toEqual({ page: 2, step: 0 });
    expect(nextStop(phone, { page: 2, step: 2 })).toEqual({ page: 2, step: PULL });
  });

  it("counts the pull-back as past the page's last panel", () => {
    expect(panelPlace(wide, { page: 2, step: PULL })).toEqual({ index: 1, of: 2 });
    expect(reachedAfter([1, 1, 3], { page: 2, step: PULL })).toEqual([1, 1, 3]);
  });
});

describe("what has been reached", () => {
  it("only grows: going back past a panel leaves it drawn", () => {
    let reached = reachedAfter([], { page: 0, step: 0 });
    expect(reached).toEqual([1]);
    reached = reachedAfter(reached, { page: 2, step: 2 });
    expect(reached).toEqual([1, 0, 3]);
    reached = reachedAfter(reached, { page: 2, step: 0 });
    expect(reached).toEqual([1, 0, 3]);
  });
});

describe("anchors", () => {
  const ids = sectionIds(pages);
  it("lists the book's sections once each, in order", () => {
    expect(ids).toEqual(["intro", "contents", "you", "team", "outro"]);
  });

  it("reads an anchor as a section of the book, or nothing", () => {
    expect(sectionOfAnchor("#team", ids)).toBe("team");
    expect(sectionOfAnchor("#contents", ids)).toBe("contents");
    expect(sectionOfAnchor("#duo", ids)).toBeNull();
    expect(sectionOfAnchor("", ids)).toBeNull();
    expect(sectionOfAnchor("#", ids)).toBeNull();
  });

  it("tells a section's pages apart", () => {
    expect(pageInSection(pages, 2)).toEqual({ n: 1, of: 2 });
    expect(pageInSection(pages, 3)).toEqual({ n: 2, of: 2 });
    expect(pageInSection(pages, 4)).toBeNull();
  });
});
