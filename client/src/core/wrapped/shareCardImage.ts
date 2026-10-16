// Wrapped's share cards as images (CONTEXT.md "Wrapped"). Made only in the viewer's browser, never on the server (the
// old site's Wrapped overloaded its server doing that at launch): html-to-image redraws the card's own DOM onto a
// canvas. The card's images are already data URLs (CardImage copies each one as it loads), so none is fetched again.
// Web fonts are embedded, but only those the card uses (the comic theme's cards are lettered in Bangers): html-to-image
// reads them from the page's stylesheets, and a card in the system font stack embeds none. html-to-image itself loads
// the first time a card is drawn, not with the page. The Wrapped's PDF (wrappedPdf.ts) draws its pages the same way.

import { awaitModule } from "../chunkReload";

/** How html-to-image is told to draw something. */
export type DrawOptions = NonNullable<Parameters<(typeof import("html-to-image"))["toCanvas"]>[1]>;

/** A card is laid out at this size in CSS pixels and drawn at twice that: a 1080×1350 (4:5) PNG. */
export const SHARE_CARD_WIDTH = 540;
export const SHARE_CARD_HEIGHT = 675;
export const SHARE_CARD_PIXEL_RATIO = 2;

// A transparent pixel, for an image that fails to inline anyway: it's left blank rather than failing the whole card.
export const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** How long a card waits for its images before it's drawn without the ones still missing. */
const IMAGE_WAIT_MS = 5000;

/**
 * Waits until every image in the card is a loaded data URL (CardImage copies each one as it loads, and swaps one that
 * fails for its fallback), so none is caught half-way.
 */
async function settleImages(node: HTMLElement): Promise<void> {
  const deadline = performance.now() + IMAGE_WAIT_MS;
  const ready = (img: HTMLImageElement) => img.src.startsWith("data:") && img.complete;
  while ([...node.querySelectorAll("img")].some((img) => !ready(img)) && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** html-to-image, loaded the first time something is drawn. */
export function loadHtmlToImage() {
  return awaitModule(import("html-to-image"));
}

/**
 * Draws `node` onto a canvas with html-to-image. WebKit (every iPhone browser, and Safari) draws it before it has decoded
 * the images inside it, so its first drawing comes out without them (the art, the profile pictures, the wiki icons). A
 * first drawing thrown away decodes them, so the second is the one kept (#562).
 */
export async function drawNode(node: HTMLElement, options: DrawOptions): Promise<HTMLCanvasElement> {
  const { toCanvas } = await loadHtmlToImage();
  await toCanvas(node, options);
  return toCanvas(node, options);
}

/** A canvas as an image file of `type` (`quality` for a JPEG). */
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the image"))), type, quality));
}

/** The card's DOM (laid out at SHARE_CARD_WIDTH × SHARE_CARD_HEIGHT) as a PNG. */
export async function renderShareCard(node: HTMLElement): Promise<Blob> {
  await settleImages(node);
  const options: DrawOptions = {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    pixelRatio: SHARE_CARD_PIXEL_RATIO,
    imagePlaceholder: BLANK_IMAGE,
    // An image that isn't ready (still being copied into a data URL, or never loaded) is left out, never fetched.
    filter: (el: HTMLElement) => !(el instanceof HTMLImageElement) || (el.complete && el.naturalWidth > 0 && el.src.startsWith("data:")),
  };
  return canvasToBlob(await drawNode(node, options));
}

/**
 * Whether this browser can put a PNG on the clipboard (desktop Chrome, Firefox, Safari). Copy image is hidden where it
 * can't, rather than failing when pressed.
 */
export function canCopyImage(): boolean {
  try {
    if (typeof ClipboardItem === "undefined" || typeof navigator.clipboard?.write !== "function") return false;
    const supports = (ClipboardItem as { supports?: (type: string) => boolean }).supports;
    return typeof supports !== "function" || supports("image/png");
  } catch {
    return false;
  }
}

/**
 * Puts the PNG on the clipboard. It's handed over as a promise, so the browser counts the write as part of the press
 * even while the card is still being drawn (Safari refuses it otherwise).
 */
export async function copyImage(png: Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/** Whether this browser can share a file of `type` (a PNG, a PDF) through the Web Share API (mostly phones). */
export function canShareFile(type: string, fileName: string): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([new Blob()], fileName, { type })] });
  } catch {
    return false;
  }
}

/**
 * Opens the system share sheet with the file. Rejects with an AbortError when the viewer closes it, and with a
 * NotAllowedError when it's too long since they pressed anything (a browser only shares in answer to a press).
 */
export async function shareFile(file: Blob, fileName: string, title: string): Promise<void> {
  await navigator.share({ files: [new File([file], fileName, { type: file.type })], title });
}

/** Saves the file as a download. */
export function downloadFile(file: Blob, fileName: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // Long enough for the download to start from it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
