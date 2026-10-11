// User settings (shared userSettings.ts): some generated Players pick their own Board size, on a computer, a phone or
// both, through the real settings endpoint once they've signed up. The rest keep Fit screen.
import { BOARD_WIDTH_PERCENT, type BoardSize, type BoardSizeDevice, type UserSettingsPatch } from "@bingo/shared";
import type { Player } from "./people";
import type { Ctx } from "./setup";

/** Of the Players, how many change their Board size on each kind of device; of those, how many pick Custom. */
const CHANGED: Record<BoardSizeDevice, number> = { desktop: 0.25, phone: 0.15 };
const CUSTOM = 0.5;

/** Picks a Board size for some Players, at `at`; answers with how many changed one. */
export async function runBoardSizeSettings(ctx: Ctx, players: Player[], at: Date): Promise<number> {
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
    if (Object.keys(boardSize).length === 0) continue;
    await ctx.api.as(p.discordId).put("/api/me/settings", { boardSize }, { at });
    changed++;
  }
  return changed;
}
