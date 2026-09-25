import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Escape leaves the page for `to` (the mod panel, draft room and stats go back to the board). Not while typing, or
 * from a popup or dialog: there Escape is theirs (cancelling a table cell's edit, closing a menu), and one that
 * something already handled (defaultPrevented) is left alone too.
 */
export function useEscapeBack(to: string, enabled = true): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], .ag-popup, .ag-cell-inline-editing")) return;
      navigate(to);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, to, enabled]);
}
