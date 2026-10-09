import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePendingCount } from "../api/queries";
import { bingoSlugOfPath } from "../api/bingoScope";
import { useBingoCan } from "./permissions";

const COUNT_PREFIX = /^\(\d+\) /;

/**
 * Puts the bingo's pending Submissions in the browser tab's title, "(3) Tectonic Bingo", for a Moderator or Admin on
 * any page of that bingo. Elsewhere (the list of Bingos, Site admin) and for anyone else the title has no count.
 */
export function usePendingTabTitle(): void {
  const { pathname } = useLocation();
  const slug = bingoSlugOfPath(pathname) ?? undefined;
  const canModerate = useBingoCan(slug)("moderate_bingo").allowed;
  const { data } = usePendingCount(slug, canModerate);
  const count = canModerate ? (data?.count ?? 0) : 0;

  // On every page change too: a page that sets its own title (LegalPage) puts back the one it found when it closes.
  useEffect(() => {
    const base = document.title.replace(COUNT_PREFIX, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
  }, [count, pathname]);
}
