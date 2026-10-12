import { eq } from "drizzle-orm";
import { ANIMATIONS_SETTINGS, BOARD_SIZE_DEVICES, BOARD_SIZE_MODES, BOARD_WIDTH_PERCENT, DEFAULT_USER_SETTINGS, type BoardSize, type BoardSizeMode, type AnimationsSetting, type UserSettings, type UserSettingsPatch } from "@bingo/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { userSettings } from "../db/schema";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Queryable = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
type Row = typeof userSettings.$inferSelect;

function toSettings(row: Row | undefined): UserSettings {
  if (!row) return DEFAULT_USER_SETTINGS;
  return {
    boardSize: {
      desktop: { mode: row.boardDesktopMode, widthPercent: row.boardDesktopWidthPercent },
      phone: { mode: row.boardPhoneMode, widthPercent: row.boardPhoneWidthPercent },
    },
    animations: row.animations,
  };
}

/** A user's User settings: every default until they change one. */
export function getSettings(q: Queryable, userId: string): UserSettings {
  return toSettings(q.select().from(userSettings).where(eq(userSettings.userId, userId)).get());
}

function checkBoardSize(patch: unknown): Partial<BoardSize> {
  if (typeof patch !== "object" || patch === null) throw new ServiceError(400, "Invalid Board size");
  const { mode, widthPercent } = patch as Partial<BoardSize>;
  if (mode !== undefined && !BOARD_SIZE_MODES.includes(mode as BoardSizeMode)) throw new ServiceError(400, "Invalid Board size");
  if (widthPercent !== undefined && (!Number.isInteger(widthPercent) || widthPercent < BOARD_WIDTH_PERCENT.min || widthPercent > BOARD_WIDTH_PERCENT.max)) {
    throw new ServiceError(400, `The Board's width must be a whole percentage from ${BOARD_WIDTH_PERCENT.min} to ${BOARD_WIDTH_PERCENT.max}`);
  }
  return { ...(mode !== undefined && { mode }), ...(widthPercent !== undefined && { widthPercent }) };
}

/** Changes only what the patch names, and answers with the result. */
export function updateSettings(q: Queryable, userId: string, patch: UserSettingsPatch, now = new Date()): UserSettings {
  const current = getSettings(q, userId);
  const boardSize = { ...current.boardSize };
  if (patch.boardSize !== undefined) {
    if (typeof patch.boardSize !== "object" || patch.boardSize === null) throw new ServiceError(400, "Invalid Board size");
    for (const device of BOARD_SIZE_DEVICES) {
      const change = patch.boardSize[device];
      if (change !== undefined) boardSize[device] = { ...boardSize[device], ...checkBoardSize(change) };
    }
  }
  let animations = current.animations;
  if (patch.animations !== undefined) {
    if (!ANIMATIONS_SETTINGS.includes(patch.animations as AnimationsSetting)) throw new ServiceError(400, "Invalid Animations setting");
    animations = patch.animations;
  }
  const values = {
    boardDesktopMode: boardSize.desktop.mode,
    boardDesktopWidthPercent: boardSize.desktop.widthPercent,
    boardPhoneMode: boardSize.phone.mode,
    boardPhoneWidthPercent: boardSize.phone.widthPercent,
    animations,
    updatedAt: now,
  };
  q.insert(userSettings).values({ userId, ...values }).onConflictDoUpdate({ target: userSettings.userId, set: values }).run();
  return { boardSize, animations };
}
