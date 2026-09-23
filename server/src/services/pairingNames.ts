import type { PairingParty } from "./pairingService";
import { getTectonicClient, TectonicUnavailableError, type TectonicClient } from "./tectonicService";

/**
 * Names every party that hasn't signed up (no RSN) by their clan-roster RSN — the same label the partner picker
 * showed them under — ahead of the Discord name / Discord id `party` fell back to. Mutates `name` in place.
 *
 * Only fetches the roster when some party actually needs it, and the client caches it for 60s. A roster outage
 * just leaves the fallback name: a pairing hint isn't worth failing the page over.
 */
export async function applyRosterNames(parties: PairingParty[], client: TectonicClient | null = getTectonicClient()): Promise<void> {
  const unsigned = parties.filter((p) => !p.rsn);
  if (!unsigned.length || !client) return;
  let rsnByDiscordId: Map<string, string>;
  try {
    const roster = await client.getRoster();
    rsnByDiscordId = new Map(roster.flatMap((u) => (u.rsns.length ? [[u.user_id, u.rsns[0]!.rsn] as const] : [])));
  } catch (err) {
    if (err instanceof TectonicUnavailableError) return;
    throw err;
  }
  for (const p of unsigned) {
    const rosterRsn = rsnByDiscordId.get(p.discordId);
    if (rosterRsn) p.name = rosterRsn;
  }
}

/** Every party in a getPairingState result, for applyRosterNames. */
export function partiesInPairingState(state: {
  partner: PairingParty | null;
  outgoing: { target: PairingParty } | null;
  incoming: { requester: PairingParty }[];
  lastOutcome: { other: PairingParty } | null;
}): PairingParty[] {
  return [state.partner, state.outgoing?.target, ...state.incoming.map((r) => r.requester), state.lastOutcome?.other].filter((p): p is PairingParty => !!p);
}
