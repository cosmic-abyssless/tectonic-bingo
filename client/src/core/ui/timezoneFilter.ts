import { TIME_ZONE_REGIONS, timeZoneRegion, type TimeZoneRegion } from "@bingo/shared";

// The "Timezone" filter shared by the signup roster and the draft pool: a signup's zone bucketed into a region
// (roughly who plays when), plus signups with no timezone yet.
export type RegionKey = TimeZoneRegion | "unset";

export const REGION_OPTIONS: { key: RegionKey; label: string }[] = [...TIME_ZONE_REGIONS, { key: "unset", label: "Not set" }];

export function regionOf(timezone: string | null): RegionKey {
  return timezone ? timeZoneRegion(timezone) : "unset";
}
