import { describeValuedAs, type Claim, type ValuedAs } from "@bingo/shared";

// Human-readable summary of a submission's claims, e.g. "2× Bruma torch, Vorki".
export function claimsSummary(claims: Claim[]): string {
  const parts = claims
    .filter((c) => c.itemName !== null)
    .map((c) => `${c.quantity > 1 ? `${c.quantity}× ` : ""}${c.itemName}`);
  return parts.length > 0 ? parts.join(", ") : "(no items claimed — judged manually)";
}

/** A submission's GP value: the sum of its claims' GP values, or null when none of them has one. */
export function claimsGpValue(claims: Claim[]): number | null {
  const valued = claims.filter((c) => c.gpValue !== null);
  return valued.length ? valued.reduce((sum, c) => sum + c.gpValue!, 0) : null;
}

/**
 * One line per item claim with its GP value, e.g. "2× Bruma torch: 1.2K GP" (a tooltip's breakdown). A claim whose
 * Task is Valued as something says so: "Gold ring (Vardorvis, Ultor vestige ÷ 3): 33M GP".
 */
export function claimsGpBreakdown(claims: Claim[], format: (gp: number | null) => string, valuedAsByNodeId: ReadonlyMap<string, ValuedAs> = new Map()): string {
  return claims
    .filter((c) => c.itemName !== null)
    .map((c) => {
      const valuedAs = valuedAsByNodeId.get(c.nodeId);
      const why = valuedAs ? ` (${[valuedAs.source, describeValuedAs(valuedAs)].filter(Boolean).join(", ")})` : "";
      return `${c.quantity > 1 ? `${c.quantity}× ` : ""}${c.itemName}${why}: ${c.gpValue === null ? "no GP value" : `${format(c.gpValue)} GP`}`;
    })
    .join("\n");
}
