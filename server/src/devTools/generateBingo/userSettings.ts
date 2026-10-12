// User settings (shared userSettings.ts): some generated Players pick their own Board size, on a computer, a phone or
// both, and some turn Animations down, through the real settings endpoint once they've signed up. The rest keep the
// defaults (Fit screen, All).
import { BOARD_WIDTH_PERCENT, type AnimationsSetting, type BoardSize, type BoardSizeDevice, type UserSettingsPatch } from "@bingo/shared";
import type { Player } from "./people";
import type { Ctx } from "./setup";

/** Of the Players, how many change their Board size on each kind of device; of those, how many pick Custom. */
const CHANGED: Record<BoardSizeDevice, number> = { desktop: 0.25, phone: 0.15 };
const CUSTOM = 0.5;
/** Of the Players, how many turn Animations down to Reduced, and how many Off. */
const ANIMATIONS: [AnimationsSetting, number][] = [["reduced", 0.1], ["off", 0.05]];

/** Picks a Board size, and Animations, for some Players, at `at`; answers with how many changed either. */
export async function runUserSettings(ctx: Ctx, players: Player[], at: Date): Promise<number> {
  const rng = ctx.rng.fork("board-size");
  let changed = 0;
  for (const p of players) {
    // The run's own account (--me) is a real person's: their settings are theirs to choose.
    if (p.isMe || !p.userId) continue;
    const boardSize: NonNullable<UserSettingsPatch["boardSize"]> = {};
    for (const device of ["desktop", "phone"] as const) {
      if (!rng.chance(CHANGED[device])) continue;
      const steps = (BOARD_WIDTH_PERCENT.max - BOARD_WIDTH_PERCENT.min) / BOARD_WIDTH_PERCENT.step;
      const size: BoardSize = rng.chance(CUSTOM)
        ? { mode: "custom", widthPercent: BOARD_WIDTH_PERCENT.min + rng.int(0, steps) * BOARD_WIDTH_PERCENT.step }
        : { mode: "maximize", widthPercent: 100 };
      boardSize[device] = size;
    }
    const roll = rng.float();
    let animations: AnimationsSetting | undefined;
    let below = 0;
    for (const [setting, share] of ANIMATIONS) if (animations === undefined && roll < (below += share)) animations = setting;
    if (Object.keys(boardSize).length === 0 && !animations) continue;
    await ctx.api.as(p.discordId).put("/api/me/settings", { boardSize, ...(animations && { animations }) }, { at });
    changed++;
  }
  return changed;
}
