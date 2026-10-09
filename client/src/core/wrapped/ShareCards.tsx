import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import type { WrappedShareCardModel } from "../../headless/types";
import { Button } from "../ui/Button";
import { CheckIcon, CopyIcon, DownloadIcon, ShareIcon } from "../ui/icons";
import { canCopyImage, canShareImage, copyImage, downloadImage, renderShareCard, shareImage, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from "./shareCardImage";

// Wrapped's share cards (CONTEXT.md "Wrapped"), in the Outro before its way out: each card drawn by the theme's
// WrappedShareCard slot, previewed scaled to fit, with Copy image, Download and (where the browser can share files)
// Share. The image is made in the browser from the card's own DOM (shareCardImage.ts), so what's previewed is what's
// shared.

/** The id the Wrapped page's jump-to-cards button scrolls to. */
export const WRAPPED_CARDS_ID = "wrapped-cards";

/**
 * The viewer's share cards, each through `Card` (the theme's WrappedShareCard slot). Nothing without any. In a
 * Moderator's preview every card carries a "Preview" watermark, drawn over the theme's card so it ends up in the image
 * whatever the theme draws.
 */
export function WrappedShareCards({ cards, preview, Card }: { cards: WrappedShareCardModel[]; preview: boolean; Card: ComponentType<{ card: WrappedShareCardModel }> }) {
  const supports = useShareSupport();
  if (cards.length === 0) return null;
  return (
    <div id={WRAPPED_CARDS_ID} className="mt-16 w-full max-w-5xl scroll-mt-20">
      <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Share your Wrapped</p>
      <ul className={`mx-auto grid gap-8 ${cards.length === 1 ? "max-w-sm" : "max-w-2xl sm:grid-cols-2"}`}>
        {cards.map((card) => (
          <li key={card.key}>
            <ShareCard card={card} preview={preview} Card={Card} supports={supports} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One share card with its buttons, for a theme that sets the cards out its own way (a page each, say) rather than in
 * WrappedShareCards' row. Fills the width it's given; the card is previewed scaled to it.
 */
export function WrappedShareCardItem({ card, preview, Card }: { card: WrappedShareCardModel; preview: boolean; Card: ComponentType<{ card: WrappedShareCardModel }> }) {
  return <ShareCard card={card} preview={preview} Card={Card} supports={useShareSupport()} />;
}

/** What the browser can do with a card's image: copy it, share it as a file. It doesn't change while the page is open. */
function useShareSupport() {
  return useMemo(() => ({ copy: canCopyImage(), share: canShareImage() }), []);
}

type Status = { tone: "ok" | "error"; text: string } | null;

function ShareCard({ card, preview, Card, supports }: { card: WrappedShareCardModel; preview: boolean; Card: ComponentType<{ card: WrappedShareCardModel }>; supports: { copy: boolean; share: boolean } }) {
  const face = useRef<HTMLDivElement>(null);
  const png = useRef<Promise<Blob> | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  // Drawn once and kept, so pressing a second button (or the same one again) is instant; drawn again if the card changes.
  useEffect(() => {
    png.current = null;
  }, [card, preview]);
  const image = () => {
    if (!png.current) {
      const drawing = renderShareCard(face.current!);
      drawing.catch(() => {
        if (png.current === drawing) png.current = null;
      });
      png.current = drawing;
    }
    return png.current;
  };

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(t);
  }, [status]);

  const run = async (action: () => Promise<void>, done: string, failed: string) => {
    setBusy(true);
    try {
      await action();
      setStatus({ tone: "ok", text: done });
    } catch (err) {
      // Closing the share sheet isn't a failure.
      setStatus(err instanceof DOMException && err.name === "AbortError" ? null : { tone: "error", text: failed });
    } finally {
      setBusy(false);
    }
  };

  const copy = () => run(() => copyImage(image()), "Copied", "Couldn't copy the image");
  const download = () => run(async () => downloadImage(await image(), card.fileName), "Saved", "Couldn't save the image");
  const share = () => run(async () => shareImage(await image(), card.fileName, `${card.label} · ${card.bingoName}`), "Shared", "Couldn't share the image");

  return (
    <figure className="flex flex-col gap-3">
      <ScaledCard label={card.label}>
        {/* Its text starts from neutral, whatever the page around it sets (the Outro centres its own). */}
        <div ref={face} className="relative overflow-hidden text-left text-base font-normal normal-case tracking-normal" style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}>
          <Card card={card} />
          {preview && <PreviewWatermark />}
        </div>
      </ScaledCard>
      <figcaption className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-2">
          {supports.copy && (
            <Button size="sm" variant="primary" onPress={copy} isDisabled={busy} aria-label={`Copy image of your ${card.label}`}>
              <CopyIcon />
              Copy image
            </Button>
          )}
          <Button size="sm" variant={supports.copy ? "secondary" : "primary"} onPress={download} isDisabled={busy} aria-label={`Download your ${card.label}`}>
            <DownloadIcon />
            Download
          </Button>
          {supports.share && (
            <Button size="sm" variant="secondary" onPress={share} isDisabled={busy} aria-label={`Share your ${card.label}`}>
              <ShareIcon />
              Share
            </Button>
          )}
        </div>
        <p aria-live="polite" className={`flex h-4 items-center gap-1 text-xs ${status?.tone === "error" ? "text-danger" : "text-on-surface-muted"}`}>
          {status && (
            <>
              {status.tone === "ok" && <CheckIcon size={12} />}
              {status.text}
            </>
          )}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * A card at its full layout size, scaled to fit the column it's in. The scale is on this wrapper, never on the card
 * itself, so the image is drawn at full size. A theme can dress the wrapper by `data-share-card-frame`.
 */
function ScaledCard({ label, children }: { label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = box.current!;
    const fit = () => setScale(el.clientWidth / SHARE_CARD_WIDTH);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} aria-label={label} role="group" data-share-card-frame className="relative w-full overflow-hidden rounded-lg border border-outline shadow-lg" style={{ aspectRatio: `${SHARE_CARD_WIDTH} / ${SHARE_CARD_HEIGHT}` }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/** Across every card in a Moderator's preview, and so in its image: it isn't published yet. */
function PreviewWatermark() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="w-[160%] shrink-0 py-3 text-center font-black uppercase"
        style={{ transform: "rotate(-30deg)", backgroundColor: "rgb(251 191 36 / 0.85)", color: "#18181b", fontSize: 44, letterSpacing: "0.3em", boxShadow: "0 0 0 2px rgb(24 24 27 / 0.5)" }}
      >
        Preview
      </div>
    </div>
  );
}

/**
 * An image on a share card: an avatar (on Discord's CDN, so loaded with CORS) or an item's wiki icon (not every item
 * has one). Once loaded it's copied into a data URL, so drawing the card later fetches nothing (html-to-image leaves data
 * URLs as they are). One that fails to load, or that the browser won't let a canvas read, shows `fallback` in its
 * place, or nothing, so a card never has a broken or blank image in it. Loaded eagerly: a lazy image might not have
 * loaded by the time the card is drawn.
 */
export function CardImage({ src, className, style, fallback = null }: { src: string | null; className?: string; style?: CSSProperties; fallback?: ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [inlined, setInlined] = useState<{ src: string; dataUrl: string } | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  const inline = (img: HTMLImageElement) => {
    if (inlined?.src === src) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      setInlined({ src, dataUrl: canvas.toDataURL("image/png") });
    } catch {
      setFailed(src);
    }
  };
  return (
    <img
      src={inlined?.src === src ? inlined.dataUrl : src}
      alt=""
      crossOrigin="anonymous"
      loading="eager"
      decoding="async"
      draggable={false}
      onLoad={(e) => inline(e.currentTarget)}
      onError={() => setFailed(src)}
      className={className}
      style={style}
    />
  );
}
