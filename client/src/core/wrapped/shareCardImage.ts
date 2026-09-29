import { toBlob } from "html-to-image";

// Wrapped's share cards as images (CONTEXT.md "Wrapped"). Made only in the viewer's browser, never on the server (the
// old site's Wrapped overloaded its server doing that at launch): html-to-image redraws the card's own DOM onto a
// canvas. Nothing is fetched to do it: the card's images are already data URLs (CardImage copies each one as it loads),
// and web fonts are skipped (the cards use the system font stack).

/** A card is laid out at this size in CSS pixels and drawn at twice that: a 1080×1350 (4:5) PNG. */
export const SHARE_CARD_WIDTH = 540;
export const SHARE_CARD_HEIGHT = 675;
export const SHARE_CARD_PIXEL_RATIO = 2;

// A transparent pixel, for an image that fails to inline anyway: it's left blank rather than failing the whole card.
const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

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

/** The card's DOM (laid out at SHARE_CARD_WIDTH × SHARE_CARD_HEIGHT) as a PNG. */
export async function renderShareCard(node: HTMLElement): Promise<Blob> {
  await settleImages(node);
  const blob = await toBlob(node, {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    pixelRatio: SHARE_CARD_PIXEL_RATIO,
    // PROTOTYPE (#315): a card that uses web fonts (the comic one) has them embedded.
    skipFonts: !node.querySelector("[data-embed-fonts]"),
    imagePlaceholder: BLANK_IMAGE,
    // An image that isn't ready (still being copied into a data URL, or never loaded) is left out, never fetched.
    filter: (el) => !(el instanceof HTMLImageElement) || (el.complete && el.naturalWidth > 0 && el.src.startsWith("data:")),
  });
  if (!blob) throw new Error("Couldn't draw the card");
  return blob;
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

/** Whether this browser can share an image file through the Web Share API (mostly phones). */
export function canShareImage(): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([new Blob()], "card.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/** Opens the system share sheet with the PNG. Rejects with an AbortError when the viewer closes it. */
export async function shareImage(png: Blob, fileName: string, title: string): Promise<void> {
  await navigator.share({ files: [new File([png], fileName, { type: "image/png" })], title });
}

/** Saves the PNG as a download. */
export function downloadImage(png: Blob, fileName: string): void {
  const url = URL.createObjectURL(png);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // Long enough for the download to start from it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
