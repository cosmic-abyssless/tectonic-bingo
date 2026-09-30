import { Navigate } from "react-router-dom";
import { useBingos } from "../api/queries";

// The site's front door ("/"): everyone lands straight on the most recent Bingo that isn't Historical (CONTEXT.md),
// since there's realistically only one being played at a time (issue #3). The list the viewer sees is newest first,
// Historical Bingos last (listBingos), so that's its first non-Historical entry. With none, or when the list can't be
// read, it's the list of all Bingos at /bingos, which says why.
export function LatestBingoRedirect() {
  const { data, isLoading, error } = useBingos();
  if (isLoading) return null;
  const latest = error ? undefined : data?.bingos.find((b) => !b.historical);
  return <Navigate to={latest ? `/b/${latest.slug}` : "/bingos"} replace />;
}
