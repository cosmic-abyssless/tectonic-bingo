import { peelGeometry, PEEL_CLIP_BLEED, toClipPolygon, type Point } from "../board/peel";

// The comic Wrapped's page turn: the Tile book's peel (board/peel's geometry, the same fold, the same crease and shade),
// for a page that lies alone on the desk. The page being turned has the part past the fold cut away by a clip-path, so the
// page beneath shows through, and the fold-back (the cut part reflected across the fold, the blank back of the paper) is
// drawn in a layer over the book. The layer is two pages wide, the spine at its middle, so a turn can carry the fold-back
// past the page's left edge and off the desk, as the Tile book carries it onto the facing page.

/** The shadow the fold-back casts, at most. */
export const FOLD_SHADOW = 0.4;

/** The elements the fold is drawn into: the layer over the book, and what is in it. */
export interface FoldDom {
  layer: HTMLElement;
  sheet: HTMLElement;
  clip: HTMLElement;
  paper: HTMLElement;
  shade: HTMLElement;
  outline: SVGSVGElement;
  edges: SVGPathElement;
  crease: SVGPathElement;
}

/** The markup of the fold layer: render it once inside the book, then find it with findFoldDom. */
export function FoldLayer() {
  return (
    <div data-fold-layer aria-hidden className="wrapped-fold-layer" style={{ display: "none" }}>
      <div data-fold-sheet className="absolute inset-0">
        <div data-fold-clip className="absolute inset-0">
          <div data-fold-paper className="absolute inset-0" />
          <div data-fold-shade className="absolute inset-0" />
          <svg data-fold-outline className="absolute inset-0 size-full" fill="none" strokeLinejoin="miter">
            <path data-fold-edges />
            <path data-fold-crease />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function findFoldDom(book: HTMLElement): FoldDom | null {
  const q = <T extends Element>(selector: string) => book.querySelector<T>(selector);
  const layer = q<HTMLElement>("[data-fold-layer]");
  const sheet = q<HTMLElement>("[data-fold-sheet]");
  const clip = q<HTMLElement>("[data-fold-clip]");
  const paper = q<HTMLElement>("[data-fold-paper]");
  const shade = q<HTMLElement>("[data-fold-shade]");
  const outline = q<SVGSVGElement>("[data-fold-outline]");
  const edges = q<SVGPathElement>("[data-fold-edges]");
  const crease = q<SVGPathElement>("[data-fold-crease]");
  if (!layer || !sheet || !clip || !paper || !shade || !outline || !edges || !crease) return null;
  return { layer, sheet, clip, paper, shade, outline, edges, crease };
}

/** How a page is peeled: how far (0 flat, 1 turned right over onto the spine) and where along its edge it's held (-1 top to 1 bottom). */
export interface Peel {
  /** 0 to 1 of the way over. */
  fraction: number;
  /** Where along the edge the fold is taken from, -1 (top corner) through 0 to 1 (bottom corner). */
  v: number;
}

export interface PeelStyle {
  /** The paper's colour, and the ink of the outline, from the page palette. */
  paper: string;
  ink: string;
  /** The page's border width (px), so the fold-back's outline lies exactly where the page's own border does. */
  borderWidth: number;
}

/** The shadow the fold-back casts at this point of a turn: strongest as it lifts, gone by a third of the way over. */
export const foldShadow = (fraction: number) => FOLD_SHADOW * Math.max(0, 1 - fraction * 3);

/**
 * Draws `page` peeled, or (null) flat again. `W` and `H` are the page's size in its own px.
 * Returns nothing: it writes the page's clip-path and the fold layer directly, once per frame.
 */
export function drawPeel(dom: FoldDom, page: HTMLElement, W: number, H: number, peel: Peel | null, style: PeelStyle) {
  if (!peel || peel.fraction * 2 * W < 0.5) {
    page.style.clipPath = "";
    dom.layer.style.display = "none";
    return;
  }
  const depth = Math.min(1, peel.fraction) * 2 * W;
  const { kept, folded, fold, n } = peelGeometry(W, H, depth, peel.v, W * PEEL_CLIP_BLEED);
  // The page's own coordinates are the canonical ones; the layer's start a page to the left of it, so the spine is at W.
  const toLayer = (poly: Point[]) => poly.map((p) => ({ x: W + p.x, y: p.y }));
  page.style.clipPath = toClipPolygon(kept);

  const foldedLayer = toLayer(folded);
  dom.layer.style.display = "block";
  const shadow = foldShadow(peel.fraction);
  dom.sheet.style.filter = shadow > 0.005 ? `drop-shadow(${(W * 0.006).toFixed(1)}px ${(W * 0.012).toFixed(1)}px ${(W * 0.03).toFixed(1)}px rgba(0,0,0,${shadow.toFixed(3)}))` : "none";
  dom.clip.style.clipPath = toClipPolygon(foldedLayer);
  dom.paper.style.backgroundColor = style.paper;

  // Shade from the crease to the tip, as the Tile book's peel does: CSS gradient angles run clockwise from "up", and the
  // fold-back lies on the inner side of the fold (-n).
  const foldAt = { x: W + fold.x, y: fold.y };
  const dir = { x: -n.x, y: -n.y };
  const angle = (Math.atan2(dir.x, -dir.y) * 180) / Math.PI;
  const rad = (angle * Math.PI) / 180;
  const layerW = W * 2;
  const lineLength = Math.abs(layerW * Math.sin(rad)) + Math.abs(H * Math.cos(rad));
  const creaseAt = (foldAt.x - layerW / 2) * dir.x + (foldAt.y - H / 2) * dir.y + lineLength / 2;
  const t = shadow / FOLD_SHADOW;
  const reach = Math.min(depth, W) * 0.9;
  dom.shade.style.backgroundImage =
    t > 0.01
      ? `linear-gradient(${angle.toFixed(1)}deg, rgba(0,0,0,${(0.28 * t).toFixed(3)}) ${creaseAt.toFixed(1)}px, rgba(0,0,0,${(0.05 * t).toFixed(3)}) ${(creaseAt + reach * 0.35).toFixed(1)}px, rgba(255,255,255,${(0.18 * t).toFixed(3)}) ${(creaseAt + reach).toFixed(1)}px)`
      : "none";

  // The ink outline, stroked twice the border's width inside the clip so only its inner half shows (as the Tile book's).
  dom.outline.setAttribute("viewBox", `0 0 ${layerW} ${H}`);
  const onFold = (p: Point) => Math.abs((p.x - foldAt.x) * n.x + (p.y - foldAt.y) * n.y) < 0.5;
  let edges = "";
  let crease = "";
  foldedLayer.forEach((a, i) => {
    const b = foldedLayer[(i + 1) % foldedLayer.length]!;
    const seg = `M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    if (onFold(a) && onFold(b)) crease += seg;
    else edges += seg;
  });
  for (const path of [dom.edges, dom.crease]) {
    path.setAttribute("stroke", style.ink);
    path.setAttribute("stroke-width", `${style.borderWidth * 2}`);
  }
  dom.edges.setAttribute("d", edges);
  dom.crease.setAttribute("d", crease);
  // Landing on the spine side, the crease would double the page's own border: fade it out over the last stretch.
  dom.crease.setAttribute("stroke-opacity", `${Math.min(1, Math.max(0, (1 - peel.fraction) / 0.2))}`);
}

/** The peel's start `v`: where along the edge a fold is taken from, from where the pointer is (clientY) on a page's screen rect. */
export function peelHeldAt(clientY: number, top: number, height: number): number {
  return Math.max(-1, Math.min(1, (clientY - top - height / 2) / (height / 2)));
}
