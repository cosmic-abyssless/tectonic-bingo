import { ServiceError } from "./errors";
import { getTectonicClient, TectonicUnavailableError, type TectonicDetailedUser } from "./tectonicService";

// Async tectonic lookups for the routes (not signupService, which
// stays sync/DB-pure). One call covers both membership gating and RSN
// verification for a request. `enabled: false` means the integration isn't
// configured — no gating or verification applies, current behavior.
// `member: null` means tectonic answered and doesn't know this user; an
// outage is surfaced as a 503 rather than mistaken for non-membership.
export async function getTectonicMembership(discordId: string): Promise<{ enabled: boolean; member: TectonicDetailedUser | null }> {
  const client = getTectonicClient();
  if (!client) return { enabled: false, member: null };
  try {
    return { enabled: true, member: await client.getDetailedUser(discordId) };
  } catch (err) {
    if (err instanceof TectonicUnavailableError) {
      throw new ServiceError(503, "Clan membership check is temporarily unavailable. Please try again in a minute.");
    }
    throw err;
  }
}

// Matches the submitted RSN against the signer's tectonic-api RSNs
// case-insensitively. A client-sent "verified" claim is never trusted; this
// is the only path that can set rsnVerified: true.
export function matchRsn(member: TectonicDetailedUser | null, rsn: string): { womId: string | null; rsnVerified: boolean } {
  const match = member?.rsns.find((r) => r.rsn.toLowerCase() === rsn.trim().toLowerCase());
  return match ? { womId: match.wom_id, rsnVerified: true } : { womId: null, rsnVerified: false };
}

