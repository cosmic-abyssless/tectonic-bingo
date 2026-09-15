import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { TectonicClient, type TectonicDetailedUser } from "./tectonicService";
import { fetchProfiles, toProfile } from "./tectonicProfileService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});

afterEach(() => {
  sqlite.close();
});

const detailed: TectonicDetailedUser = {
  user_id: "discord-1",
  guild_id: "g",
  points: 420,
  rank: 3,
  tier: { name: "ruby", icon: "ruby", role_id: "r", min_points: 400, display_order: 5 },
  rsns: [{ rsn: "Alice", wom_id: "1" }],
  records: [
    { record_id: 9, boss_name: "cox", display_name: "Chambers of Xeric", category: "Chambers of Xeric", solo: false, value_type: "time", date: "2025-01-01T00:00:00Z", value: 2500, team: [{ user_id: "discord-1", guild_id: "g" }, { user_id: "discord-2", guild_id: "g" }] },
    { record_id: 10, boss_name: "tob", display_name: "Theatre of Blood", category: "Theatre of Blood", solo: false, value_type: "time", date: "2024-01-01T00:00:00Z", value: 1800, team: [{ user_id: "discord-1", guild_id: "g" }] },
  ],
  events: [{ name: "Spring Bingo", wom_id: "w", guild_id: "g", placement: 1, position_cutoff: 3, solo: false }],
  achievements: [
    { name: "Grandmaster", thumbnail: "gm.png", discord_icon: "<:gm:1>", order: 2 },
    { name: "Maxed", thumbnail: "max.png", discord_icon: "<:max:2>", order: 1 },
  ],
  combat_achievements: [{ name: "a" }, { name: "b" }],
};

// Record 10 has since been beaten off the leaderboard.
const positions = new Map([[9, 2]]);

const guild = { guild_id: "g", position_count: 3, records: [{ record_id: 9, position: 2, value: 2500, boss_name: "cox", date: "2025-01-01T00:00:00Z", guild_id: "g" }] };

function clientReturning(status: number, body: unknown) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  return { client: new TectonicClient({ baseUrl: "http://t", apiKey: "k", guildId: "g" }, fetchImpl), fetchImpl };
}

/** Serves the users endpoint and the detailed guild endpoint. */
function clientServing(users: unknown, status = 200) {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const body = String(url).includes("detailed=true") ? guild : users;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { client: new TectonicClient({ baseUrl: "http://t", apiKey: "k", guildId: "g" }, fetchImpl), fetchImpl };
}

describe("toProfile", () => {
  it("trims the payload, orders achievements, and keeps only records that still place", () => {
    const profile = toProfile(detailed, positions);
    expect(profile).toEqual({
      points: 420,
      rank: 3,
      tier: { name: "ruby", icon: "ruby" },
      achievements: [
        { name: "Maxed", thumbnail: "max.png" },
        { name: "Grandmaster", thumbnail: "gm.png" },
      ],
      records: [{ displayName: "Chambers of Xeric", category: "Chambers of Xeric", solo: false, valueType: "time", value: 2500, date: "2025-01-01T00:00:00Z", teamSize: 2, position: 2 }],
      events: [{ name: "Spring Bingo", placement: 1, solo: false }],
    });
  });

  it("keeps a missing tier or icon as null", () => {
    expect(toProfile({ ...detailed, tier: undefined }, positions).tier).toBeNull();
    expect(toProfile({ ...detailed, tier: { ...detailed.tier!, icon: undefined } }, positions).tier).toEqual({ name: "ruby", icon: null });
  });
});

describe("fetchProfiles", () => {
  it("batches one users request plus the guild leaderboard and maps results back by our user id", async () => {
    const [alice, bob] = db
      .insert(schema.users)
      .values([
        { discordId: "discord-1", discordUsername: "alice" },
        { discordId: "discord-2", discordUsername: "bob" },
      ])
      .returning()
      .all();
    const { client, fetchImpl } = clientServing([detailed]);

    const result = await fetchProfiles(db, [alice!.id, bob!.id], client);

    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).sort();
    expect(urls).toEqual(["http://t/api/v1/guilds/g/users/discord-1,discord-2", "http://t/api/v1/guilds/g?detailed=true"]);
    expect(result.unavailable).toBe(false);
    expect(result.profiles[alice!.id]?.points).toBe(420);
    expect(result.profiles[alice!.id]?.records.map((r) => r.position)).toEqual([2]);
    expect(result.profiles[bob!.id]).toBeUndefined(); // tectonic doesn't know bob
  });

  it("reports unavailable instead of throwing when tectonic-api is down", async () => {
    const [alice] = db.insert(schema.users).values({ discordId: "discord-1", discordUsername: "alice" }).returning().all();
    const { client } = clientReturning(503, { error: "down" });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await fetchProfiles(db, [alice!.id], client);
    warn.mockRestore();

    expect(result).toEqual({ profiles: {}, unavailable: true });
  });

  it("skips the lookup when unconfigured or there is nobody to look up", async () => {
    const { client, fetchImpl } = clientReturning(200, []);
    expect(await fetchProfiles(db, [], client)).toEqual({ profiles: {}, unavailable: false });
    expect(await fetchProfiles(db, ["x"], null)).toEqual({ profiles: {}, unavailable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
