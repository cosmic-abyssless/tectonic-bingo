import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useBingo } from "../../api/queries";
import { useClearUrlParams, useUrlParam } from "../ui/useUrlParam";
import { AchievementPopupHost } from "./AchievementPopupHost";
import { AchievementsModal } from "./AchievementsModal";

const ACHIEVEMENTS_PARAM = "achievements";

const OpenAchievementsContext = createContext<(() => void) | null>(null);
const AchievementsEligibleContext = createContext(false);

/**
 * Hosts the Achievements modal and the unlock-popup queue for one bingo page (CONTEXT.md "Achievement"). Mount once
 * per page, inside the ThemeProvider, alongside PlayerProfileProvider (see pages/BingoPage.tsx, pages/StatsPage.tsx)
 * — both are only offered to a Player on a Team in this bingo, while the feature is switched on.
 */
export function AchievementsProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const { data: shell } = useBingo(slug);
  const eligible = !!shell?.myTeam && !!shell?.bingo.achievementsEnabled;

  const [param, setParam] = useUrlParam(ACHIEVEMENTS_PARAM);
  const close = useClearUrlParams([ACHIEVEMENTS_PARAM]);
  // Opening pushes a history entry, like the player card, so Back closes it.
  const open = useCallback(() => setParam("1", { push: true }), [setParam]);

  return (
    <OpenAchievementsContext.Provider value={eligible ? open : null}>
      <AchievementsEligibleContext.Provider value={eligible}>
        {children}
        {eligible && <AchievementPopupHost slug={slug} onOpen={open} />}
        <AchievementsModal slug={slug} isOpen={eligible && param === "1"} onClose={close} />
      </AchievementsEligibleContext.Provider>
    </OpenAchievementsContext.Provider>
  );
}

/** Opens the Achievements modal from anywhere under AchievementsProvider; null where the viewer isn't eligible or there's no provider. */
export function useOpenAchievements(): (() => void) | null {
  return useContext(OpenAchievementsContext);
}

/** Whether the viewer is a Player on a Team in this bingo with the feature switched on — gates the header menu entries. */
export function useAchievementsEligible(): boolean {
  return useContext(AchievementsEligibleContext);
}
