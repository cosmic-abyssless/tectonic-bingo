// Notifications and Catch-up (CONTEXT.md): some generated Players turn Notifications on (most with the defaults, some
// with extra kinds, some up to + Discord, whose DMs land in the dev server's fake sink), and every Moderator turns on
// Submissions waiting, all through the real settings endpoint once they've signed up. Their Inboxes then fill from the
// seeded play itself, at its spoofed times. A few Players also turn Catch-up on, and are seen on the Bingo about a day
// before the run ends, so logging in as one of them shows a Catch-up.
import type { NotificationKind, NotificationLevel } from "@bingo/shared";
import type { Player } from "./people";
import type { Ctx } from "./setup";
import { HOUR } from "./timeline";

/** Of the Players, how many turn Notifications on at all, and of those how many go up to + Discord. */
const OPT_IN = 0.45;
const DISCORD = 0.3;
/** Of those who opt in, how many turn on extra kinds beyond the defaults. */
const EXTRAS = 0.35;
const EXTRA_KINDS: NotificationKind[] = ["team_drop_approved", "team_part_completed", "superlative_reminder"];
/** Of the Players, how many turn Catch-up on. */
const CATCH_UP = 0.3;

export interface NotificationSetup {
  optedIn: Player[];
  catchUp: Player[];
}

/** Turns Notifications (and Catch-up) on for some Players, and Submissions waiting for every Moderator, at `at`. */
export async function runNotificationSettings(ctx: Ctx, players: Player[], mods: Player[], at: Date): Promise<NotificationSetup> {
  const rng = ctx.rng.fork("notifications");
  const out: NotificationSetup = { optedIn: [], catchUp: [] };
  for (const p of players) {
    // The run's own account (--me) is a real person's: their settings are theirs to choose.
    if (p.isMe || !p.userId) continue;
    const isMod = mods.includes(p);
    const optIn = isMod || rng.chance(OPT_IN);
    const catchUp = rng.chance(CATCH_UP);
    if (!optIn && !catchUp) continue;
    const level: NotificationLevel = optIn ? (rng.chance(DISCORD) ? "discord" : "app") : "off";
    const kinds: Partial<Record<NotificationKind, boolean>> = {};
    if (optIn && rng.chance(EXTRAS)) for (const kind of EXTRA_KINDS) if (rng.chance(0.6)) kinds[kind] = true;
    if (isMod) kinds.submissions_waiting = true;
    await ctx.api.as(p.discordId).put("/api/me/notifications/settings", { level, kinds, catchUpEnabled: catchUp }, { at });
    if (optIn) out.optedIn.push(p);
    if (catchUp) out.catchUp.push(p);
  }
  return out;
}

/** Each Catch-up Player is seen on the Bingo about a day before the run's end, so their Catch-up covers the last day. */
export async function seedCatchUpPresence(ctx: Ctx, catchUp: Player[]): Promise<number> {
  const at = new Date(ctx.limit.getTime() - 24 * HOUR);
  let seen = 0;
  for (const p of catchUp) {
    try {
      await ctx.api.as(p.discordId).post(`/api/bingos/${ctx.slug}/presence`, undefined, { at });
      seen++;
    } catch {
      // Not on a Team (cut from the Draft): they can't see the Bingo, so there's nothing to catch up on.
    }
  }
  return seen;
}
