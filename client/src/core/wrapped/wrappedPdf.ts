// Wrapped as a PDF (docs/wrapped-pdf-plan.md): every Scene on the page, in order, drawn as it looks fully read and put
// on a PDF page of its own, the page the Scene's size. Made in the viewer's browser from the live page's own Scenes, as
// the share cards are (shareCardImage.ts), so the comic's framed, numbered pages come out as the book lays them out. The
// text is part of each page's picture, so it can't be selected: that keeps the look exactly. Nothing is sent anywhere.
// html-to-image and jsPDF load when the PDF is asked for, never with the page.

import { useCallback, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { jsPDF as JsPdf } from "jspdf";
import { useWrappedModel } from "../../headless";
import { awaitModule } from "../chunkReload";
import { reportClientError } from "../logging/reportClientError";
import { toast } from "../ui/Toast";
import { setWrappedShowAll } from "./sceneProgress";
import { BLANK_IMAGE, canShareFile, canvasToBlob, downloadFile, drawNode, loadHtmlToImage, shareFile } from "./shareCardImage";

/** What a Scene is marked with (Scene.tsx), in both kinds of Scene. */
const SCENE_SELECTOR = "[data-wrapped-scene]";

/**
 * What's left out of the pages: the controls inside the Scenes (the share cards' buttons, the Outro's way out, the PDF's
 * own button), marked `data-pdf-skip` where they're drawn, and any other button. A button that is the content (the comic's
 * contents page lists the stories as buttons) is marked `data-pdf-keep`.
 */
export function leftOutOfPdf(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.matches("[data-pdf-skip]")) return true;
  return node.matches("button, a[role=button]") && !node.matches("[data-pdf-keep]");
}

/**
 * Sent along with each page's copy, after the fonts. html-to-image copies each element's computed style onto the copy, but
 * Chrome computes an auto margin as 0px in places (the default theme's share cards, centred by mx-auto, came out against
 * the left edge). The copy keeps its classes, so the auto margins are put back by them, over the copied 0px.
 */
const AUTO_MARGINS_CSS = [
  ".m-auto{margin:auto!important}",
  ".mx-auto{margin-left:auto!important;margin-right:auto!important}",
  ".my-auto{margin-top:auto!important;margin-bottom:auto!important}",
  ".ml-auto{margin-left:auto!important}",
  ".mr-auto{margin-right:auto!important}",
  ".mt-auto{margin-top:auto!important}",
  ".mb-auto{margin-bottom:auto!important}",
].join("\n");

/** CSS px to PDF points: a PDF page is the Scene's own size. */
const PT_PER_PX = 0.75;
/** A page as narrow as the comic's (420px) is drawn at 3× to stay sharp; a wider one (a screen of the default theme) at 2×. */
const NARROW_PAGE_PX = 480;
/** The biggest canvas an iPhone will draw (pixels): a very tall page is drawn at less than 3× or 2× to fit it. */
const MAX_CANVAS_PIXELS = 16_777_216;
const JPEG_QUALITY = 0.9;
/** How long a page waits for its images before it's drawn without the ones still missing. */
const IMAGE_WAIT_MS = 5000;

/**
 * The Wrapped's Scenes on the page, in document order (the comic's front cover and contents page among them), without
 * the ones left out of the PDF (`<WrappedScene pdf={false}>`: the comic's back cover).
 */
export function findWrappedScenes(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SCENE_SELECTOR)].filter((scene) => !scene.matches("[data-pdf-skip]"));
}

/**
 * What a link on a page is marked with: the section it goes to (the comic's contents, each story a link to the page it
 * starts on). The section is the theme's `data-wrapped-section` that holds a Scene, so in the PDF it goes to the first
 * page of that section.
 */
const LINK_SELECTOR = "[data-pdf-link-section]";

/** A link on a page, where it is on the page in CSS px, to the section it goes to. */
export interface PageLink {
  x: number;
  y: number;
  w: number;
  h: number;
  section: string;
}

/**
 * The links on a Scene, measured where they lie on it in its own layout. Not from the screen: there the comic's camera
 * tilts and scales the page, and a tilted page's boxes on screen are neither its size nor in its places. A Scene is
 * positioned (WrappedScene's class), so the offsets lead up to it.
 */
export function linksOn(scene: HTMLElement): PageLink[] {
  return [...scene.querySelectorAll<HTMLElement>(LINK_SELECTOR)].map((el) => {
    let x = 0;
    let y = 0;
    for (let at: HTMLElement | null = el; at && at !== scene; at = at.offsetParent as HTMLElement | null) {
      x += at.offsetLeft;
      y += at.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight, section: el.dataset.pdfLinkSection! };
  });
}

/** The section a Scene is in: the theme's element round each section, marked with its id. */
const sectionOf = (scene: HTMLElement) => scene.closest<HTMLElement>("[data-wrapped-section]")?.dataset.wrappedSection ?? null;

export interface WrappedPdfOptions {
  /** A Moderator's preview: "Preview" is printed across every page, as on its share cards. */
  preview: boolean;
  /** Told after each page is drawn: how many are done, of how many. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * The PDF of `scenes`, one page each, in the order given. While it draws, every Scene shows as fully read ("show
 * everything", sceneProgress.tsx); afterwards, or if it fails, each is back as the reader left it.
 */
export async function makeWrappedPdf(scenes: readonly HTMLElement[], { preview, onProgress }: WrappedPdfOptions): Promise<Blob> {
  if (scenes.length === 0) throw new Error("The Wrapped has no pages to draw");
  const [htmlToImage, { jsPDF }] = await Promise.all([loadHtmlToImage(), awaitModule(import("jspdf"))]);
  flushSync(() => setWrappedShowAll(true));
  try {
    // A frame or two for what follows the switch outside React: the scroll Reveals' styles, the comic's drop rain.
    await nextFrame();
    await nextFrame();
    // The fonts, fetched and embedded once for every page rather than once a page. Read off what holds all the Scenes,
    // so a font only a later page uses is embedded too.
    const fontEmbedCSS = `${await htmlToImage.getFontEmbedCSS(commonAncestor(scenes))}\n${AUTO_MARGINS_CSS}`;
    let doc: JsPdf | null = null;
    const links: PageLink[][] = [];
    const heights: number[] = [];
    for (const [i, scene] of scenes.entries()) {
      links.push(linksOn(scene));
      const page = await drawPage(scene, fontEmbedCSS, preview);
      const w = page.width * PT_PER_PX;
      const h = page.height * PT_PER_PX;
      heights.push(h);
      const orientation = w > h ? "landscape" : "portrait";
      if (doc) doc.addPage([w, h], orientation);
      else doc = new jsPDF({ unit: "pt", format: [w, h], orientation, compress: true });
      doc.addImage(page.jpeg, "JPEG", 0, 0, w, h, `page-${i}`, "NONE");
      onProgress?.(i + 1, scenes.length);
    }
    // The links, once every page is there to go to: each to the first page of its section (PDF pages count from 1).
    const firstPage = new Map<string, number>();
    scenes.forEach((scene, i) => {
      const section = sectionOf(scene);
      if (section && !firstPage.has(section)) firstPage.set(section, i + 1);
    });
    links.forEach((pageLinks, i) => {
      for (const link of pageLinks) {
        const pageNumber = firstPage.get(link.section);
        if (!pageNumber) continue;
        doc!.setPage(i + 1);
        // Opening at the top of that page, its width filling the window. "FitH" because jsPDF's default ("XYZ") reckons
        // the top from the height of the page the link is on, and pages differ in height.
        doc!.link(link.x * PT_PER_PX, link.y * PT_PER_PX, link.w * PT_PER_PX, link.h * PT_PER_PX, { pageNumber, magFactor: "FitH", top: heights[pageNumber - 1] });
      }
    });
    return doc!.output("blob");
  } finally {
    flushSync(() => setWrappedShowAll(false));
  }
}

/** One Scene drawn as a JPEG, with its size in CSS px. */
async function drawPage(scene: HTMLElement, fontEmbedCSS: string, preview: boolean): Promise<{ width: number; height: number; jpeg: Uint8Array }> {
  await settleImages(scene);
  finishAnimations(scene);
  // Its size from layout alone: the comic's camera scales the book on screen, and that mustn't count.
  const width = scene.offsetWidth;
  const height = scene.offsetHeight;
  const restoreSvg = inlineSvgStyles(scene);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await drawNode(scene, {
      width,
      height,
      pixelRatio: Math.min(width <= NARROW_PAGE_PX ? 3 : 2, Math.sqrt(MAX_CANVAS_PIXELS / (width * height))),
      // Never transparent (black in some PDF viewers): the Scene's own ground, or the page's behind it.
      backgroundColor: backgroundOf(scene),
      fontEmbedCSS,
      imagePlaceholder: BLANK_IMAGE,
      filter: (node) => !leftOutOfPdf(node),
      // html-to-image draws the Scene without its ancestors, so the camera's moves on the world don't come with it; what
      // places the page on the desk itself (BookController's transform, its shadow on the desk) is taken off here.
      style: { transform: "none", translate: "none", rotate: "none", scale: "none", left: "0px", top: "0px", margin: "0px", boxShadow: "none" },
    });
  } finally {
    restoreSvg();
  }
  try {
    if (preview) drawPreviewWatermark(canvas);
    const jpeg = new Uint8Array(await (await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY)).arrayBuffer());
    return { width, height, jpeg };
  } finally {
    // Let go of at once: a phone only has room for so many big canvases.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Waits for the Scene's images to load. A lazy one off screen (the comic's pages away from the camera) hasn't started,
 * so it's told to load now. One that fails is drawn blank (imagePlaceholder), never failing the page.
 */
async function settleImages(scene: HTMLElement): Promise<void> {
  const images = [...scene.querySelectorAll("img")];
  for (const img of images) if (img.getAttribute("loading") === "lazy" && !img.complete) img.setAttribute("loading", "eager");
  await Promise.race([Promise.all(images.map((img) => img.decode?.().catch(() => {}))), wait(IMAGE_WAIT_MS)]);
}

/** Lands whatever is still moving in the Scene (a panel the reader just reached, still drawing in), so it's drawn whole. */
function finishAnimations(scene: HTMLElement) {
  if (typeof scene.getAnimations !== "function") return;
  for (const animation of scene.getAnimations({ subtree: true })) {
    try {
      animation.finish();
    } catch {
      // One that never ends (a loop) can't be finished, and is drawn wherever it is.
    }
  }
}

/** What an SVG's insides take from the page's stylesheets, and lose without them. */
const SVG_STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "visibility",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "stop-color",
  "stop-opacity",
];

/**
 * html-to-image copies each element's style onto its copy, so the page's stylesheets needn't come with it, but it copies
 * an SVG whole and styles only the <svg>: what's inside (the comic's panel frames, a chart's lines and labels) would lose
 * what the stylesheets give it and draw in plain black. So, while a page is drawn, each element inside an SVG wears its
 * own style inline. Returns how to put the elements back as they were.
 */
function inlineSvgStyles(scene: HTMLElement): () => void {
  const elements = [...scene.querySelectorAll<SVGElement>("svg *")];
  // Every style read before any is written, so the page is styled once rather than once an element.
  const styles = elements.map((el) => {
    const computed = getComputedStyle(el);
    return { values: SVG_STYLE_PROPS.map((prop) => computed.getPropertyValue(prop)), hidden: computed.display === "none" };
  });
  const saved = elements.map((el) => el.getAttribute("style"));
  elements.forEach((el, i) => {
    const { values, hidden } = styles[i]!;
    SVG_STYLE_PROPS.forEach((prop, n) => {
      if (values[n]) el.style.setProperty(prop, values[n]!);
    });
    if (hidden) el.style.display = "none";
  });
  return () =>
    elements.forEach((el, i) => {
      const style = saved[i];
      if (style === null || style === undefined) el.removeAttribute("style");
      else el.setAttribute("style", style);
    });
}

const isTransparent = (colour: string) => !colour || colour === "transparent" || /[,/]\s*0(\.0*)?\s*\)$/.test(colour);

/** The colour behind the Scene: its own background, or the first one behind it (the default theme's page). */
function backgroundOf(scene: HTMLElement): string {
  for (let el: Element | null = scene; el; el = el.parentElement) {
    const colour = getComputedStyle(el).backgroundColor;
    if (!isTransparent(colour)) return colour;
  }
  return getComputedStyle(document.documentElement).getPropertyValue("--color-background").trim();
}

/** The nearest element holding every Scene. */
function commonAncestor(scenes: readonly HTMLElement[]): HTMLElement {
  let el = scenes[0]!.parentElement;
  while (el && !scenes.every((s) => el!.contains(s))) el = el.parentElement;
  return el ?? document.body;
}

/** "Preview" across the page, as across a preview's share cards (ShareCards.tsx: PreviewWatermark). */
function drawPreviewWatermark(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const tokens = getComputedStyle(document.documentElement);
  const { width: w, height: h } = canvas;
  const size = Math.round(Math.min(w, h) * 0.085);
  const band = Math.hypot(w, h) * 1.2;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = tokens.getPropertyValue("--color-watermark").trim();
  ctx.fillRect(-band / 2, -size * 0.85, band, size * 1.7);
  ctx.strokeStyle = tokens.getPropertyValue("--color-watermark-edge").trim();
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.strokeRect(-band / 2, -size * 0.85, band, size * 1.7);
  ctx.fillStyle = tokens.getPropertyValue("--color-on-watermark").trim();
  ctx.font = `900 ${size}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(size * 0.3)}px`;
  ctx.fillText("PREVIEW", 0, 0);
  ctx.restore();
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// ---- the export, as the buttons start it ----------------------------------------------------------------------------

/** Where an export is: `done` pages drawn of `total` (0 until the pages are counted). Null when none is running. */
export type WrappedPdfProgress = { done: number; total: number } | null;

// One export at a time for the whole page, so the header's button and the Outro's show the same progress.
let progress: WrappedPdfProgress = null;
const listeners = new Set<() => void>();
function setProgress(next: WrappedPdfProgress) {
  progress = next;
  listeners.forEach((l) => l());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const isNamed = (err: unknown, name: string) => err instanceof DOMException && err.name === name;

/** Whether the viewer is on a phone or tablet that shares files: there the PDF goes to the share sheet. */
function sharesOnThisDevice(fileName: string): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && canShareFile("application/pdf", fileName);
}

/**
 * Hands the PDF over: the share sheet on a phone, a download anywhere else. A browser only opens the share sheet in
 * answer to a press, and making the PDF can outlast that, so if it refuses, a toast offers it to be pressed again.
 */
async function savePdf(pdf: Blob, fileName: string, title: string) {
  if (sharesOnThisDevice(fileName)) {
    try {
      await shareFile(pdf, fileName, title);
      toast({ title: "Shared", tone: "success" });
      return;
    } catch (err) {
      // Closing the share sheet isn't a failure.
      if (isNamed(err, "AbortError")) return;
      if (isNamed(err, "NotAllowedError")) {
        const again = () => void shareFile(pdf, fileName, title).catch((e: unknown) => (isNamed(e, "AbortError") ? undefined : downloadFile(pdf, fileName)));
        toast({ title: "Your PDF is ready", tone: "success", action: { label: "Share", onPress: again } }, 30_000);
        return;
      }
      // Anything else: it's saved as a download instead.
    }
  }
  downloadFile(pdf, fileName);
  toast({ title: "Saved", tone: "success" });
}

async function exportWrappedPdf({ fileName, title, preview }: { fileName: string; title: string; preview: boolean }) {
  if (progress) return;
  setProgress({ done: 0, total: 0 });
  try {
    const scenes = findWrappedScenes();
    setProgress({ done: 0, total: scenes.length });
    const pdf = await makeWrappedPdf(scenes, { preview, onProgress: (done, total) => setProgress({ done, total }) });
    await savePdf(pdf, fileName, title);
  } catch (err) {
    reportClientError(err instanceof Error ? err.message : String(err), "wrapped.pdf");
    toast({ title: "Couldn't make the PDF", tone: "warning" });
  } finally {
    setProgress(null);
  }
}

/** The PDF's file name: the Bingo's, as its share cards' are (`<slug>-wrapped-player.png`). */
export function wrappedPdfFileName(slug: string): string {
  return `${slug}-wrapped.pdf`;
}

/** What a PDF button says: "Download PDF", then "Making PDF… 12 of 38" while it works. */
export function wrappedPdfLabel(progress: WrappedPdfProgress): string {
  if (!progress) return "Download PDF";
  if (!progress.total) return "Making PDF…";
  return `Making PDF… ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`;
}

/**
 * The Wrapped's PDF, for a theme's buttons: `start` makes it and saves it, `busy` while it works, and `progress` how far
 * it has got. Every button on the page shares the one export.
 */
export function useWrappedPdf(): { start: () => void; busy: boolean; progress: WrappedPdfProgress; label: string } {
  const { slug, bingoName, preview } = useWrappedModel();
  const now = useSyncExternalStore(
    subscribe,
    () => progress,
    () => null,
  );
  const start = useCallback(() => void exportWrappedPdf({ fileName: wrappedPdfFileName(slug), title: `${bingoName} · Wrapped`, preview }), [slug, bingoName, preview]);
  return { start, busy: now !== null, progress: now, label: wrappedPdfLabel(now) };
}
