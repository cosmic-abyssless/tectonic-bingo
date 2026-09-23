import { describe, expect, it, vi } from "vitest";
import { applyRosterNames } from "./pairingNames";
import type { PairingParty } from "./pairingService";
import { TectonicClient } from "./tectonicService";

function clientServing(body: unknown, status = 200) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  return { client: new TectonicClient({ baseUrl: "http://t", apiKey: "k", guildId: "g" }, fetchImpl), fetchImpl };
}

const roster = [
  { user_id: "stranger", guild_id: "g", points: 0, rsns: [{ rsn: "StrangerRsn", wom_id: "1" }, { rsn: "StrangerAlt", wom_id: "2" }] },
  { user_id: "lurker", guild_id: "g", points: 0, rsns: [{ rsn: "LurkerRsn", wom_id: "3" }] },
  { user_id: "signedUp", guild_id: "g", points: 0, rsns: [{ rsn: "OldRsn", wom_id: "4" }] },
];

const user = (discordId: string) => ({ id: discordId, discordId, discordUsername: discordId, discordGlobalName: null, discordGuildNick: null });

describe("applyRosterNames", () => {
  it("puts the clan-roster RSN ahead of the Discord name/id, but never ahead of a signup RSN", async () => {
    const parties: PairingParty[] = [
      { discordId: "stranger", user: null, rsn: null, name: "stranger" },
      { discordId: "lurker", user: user("lurker"), rsn: null, name: "lurker" },
      { discordId: "signedUp", user: user("signedUp"), rsn: "NewRsn", name: "NewRsn" },
      { discordId: "notInClan", user: null, rsn: null, name: "notInClan" },
    ];
    await applyRosterNames(parties, clientServing(roster).client);
    expect(parties.map((p) => p.name)).toEqual(["StrangerRsn", "LurkerRsn", "NewRsn", "notInClan"]);
  });

  it("skips the roster fetch when everyone has signed up", async () => {
    const { client, fetchImpl } = clientServing(roster);
    await applyRosterNames([{ discordId: "signedUp", user: user("signedUp"), rsn: "NewRsn", name: "NewRsn" }], client);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps the fallback name when the roster is unavailable", async () => {
    const parties: PairingParty[] = [{ discordId: "stranger", user: null, rsn: null, name: "stranger" }];
    await applyRosterNames(parties, clientServing({}, 500).client);
    expect(parties[0]!.name).toBe("stranger");
  });
});
