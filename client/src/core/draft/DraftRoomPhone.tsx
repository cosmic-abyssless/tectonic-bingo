import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { useElementHeight } from "../ui/useElementHeight";

type PhoneTab = "players" | "teams";

/**
 * The draft room laid out for a phone, from the same pieces DraftRoom builds for the desktop (the status, the
 * on-the-clock banner, the team rosters, the pool): the banner and a Players / Teams switch pinned under the page
 * header, and one of the two below it. Players is the pool as a list of cards (DraftPoolList); Teams is every team's
 * roster, two to a row, so the picks so far read top to bottom rather than in a row too wide for the screen.
 *
 * A lead (or mod) starts on Players, a spectator on Teams, and anyone is brought to Players when it becomes their pick.
 */
export function DraftRoomPhone({
  status,
  banner,
  rosters,
  noTeams,
  finalTeams,
  poolCount,
  poolGlow,
  isMyTurn,
  lead,
  pool,
  extras,
}: {
  status: ReactNode;
  /** Whose turn it is (OnTheClockBanner, embedded), or undefined when no pick is on the clock. */
  banner: ReactNode;
  rosters: ReactNode[];
  noTeams: boolean;
  /** The finished draft's teams, in place of the rosters. */
  finalTeams: ReactNode;
  poolCount: number;
  poolGlow: CSSProperties | undefined;
  isMyTurn: boolean;
  lead: boolean;
  pool: ReactNode;
  extras: ReactNode;
}) {
  const [tab, setTab] = useState<PhoneTab>(lead ? "players" : "teams");
  useEffect(() => {
    if (isMyTurn) setTab("players");
  }, [isMyTurn]);

  // Pinned under the page header, whose height is measured (it wraps on a phone).
  const [pageHeader, setPageHeader] = useState<Element | null>(null);
  useEffect(() => setPageHeader(document.querySelector("header")), []);
  const headerHeight = useElementHeight(pageHeader);

  return (
    <div className="space-y-3 px-3 pb-6 pt-3">
      {status}

      {/* The pinned bar: a strip of the page's own background above the panel, so a theme's sticker over the panel's
          top edge has room and the list scrolling under it doesn't show through the gap. */}
      <div className="sticky z-20 -mx-3 bg-background px-3 pb-2 pt-4" style={{ top: headerHeight }}>
        <Panel header={banner} padding="sm">
          <div role="group" aria-label="Show" className="grid grid-cols-2 gap-2">
            <TabButton active={tab === "players"} onPress={() => setTab("players")}>
              Players <span className="num opacity-70">({poolCount})</span>
            </TabButton>
            <TabButton active={tab === "teams"} onPress={() => setTab("teams")}>
              Teams
            </TabButton>
          </div>
        </Panel>
      </div>

      {tab === "players" ? (
        <Panel className="transition-shadow" style={poolGlow}>
          {pool}
        </Panel>
      ) : (
        (finalTeams ?? (
          <Panel>
            <div className="grid grid-cols-2 gap-x-2 gap-y-3">{rosters}</div>
            {noTeams && <p className="text-sm text-on-surface-subtle">No teams yet.</p>}
          </Panel>
        ))
      )}

      {extras}
    </div>
  );
}

function TabButton({ active, onPress, children }: { active: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Button aria-pressed={active} variant={active ? "primary" : "secondary"} size="sm" className="w-full" onPress={onPress}>
      {children}
    </Button>
  );
}
