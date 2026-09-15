import { inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { TectonicProfile } from "@bingo/shared";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import { getTectonicClient, TectonicUnavailableError, type TectonicClient, type TectonicDetailedUser } from "./tectonicService";

type Db = BetterSQLite3Database<typeof schema>;

export interface ProfilesResult {
  profiles: Record<string, TectonicProfile>; // by our users.id; absent when tectonic doesn't know the player
  unavailable: boolean; // the lookup failed — callers show "unavailable" rather than "not registered"
}

const NO_PROFILES: ProfilesResult = { profiles: {}, unavailable: false };

/** Trim the tectonic-api payload down to what the UI shows. */
export function toProfile(u: TectonicDetailedUser): TectonicProfile {
  return {
    points: u.points,
    rank: u.rank,
    tier: u.tier ? { name: u.tier.name, icon: u.tier.icon ?? null } : null,
    achievements: [...u.achievements].sort((a, b) => a.order - b.order).map((a) => ({ name: a.name, thumbnail: a.thumbnail })),
    records: u.records.map((r) => ({
      displayName: r.display_name,
      category: r.category,
      solo: r.solo,
      valueType: r.value_type,
      value: r.value,
      date: r.date,
      teamSize: r.team.length,
    })),
    events: u.events.map((e) => ({ name: e.name, placement: e.placement, solo: e.solo })),
    combatAchievementCount: u.combat_achievements.length,
  };
}

/**
 * Live clan profiles for a set of our users, in one batched tectonic-api call
 * (the client caches by URL for 60s). Never throws: an outage yields no
 * profiles and `unavailable: true` so the draft keeps working without them.
 */
export async function fetchProfiles(db: Db, userIds: string[], client: TectonicClient | null = getTectonicClient()): Promise<ProfilesResult> {
  if (!client || userIds.length === 0) return NO_PROFILES;

  const rows = db.select({ id: users.id, discordId: users.discordId }).from(users).where(inArray(users.id, userIds)).all();
  const userIdByDiscordId = new Map(rows.map((r) => [r.discordId, r.id]));

  let detailed: TectonicDetailedUser[];
  try {
    // Sorted so the same set of players hits the same cached URL.
    detailed = await client.getDetailedUsers([...userIdByDiscordId.keys()].sort());
  } catch (err) {
    if (!(err instanceof TectonicUnavailableError)) throw err;
    return { profiles: {}, unavailable: true };
  }

  const profiles: Record<string, TectonicProfile> = {};
  for (const u of detailed) {
    const userId = userIdByDiscordId.get(u.user_id);
    if (userId) profiles[userId] = toProfile(u);
  }
  return { profiles, unavailable: false };
}
