/** A GP amount the way players shorten it: 1.5b, 12.3m, 450k, 900. Null (no GP value) is "—". */
export function formatGp(gp: number | null | undefined): string {
  if (gp === null || gp === undefined) return "—";
  const abs = Math.abs(gp);
  const short = (n: number, unit: string) => `${Number(n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)).toLocaleString()}${unit}`;
  if (abs >= 1_000_000_000) return short(gp / 1_000_000_000, "b");
  if (abs >= 1_000_000) return short(gp / 1_000_000, "m");
  if (abs >= 1_000) return short(gp / 1_000, "k");
  return gp.toLocaleString();
}

/** The exact amount, for a tooltip: "12,345,678 GP". */
export const formatGpExact = (gp: number): string => `${gp.toLocaleString()} GP`;
