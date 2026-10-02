// The comic Wrapped's book, as data: which pages it has, where the reader is in it (a Stop: a page and a panel on it, or
// the whole spread the camera pulls back to at its end) and where each move leads. Pure, so the controls and navigation
// are tested without React.
//
// A page is a Scene (core/wrapped/Scene: WrappedScene) and a panel is one of its Reveal steps. The book is laid out
// from the Scenes the sections register, in document order: the Intro's is the front cover, the contents page the
// book adds is next, then each section's pages, and the Outro's last is the back cover.

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
  /** The group of pages on the desk the page lies in (desk.ts: a spread, or the page alone): numbered from 0, in order. Each page is its own until withGroups. */
  group: number;
}

/** Where the reader is: a page of the book, and one panel on it (a Reveal step), or PULL. */
export interface Stop {
  page: number;
  step: number;
}

/**
 * The step of the stop at the end of a group, where the camera pulls back to show the whole spread before moving on. Its
 * page is the group's last. A group of one page with one panel has none: the camera is already showing all of it.
 */
export const PULL = -1;

/**
 * The book's pages, one per Scene, with each one's kind and number. The Intro's Scene is the front cover and the Outro's
 * last is the back cover (its pages before it, the share cards, are pages like any other, so they can't be missed behind
 * it). `labels` names a section for the footer (the model's section label, as "Your Team"); a section it doesn't name is
 * called by its id.
 */
export function buildPages(scenes: readonly GuideScene[], labels: Readonly<Record<string, string>>): GuidePage[] {
  let no = 0;
  const back = scenes.map((s) => s.sectionId).lastIndexOf("outro");
  return scenes.map((scene, index) => {
    let kind: PageKind = scene.sectionId === CONTENTS_SECTION ? "contents" : "page";
    if (scene.sectionId === "intro") kind = "cover";
    if (index === back) kind = "back";
    const printed = kind === "cover" || kind === "back" ? null : ++no;
    const role = kind === "contents" ? "In this issue" : (labels[scene.sectionId] ?? scene.sectionId);
    const panels = [...new Set(scene.panels)].sort((a, b) => a - b);
    return { sceneId: scene.id, sectionId: scene.sectionId, panels: panels.length ? panels : [0], kind, no: printed, role, group: index };
  });
}

/** The pages, each told its group (desk.ts's deskGroups: runs of page indexes, in order). */
export function withGroups(pages: readonly GuidePage[], groups: readonly number[][]): GuidePage[] {
  const of = new Map<number, number>();
  groups.forEach((g, n) => g.forEach((i) => of.set(i, n)));
  return pages.map((p, i) => ({ ...p, group: of.get(i) ?? 0 }));
}

/** The pages of a group, as indexes. */
const groupPages = (pages: readonly GuidePage[], group: number) => pages.flatMap((p, i) => (p.group === group ? [i] : []));

/** Whether a group ends in a pull-back: it has more than the one panel the camera already shows whole. */
export function pullsBack(pages: readonly GuidePage[], group: number): boolean {
  const own = groupPages(pages, group);
  return own.length > 1 || own.some((i) => pages[i]!.panels.length > 1);
}

/** Whether a page is the last of its group (the pull-back follows it). */
const lastOfGroup = (pages: readonly GuidePage[], page: number) => pages[page + 1]?.group !== pages[page]!.group;

export const sameStop = (a: Stop, b: Stop) => a.page === b.page && a.step === b.step;

/**
 * The stop after this one: the next panel on the page, the pull-back once the group's last panel is read, or the first
 * panel of the next page. Null at the very end.
 */
export function nextStop(pages: readonly GuidePage[], at: Stop): Stop | null {
  const page = pages[at.page];
  if (!page) return null;
  if (at.step !== PULL) {
    const step = page.panels.find((s) => s > at.step);
    if (step !== undefined) return { page: at.page, step };
    if (lastOfGroup(pages, at.page) && pullsBack(pages, page.group)) return { page: at.page, step: PULL };
  }
  const after = pages[at.page + 1];
  return after ? { page: at.page + 1, step: after.panels[0]! } : null;
}

/** The panel before this one: the previous on the page, or the last of the previous page. Null at the very start. */
export function prevStop(pages: readonly GuidePage[], at: Stop): Stop | null {
  const page = pages[at.page];
  if (!page) return null;
  if (at.step === PULL) return { page: at.page, step: page.panels[page.panels.length - 1]! };
  const earlier = page.panels.filter((s) => s < at.step);
  if (earlier.length) return { page: at.page, step: earlier[earlier.length - 1]! };
  const before = pages[at.page - 1];
  if (!before) return null;
  // Back out of a group into the one before: its pull-back, if it has one.
  if (before.group !== page.group && pullsBack(pages, before.group)) return { page: at.page - 1, step: PULL };
  return { page: at.page - 1, step: before.panels[before.panels.length - 1]! };
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

/** Which panel of its page a stop is (0 first), and how many the page has. The pull-back counts as past the last. */
export function panelPlace(pages: readonly GuidePage[], at: Stop): { index: number; of: number } {
  const page = pages[at.page];
  if (!page) return { index: 0, of: 1 };
  if (at.step === PULL) return { index: page.panels.length - 1, of: page.panels.length };
  return { index: Math.max(0, page.panels.indexOf(at.step)), of: page.panels.length };
}

/** Whether a stop comes after another in the book (the pull-back after every panel of its page). */
export function isAfter(a: Stop, b: Stop): boolean {
  if (a.page !== b.page) return a.page > b.page;
  const order = (s: Stop) => (s.step === PULL ? Infinity : s.step);
  return order(a) > order(b);
}

/**
 * How many panels of each page the reader has reached, after moving to `to`. It only grows: a panel the reader has been
 * to stays drawn when they go back past it.
 */
export function reachedAfter(reached: readonly number[], to: Stop): number[] {
  const next = [...reached];
  while (next.length <= to.page) next.push(0);
  if (to.step === PULL) return next;
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
