import { describe, expect, it } from "vitest";
import { backCoverStart, buildPages, CONTENTS_SECTION, moveKind, nextStop, pageInSection, pageStart, panelPlace, prevStop, reachedAfter, sectionIds, sectionOfAnchor, sectionStart, type GuideScene } from "./guide";

const scene = (id: string, sectionId: string, panels: number[], steps = panels.length): GuideScene => ({ id, sectionId, steps, panels });

// A book: the cover, the contents page, You (two pages, the first leaving step 1 out), Team, and an Outro of three pages.
const scenes: GuideScene[] = [
  scene("c", "intro", [0]),
  scene("t", CONTENTS_SECTION, [0]),
  scene("y1", "you", [0, 2], 3),
  scene("y2", "you", [0, 1]),
  scene("tm", "team", [0, 1, 2]),
  scene("o1", "outro", [0, 1, 2]),
  scene("o2", "outro", [0]),
  scene("o3", "outro", [0]),
];
const labels = { you: "You", team: "Your Team", outro: "The end" };
const pages = buildPages(scenes, labels);

describe("buildPages", () => {
  it("makes the Intro the front cover, adds the contents page, and the Outro's first page the back cover", () => {
    expect(pages.map((p) => p.kind)).toEqual(["cover", "contents", "page", "page", "page", "back", "page", "page"]);
  });

  it("numbers the pages from the contents page, leaving the covers unnumbered", () => {
    expect(pages.map((p) => p.no)).toEqual([null, 1, 2, 3, 4, null, 5, 6]);
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
    expect(seen).toEqual(["0.0", "1.0", "2.0", "2.2", "3.0", "3.1", "4.0", "4.1", "4.2", "5.0", "5.1", "5.2", "6.0", "7.0"]);
  });

  it("skips the steps a page has no Reveal at (page 2 has none at step 1)", () => {
    expect(nextStop(pages, { page: 2, step: 0 })).toEqual({ page: 2, step: 2 });
    expect(prevStop(pages, { page: 2, step: 2 })).toEqual({ page: 2, step: 0 });
  });

  it("goes back to the last panel of the page before, and stops at the start", () => {
    expect(prevStop(pages, { page: 3, step: 0 })).toEqual({ page: 2, step: 2 });
    expect(prevStop(pages, { page: 1, step: 0 })).toEqual({ page: 0, step: 0 });
    expect(prevStop(pages, { page: 0, step: 0 })).toBeNull();
    expect(nextStop(pages, { page: 7, step: 0 })).toBeNull();
  });

  it("finds a section's first panel and the back cover", () => {
    expect(sectionStart(pages, "you")).toEqual({ page: 2, step: 0 });
    expect(sectionStart(pages, "team")).toEqual({ page: 4, step: 0 });
    expect(sectionStart(pages, CONTENTS_SECTION)).toEqual({ page: 1, step: 0 });
    expect(sectionStart(pages, "duo")).toBeNull();
    expect(backCoverStart(pages)).toEqual({ page: 5, step: 0 });
    expect(backCoverStart(buildPages([scene("a", "you", [0])], labels))).toBeNull();
  });

  it("says what a move is", () => {
    expect(moveKind({ page: 2, step: 0 }, { page: 2, step: 0 })).toBe("none");
    expect(moveKind({ page: 2, step: 0 }, { page: 2, step: 2 })).toBe("panel");
    expect(moveKind({ page: 2, step: 2 }, { page: 3, step: 0 })).toBe("turn-forward");
    expect(moveKind({ page: 5, step: 0 }, { page: 1, step: 0 })).toBe("turn-back");
  });

  it("places a stop among its page's panels", () => {
    expect(panelPlace(pages, { page: 2, step: 2 })).toEqual({ index: 1, of: 2 });
    expect(panelPlace(pages, { page: 4, step: 0 })).toEqual({ index: 0, of: 3 });
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
