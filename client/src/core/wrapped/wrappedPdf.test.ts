// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What html-to-image was asked to draw, and with what; what jsPDF was asked to make.
const drawn: { node: HTMLElement; options: Record<string, unknown>; showAll: boolean }[] = [];
const pages: { format: number[]; orientation: string }[] = [];
const images: { w: number; h: number }[] = [];
const links: { page: number; x: number; y: number; w: number; h: number; pageNumber: number; magFactor?: string; top?: number }[] = [];
let failOn: HTMLElement | null = null;

const { setWrappedShowAll } = await vi.importActual<typeof import("./sceneProgress")>("./sceneProgress");
let showAllNow = false;
vi.mock("./sceneProgress", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sceneProgress")>();
  return {
    ...actual,
    setWrappedShowAll: (on: boolean) => {
      showAllNow = on;
      actual.setWrappedShowAll(on);
    },
  };
});

const fakeCanvas = () =>
  ({
    width: 1,
    height: 1,
    getContext: () => null,
    toBlob: (done: (b: Blob) => void) => done(new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" })),
  }) as unknown as HTMLCanvasElement;

vi.mock("html-to-image", () => ({
  getFontEmbedCSS: vi.fn(async () => "@font-face{}"),
  toCanvas: vi.fn(async (node: HTMLElement, options: Record<string, unknown>) => {
    if (node === failOn) throw new Error("couldn't draw");
    drawn.push({ node, options, showAll: showAllNow });
    return fakeCanvas();
  }),
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    constructor({ format, orientation }: { format: number[]; orientation: string }) {
      pages.push({ format, orientation });
    }
    addPage(format: number[], orientation: string) {
      pages.push({ format, orientation });
    }
    addImage(_data: unknown, _type: string, _x: number, _y: number, w: number, h: number) {
      images.push({ w, h });
    }
    current = 0;
    setPage(n: number) {
      this.current = n;
    }
    link(x: number, y: number, w: number, h: number, { pageNumber, magFactor, top }: { pageNumber: number; magFactor?: string; top?: number }) {
      links.push({ page: this.current, x, y, w, h, pageNumber, magFactor, top });
    }
    output() {
      return new Blob(["%PDF"], { type: "application/pdf" });
    }
  },
}));

const { findWrappedScenes, leftOutOfPdf, makeWrappedPdf, wrappedPdfLabel } = await import("./wrappedPdf");

/** A Scene of a given layout size (jsdom lays nothing out). */
function scene(id: string, width: number, height: number, inner = "") {
  const el = document.createElement("section");
  el.dataset.wrappedScene = id;
  el.innerHTML = inner;
  Object.defineProperty(el, "offsetWidth", { value: width });
  Object.defineProperty(el, "offsetHeight", { value: height });
  document.body.append(el);
  return el;
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
});

afterEach(() => {
  drawn.length = 0;
  pages.length = 0;
  images.length = 0;
  links.length = 0;
  failOn = null;
  document.body.innerHTML = "";
  setWrappedShowAll(false);
  vi.unstubAllGlobals();
});

describe("makeWrappedPdf", () => {
  it("draws every Scene in document order, one PDF page each at the Scene's own size", async () => {
    const a = scene("a", 420, 630);
    const b = scene("b", 420, 900);
    const c = scene("c", 1440, 900);
    expect(findWrappedScenes()).toEqual([a, b, c]);
    const done: number[] = [];

    const pdf = await makeWrappedPdf(findWrappedScenes(), { preview: false, onProgress: (n) => done.push(n) });

    expect(pdf.type).toBe("application/pdf");
    // Each page twice (WebKit's first drawing lacks its images), the second kept.
    expect(drawn.map((d) => d.node.dataset.wrappedScene)).toEqual(["a", "a", "b", "b", "c", "c"]);
    expect(pages).toEqual([
      { format: [315, 472.5], orientation: "portrait" },
      { format: [315, 675], orientation: "portrait" },
      { format: [1080, 675], orientation: "landscape" },
    ]);
    expect(images).toEqual([
      { w: 315, h: 472.5 },
      { w: 315, h: 675 },
      { w: 1080, h: 675 },
    ]);
    expect(done).toEqual([1, 2, 3]);
    // The narrow comic page sharper than a wide screen; the camera's placing taken off; fonts fetched once for all.
    expect(drawn[0]!.options).toMatchObject({ width: 420, height: 630, pixelRatio: 3, style: { transform: "none", boxShadow: "none" } });
    expect(drawn[4]!.options).toMatchObject({ pixelRatio: 2 });
    expect(new Set(drawn.map((d) => d.options.fontEmbedCSS)).size).toBe(1);
  });

  it("leaves the controls out of the pages, but keeps a button that is the content", () => {
    const el = scene(
      "a",
      420,
      630,
      `<p id="text">Hi</p><button id="plain">Copy image</button><a role="button" id="link">Board</a><div data-pdf-skip id="row"></div><button data-pdf-keep id="keep">You</button><a href="#" id="real">wiki</a>`,
    );
    const left = (id: string) => leftOutOfPdf(el.querySelector(`#${id}`)!);
    expect(left("plain")).toBe(true);
    expect(left("link")).toBe(true);
    expect(left("row")).toBe(true);
    expect(left("keep")).toBe(false);
    expect(left("text")).toBe(false);
    expect(left("real")).toBe(false);
    expect(leftOutOfPdf(document.createTextNode("x"))).toBe(false);
  });

  it("gives html-to-image that filter, and a blank for an image it can't read", async () => {
    scene("a", 420, 630, `<button>Share</button>`);
    await makeWrappedPdf(findWrappedScenes(), { preview: false });
    const { filter, imagePlaceholder } = drawn[0]!.options as { filter: (n: Node) => boolean; imagePlaceholder: string };
    expect(filter(document.querySelector("button")!)).toBe(false);
    expect(imagePlaceholder).toMatch(/^data:image\//);
  });

  it("keeps going past an image that won't load", async () => {
    const el = scene("a", 420, 630, `<img src="https://cdn.example/avatar.png" loading="lazy">`);
    const img = el.querySelector("img")!;
    img.decode = () => Promise.reject(new Error("broken"));
    await makeWrappedPdf(findWrappedScenes(), { preview: false });
    expect(pages).toHaveLength(1);
    // A lazy image off screen is told to load now.
    expect(img.getAttribute("loading")).toBe("eager");
  });

  it("shows everything while it draws, and puts it back afterwards", async () => {
    scene("a", 420, 630);
    await makeWrappedPdf(findWrappedScenes(), { preview: false });
    expect(drawn.every((d) => d.showAll)).toBe(true);
    expect(showAllNow).toBe(false);
  });

  it("puts it back when drawing fails too", async () => {
    scene("a", 420, 630);
    failOn = scene("b", 420, 630);
    await expect(makeWrappedPdf(findWrappedScenes(), { preview: false })).rejects.toThrow("couldn't draw");
    expect(showAllNow).toBe(false);
  });

  it("leaves out a Scene marked to stay out of the PDF (the comic's back cover)", async () => {
    const a = scene("a", 420, 630);
    scene("back", 420, 630).setAttribute("data-pdf-skip", "");
    expect(findWrappedScenes()).toEqual([a]);
  });

  it("makes each link on a page go to the top of the first page of its section, where it lies on the page", async () => {
    /** A Scene in a section, as the themes wrap each section's Scenes. */
    const inSection = (section: string, el: HTMLElement) => {
      let wrapper = document.querySelector<HTMLElement>(`[data-wrapped-section="${section}"]`);
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.dataset.wrappedSection = section;
        document.body.append(wrapper);
      }
      wrapper.append(el);
      return el;
    };
    /** Where an element lies in layout (jsdom lays nothing out). */
    const place = (el: HTMLElement, parent: HTMLElement, left: number, top: number, width: number, height: number) => {
      for (const [key, value] of Object.entries({ offsetParent: parent, offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height })) {
        Object.defineProperty(el, key, { value });
      }
    };
    inSection("intro", scene("cover", 420, 630));
    const contents = inSection(
      "contents",
      scene("contents", 420, 630, `<button data-pdf-keep data-pdf-link-section="team"></button><div><button data-pdf-keep data-pdf-link-section="you"></button></div><button data-pdf-link-section="gone"></button>`),
    );
    // On screen the camera tilts and scales the page, so its boxes there would be wrong: it's measured in layout.
    contents.getBoundingClientRect = () => {
      throw new Error("measured on screen");
    };
    const [toTeam, toYou] = [...contents.querySelectorAll("button")];
    place(toTeam!, contents, 20, 100, 380, 40);
    // Inside a positioned box of its own.
    const row = toYou!.parentElement!;
    place(row, contents, 20, 120, 380, 80);
    place(toYou!, row, 0, 40, 380, 40);
    inSection("you", scene("you-1", 420, 900));
    inSection("you", scene("you-2", 420, 630));
    inSection("team", scene("team-1", 420, 700));

    await makeWrappedPdf(findWrappedScenes(), { preview: false });

    // In points (px × 0.75), opening at the top of a page taller than the one the link is on; a link to a section with
    // no page is left out.
    expect(links).toEqual([
      { page: 2, x: 15, y: 75, w: 285, h: 30, pageNumber: 5, magFactor: "FitH", top: 525 },
      { page: 2, x: 15, y: 120, w: 285, h: 30, pageNumber: 3, magFactor: "FitH", top: 675 },
    ]);
  });

  it("refuses a page with no Scenes", async () => {
    await expect(makeWrappedPdf([], { preview: false })).rejects.toThrow();
    expect(showAllNow).toBe(false);
  });
});

describe("wrappedPdfLabel", () => {
  it("says what the button does, then how far it has got", () => {
    expect(wrappedPdfLabel(null)).toBe("Download PDF");
    expect(wrappedPdfLabel({ done: 0, total: 0 })).toBe("Making PDF…");
    expect(wrappedPdfLabel({ done: 11, total: 38 })).toBe("Making PDF… 12 of 38");
    expect(wrappedPdfLabel({ done: 38, total: 38 })).toBe("Making PDF… 38 of 38");
  });
});
