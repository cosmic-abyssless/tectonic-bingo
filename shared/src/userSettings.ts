// User settings (the Settings page) kept on the account, so they follow the user to every browser. The colour scheme
// isn't one: it's kept in each browser (client preferences.ts).

/**
 * How big the Board is drawn. Fit screen: as big as fits the window without scrolling (on a phone, the window's
 * width). Maximize: as big as the window's larger side, so it scrolls the other way. Custom: widthPercent of the
 * window's width, scrolling sideways past 100%.
 */
export type BoardSizeMode = "fit" | "maximize" | "custom";

export interface BoardSize {
  mode: BoardSizeMode;
  /** Custom's width, as a percentage of the window's width. Kept while another mode is picked. */
  widthPercent: number;
}

/** Each kind of device has its own Board size: a phone (the site's phone layout) and anything bigger. */
export type BoardSizeDevice = "desktop" | "phone";
export const BOARD_SIZE_DEVICES: readonly BoardSizeDevice[] = ["desktop", "phone"];
export const BOARD_SIZE_DEVICE_LABELS: Record<BoardSizeDevice, string> = { desktop: "Desktop", phone: "Phone" };

export const BOARD_SIZE_MODES: readonly BoardSizeMode[] = ["fit", "maximize", "custom"];
export const BOARD_SIZE_MODE_LABELS: Record<BoardSizeMode, string> = { fit: "Fit screen", maximize: "Maximize", custom: "Custom" };

export const BOARD_WIDTH_PERCENT = { min: 50, max: 300, step: 5 } as const;
export const DEFAULT_BOARD_SIZE: BoardSize = { mode: "fit", widthPercent: 100 };

/**
 * How much of the site moves. All: everything (still less where the device asks for reduced motion, as before there
 * was a setting). Reduced: the spinning backgrounds stand still. Off: nothing animates at all.
 */
export type AnimationsSetting = "all" | "reduced" | "off";
export const ANIMATIONS_SETTINGS: readonly AnimationsSetting[] = ["all", "reduced", "off"];
export const ANIMATIONS_LABELS: Record<AnimationsSetting, string> = { all: "All", reduced: "Reduced", off: "Off" };

export interface UserSettings {
  boardSize: Record<BoardSizeDevice, BoardSize>;
  animations: AnimationsSetting;
}

export const DEFAULT_USER_SETTINGS: UserSettings = { boardSize: { desktop: DEFAULT_BOARD_SIZE, phone: DEFAULT_BOARD_SIZE }, animations: "all" };

/** PUT /api/me/settings: only what changes. */
export interface UserSettingsPatch {
  boardSize?: Partial<Record<BoardSizeDevice, Partial<BoardSize>>>;
  animations?: AnimationsSetting;
}

/** "Fit screen", "Maximize", or "Custom · 140%". */
export function boardSizeSummary(size: BoardSize): string {
  return size.mode === "custom" ? `${BOARD_SIZE_MODE_LABELS.custom} · ${size.widthPercent}%` : BOARD_SIZE_MODE_LABELS[size.mode];
}
