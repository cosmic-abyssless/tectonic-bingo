import type { TooltipCallbackParams } from "ag-grid-community";

// Tooltips in the AG grids (the signup roster, the draft pool) that only appear when they'd tell you something: the
// hovered cell or header has text cut off, or the tooltip carries something the cell doesn't show (the exact time
// behind "3d ago", the CA points behind a tier). A tooltip that just repeats text already shown in full is noise.
// AG's own tooltipShowMode="whenTruncated" can't do this: it's grid-wide, and it would hide the second kind too.

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The hovered cell's or header's element, found from AG's tooltip params; null if it can't be (then the tooltip just shows). */
function hoveredElement(p: TooltipCallbackParams): HTMLElement | null {
  const column = p.column as { getColId?: () => string } | undefined;
  const colId = column?.getColId?.();
  if (!colId) return null;
  const root = document.querySelector<HTMLElement>(`.ag-root-wrapper[grid-id="${CSS.escape(p.api.getGridId())}"]`);
  if (!root) return null;
  const id = CSS.escape(colId);
  if (p.location === "header") return root.querySelector<HTMLElement>(`.ag-header-cell[col-id="${id}"]`);
  if (p.rowIndex == null) return null;
  return root.querySelector<HTMLElement>(`.ag-row[row-index="${p.rowIndex}"] .ag-cell[col-id="${id}"]`);
}

/**
 * Whether anything inside `el` (itself included) is cutting text off with an ellipsis: AG's own cell and header text,
 * and our `truncate` class, all do it that way. Plain clipping doesn't count: AG's header cell clips its resize handle,
 * which pokes a few px past it, and that isn't text anyone is missing.
 */
function hasTruncatedText(el: HTMLElement): boolean {
  for (const node of [el, ...el.querySelectorAll<HTMLElement>("*")]) {
    if (node.scrollWidth <= node.clientWidth + 1) continue;
    const style = getComputedStyle(node);
    if (style.textOverflow === "ellipsis" && style.overflowX !== "visible") return true;
  }
  return false;
}

/**
 * `text` if showing it would help, else "" (AG shows no tooltip for an empty value). Helps when the hovered cell or
 * header has truncated text, or when some part of `shows` (what the tooltip is telling you; the whole text by default)
 * isn't already visible in it.
 */
export function usefulTooltip(p: TooltipCallbackParams, text: string, shows: string[] = [text]): string {
  if (!text) return "";
  const el = hoveredElement(p);
  if (!el) return text;
  if (hasTruncatedText(el)) return text;
  const visible = normalize(el.textContent ?? "");
  return shows.every((part) => !part || visible.includes(normalize(part))) ? "" : text;
}

/** A header's tooltip, its name, shown only when the name is cut off. */
export function headerTooltip(p: TooltipCallbackParams): string {
  const colDef = p.colDef as { headerName?: string } | null | undefined;
  return usefulTooltip(p, colDef?.headerName ?? "");
}
