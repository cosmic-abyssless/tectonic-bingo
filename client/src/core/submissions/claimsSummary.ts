import type { Claim } from "@bingo/shared";

// Human-readable summary of a submission's claims, e.g. "2× Bruma torch, Vorki".
export function claimsSummary(claims: Claim[]): string {
  const parts = claims
    .filter((c) => c.itemName !== null)
    .map((c) => `${c.quantity > 1 ? `${c.quantity}× ` : ""}${c.itemName}`);
  return parts.length > 0 ? parts.join(", ") : "(no items claimed — judged manually)";
}
