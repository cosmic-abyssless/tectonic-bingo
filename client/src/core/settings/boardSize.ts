import type { BoardSize, BoardSizeDevice } from "@bingo/shared";
import { useUserSettings } from "../../api/userSettingsApi";
import { useIsPhone } from "../ui/useMediaQuery";

/** Which of the viewer's Board sizes this window uses: Phone in the site's phone layout, Desktop otherwise. */
export function useBoardSizeDevice(): BoardSizeDevice {
  return useIsPhone() ? "phone" : "desktop";
}

/** The Board size the viewer picked for this kind of device (shared userSettings.ts). */
export function useMyBoardSize(): BoardSize {
  const device = useBoardSizeDevice();
  return useUserSettings().boardSize[device];
}
