// The comic Wrapped's book, as data: which pages it has, where the reader is in it (a Stop: a page and a panel on it) and
// where each move leads. Pure, so the controls and navigation are tested without React.
//
// A page is a Scene (core/wrapped/Scene: WrappedScene) and a panel is one of its Reveal steps. The book is laid out
// from the Scenes the sections register, in document order: the Intro's is the front cover, the contents page the
// book adds is next, then each section's pages, and the Outro's is the back cover.

/** The section id the book gives its own contents page. The model's own sections are WrappedSectionKind. */
export const CONTENTS_SECTION = "contents";

export type PageKind = "cover" | "contents" | "page" | "back";

export interface GuideScene {
  id: string;
  /** The Scene's own step count (WrappedScene's `steps`). */
  steps: number;
  /**
   * The Reveal steps the Scene really has a Reveal at. A section may leave a step out (a line it has nothing to say for),
   * so the panels are these, not 0 to steps - 1. None at all (a Scene with no Reveals) is one panel, the whole page.
   */
  panels: readonly number[];
  /** The section the Scene is in (WrappedSectionKind, or CONTENTS_SECTION). */
  sectionId: string;
}

export interface GuidePage {
  sceneId: string;
  sectionId: string;
  /** The panels the page has, as the Reveal steps they are, in order (never none: a page without any is one panel, step 0). */
  panels: number[];
  kind: PageKind;
  /** The page number printed in its footer: the contents page is 1, covers have none. */
  no: number | null;
  /** What the page is, for its footer and the contents page. */
  role: string;
}

/** Where the reader is: a page of the book, and one panel on it. */
export interface Stop {
  page: number;
  step: number;
}

/**
 * The book's pages, one per Scene, with each one's kind and number. The Intro's Scene is the front cover and the Outro's
 * first is the back cover (its other pages, the share cards, are pages like any other). `labels` names a section for the
 * footer (the model's section label, as "Your Team"); a section it doesn't name is called by its id.
 */
export function buildPages(scenes: readonly GuideScene[], labels: Readonly<Record<string, string>>): GuidePage[] {
  let no = 0;
  let outroSeen = false;
  return scenes.map((scene) => {
    let kind: PageKind = scene.sectionId === CONTENTS_SECTION ? "contents" : "page";
    if (scene.sectionId === "intro") kind = "cover";
    if (scene.sectionId === "outro" && !outroSeen) {
      kind = "back";
      outroSeen = true;
    }
    const printed = kind === "cover" || kind === "back" ? null : ++no;
    const role = kind === "contents" ? "In this issue" : (labels[scene.sectionId] ?? scene.sectionId);
    const panels = [...new Set(scene.panels)].sort((a, b) => a - b);
    return { sceneId: scene.id, sectionId: scene.sectionId, panels: panels.length ? panels : [0], kind, no: printed, role };
  });
}

export const sameStop = (a: Stop, b: Stop) => a.page === b.page && a.step === b.step;

/** The panel after this one: the next on the page, or the first of the next page. Null at the very end. */
export function nextStop(pages: readonly GuidePage[], at: Stop): Stop | null {
  const page = pages[at.page];
  if (!page) return null;
  const step = page.panels.find((s) => s > at.step);
  if (step !== undefined) return { page: at.page, step };
  const after = pages[at.page + 1];
  return after ? { page: at.page + 1, step: after.panels[0]! } : null;
}

/** The panel before this one: the previous on the page, or the last of the previous page. Null at the very start. */
export function prevStop(pages: readonly GuidePage[], at: Stop): Stop | null {
  const page = pages[at.page];
  const earlier = page?.panels.filter((s) => s < at.step) ?? [];
  if (earlier.length) return { page: at.page, step: earlier[earlier.length - 1]! };
  const before = pages[at.page - 1];
  return before ? { page: at.page - 1, step: before.panels[before.panels.length - 1]! } : null;
}

/** The first panel of a page. */
export const pageStart = (pages: readonly GuidePage[], page: number): Stop | null => (pages[page] ? { page, step: pages[page]!.panels[0]! } : null);

/** The first panel of a section's first page, or null for a section the book doesn't have. */
export function sectionStart(pages: readonly GuidePage[], sectionId: string): Stop | null {
  return pageStart(
    pages,
    pages.findIndex((p) => p.sectionId === sectionId),
  );
}

/** The first panel of the back cover. */
export function backCoverStart(pages: readonly GuidePage[]): Stop | null {
  return pageStart(
    pages,
    pages.findIndex((p) => p.kind === "back"),
  );
}

/** Which panel of its page a stop is (0 first), and how many the page has. */
export function panelPlace(pages: readonly GuidePage[], at: Stop): { index: number; of: number } {
  const page = pages[at.page];
  if (!page) return { index: 0, of: 1 };
  return { index: Math.max(0, page.panels.indexOf(at.step)), of: page.panels.length };
}

/** What a move from one Stop to another is: staying on a page, or turning it (forward or back, over any number of pages). */
export function moveKind(from: Stop, to: Stop): "none" | "panel" | "turn-forward" | "turn-back" {
  if (to.page === from.page) return to.step === from.step ? "none" : "panel";
  return to.page > from.page ? "turn-forward" : "turn-back";
}

/**
 * How many panels of each page the reader has reached, after moving to `to`. It only grows: a panel the reader has been
 * to stays drawn when they go back past it.
 */
export function reachedAfter(reached: readonly number[], to: Stop): number[] {
  const next = [...reached];
  while (next.length <= to.page) next.push(0);
  next[to.page] = Math.max(next[to.page]!, to.step + 1);
  return next;
}

/** The URL anchor for a section: `#you`, `#team`. */
export const anchorOf = (sectionId: string) => `#${sectionId}`;

/** Which of the book's sections an anchor names (`#team`), or null for none, or one the book doesn't have. */
export function sectionOfAnchor(hash: string, sections: readonly string[]): string | null {
  const id = hash.replace(/^#/, "");
  return id && sections.includes(id) ? id : null;
}

/** The distinct sections of the book, in order. */
export function sectionIds(pages: readonly GuidePage[]): string[] {
  return [...new Set(pages.map((p) => p.sectionId))];
}

/** The page's place in its section ("2 of 2"), for a section of more than one page; null for a section of one. */
export function pageInSection(pages: readonly GuidePage[], index: number): { n: number; of: number } | null {
  const page = pages[index];
  if (!page) return null;
  const same = pages.filter((p) => p.sectionId === page.sectionId);
  return same.length > 1 ? { n: same.indexOf(page) + 1, of: same.length } : null;
}
