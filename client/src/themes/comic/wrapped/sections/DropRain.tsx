import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { wikiIconUrl } from "../../../../api/wikiIcons";
import { useWrappedSceneState } from "../../../../core/wrapped/Scene";
import { pieceAt, rainPile, type RainPile } from "../dropRain";

/**
 * The Bingo's drops raining down into a pile, each its item's wiki icon (dropRain.ts says where each lands). Drawn on
 * one canvas, as hundreds of icons moving at once would be hundreds of elements to move. The pile lies in this box, but
 * the canvas reaches up to the top of the panel it's in, so the drops fall from there, past the heading. It rains when
 * the camera sets off for its panel (its `step` reached); a page already passed, or reduced motion, shows the pile as it
 * ended.
 */
export function DropRain({ items, step, className = "" }: { items: readonly { itemName: string; drops: number }[]; step: number; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The box's size, and how far below its panel's top it sits (the room the drops fall through first).
  const [size, setSize] = useState({ w: 0, h: 0, lift: 0 });
  const scene = useWrappedSceneState();
  const reached = !scene || scene.reached > step;
  const reduceMotion = useReducedMotion();
  // Reached as it first appeared (a page already passed): it has already rained.
  const [rainedBefore] = useState(reached);

  useLayoutEffect(() => {
    const box = boxRef.current!;
    const measure = () => setSize({ w: box.clientWidth, h: box.clientHeight, lift: liftWithin(box) });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const pile = useMemo(() => rainPile(items, size.w, size.h, items.length * 31 + (items[0]?.drops ?? 0), size.lift), [items, size.w, size.h, size.lift]);
  const icons = useIcons(pile);
  // What the canvas shows now (ms into the rain), and how to draw a moment of it: kept for the icons that load late.
  const iconsRef = useRef(icons);
  iconsRef.current = icons;
  const shown = useRef<{ draw: (t: number) => void; t: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || pile.pieces.length === 0) return;
    // Drawn sharper than the page, as the camera zooms in on the panel.
    const scale = Math.min(4, (window.devicePixelRatio || 1) * 2.5);
    canvas.width = Math.round(size.w * scale);
    canvas.height = Math.round((size.h + size.lift) * scale);
    ctx.imageSmoothingEnabled = false;
    const draw = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pile.pieces) {
        const img = iconsRef.current.get(p.itemName);
        const at = pieceAt(p, t);
        if (!img || !at) continue;
        // Contained in the icon's square, keeping its own shape.
        const fit = pile.size / Math.max(img.naturalWidth, img.naturalHeight);
        const iw = img.naturalWidth * fit;
        const ih = img.naturalHeight * fit;
        ctx.setTransform(scale, 0, 0, scale, p.x * scale, (at.y + size.lift) * scale);
        ctx.rotate((at.angle * Math.PI) / 180);
        ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      }
    };
    const show = (t: number) => {
      shown.current = { draw, t };
      draw(t);
    };
    if (!reached) return show(-1);
    if (rainedBefore || reduceMotion) return show(pile.duration);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      show(now - start);
      if (now - start < pile.duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pile, size.w, size.h, size.lift, reached, rainedBefore, reduceMotion]);

  // An icon that loads once the pile has settled is drawn into it (one loading mid-rain joins at its next frame).
  useEffect(() => {
    const now = shown.current;
    if (now && now.t >= pile.duration) now.draw(now.t);
  }, [icons, pile]);

  return (
    <div ref={boxRef} aria-hidden className={`relative ${className}`}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-x-0 bottom-0 w-full [image-rendering:pixelated]" style={{ height: size.h + size.lift }} />
    </div>
  );
}

/** How far below the top of its panel `el` sits (px, from layout alone, so the camera's zoom doesn't count). */
function liftWithin(el: HTMLElement): number {
  const panel = el.closest<HTMLElement>(".wrapped-panel");
  let lift = 0;
  for (let node: HTMLElement | null = el; node && node !== panel; node = node.offsetParent as HTMLElement | null) lift += node.offsetTop;
  return panel ? Math.max(0, lift) : 0;
}

/** The wiki icon of every item in the pile, as each loads (one that fails is left out). */
function useIcons(pile: RainPile): Map<string, HTMLImageElement> {
  const [icons, setIcons] = useState(() => new Map<string, HTMLImageElement>());
  const names = useMemo(() => [...new Set(pile.pieces.map((p) => p.itemName))].join("\n"), [pile]);
  useEffect(() => {
    if (!names) return;
    let live = true;
    for (const name of names.split("\n")) {
      const url = wikiIconUrl(name);
      if (!url) continue;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (live) setIcons((m) => new Map(m).set(name, img));
      };
      img.src = url;
    }
    return () => {
      live = false;
    };
  }, [names]);
  return icons;
}
