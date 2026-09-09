import { useEffect, useState } from "react";
import type { Team } from "@bingo/shared";

// viewingTeamId + auto-select myTeam once the shell loads (BingoPage.tsx's
// old L37-40). No dropdown open/close state here — the default theme's
// TeamSelector slot owns that with its own RAC MenuTrigger.
export function useViewingTeam(myTeam: Team | null): { viewingTeamId: string | null; setViewingTeamId: (id: string) => void } {
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
  useEffect(() => {
    if (myTeam) setViewingTeamId(myTeam.id);
  }, [myTeam]);
  return { viewingTeamId, setViewingTeamId };
}
