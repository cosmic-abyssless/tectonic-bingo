import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { Panel } from "../ui/Panel";
import { useElementHeight } from "../ui/useElementHeight";

type PhoneTab = "players" | "teams";

/**
 * The draft room laid out for a phone, from the same pieces DraftRoom builds for the desktop (the status, the
 * on-the-clock banner, the team rosters, the pool): one panel whose top — the banner (compact) and the Players / Teams
 * tabs — stays pinned under the page header while the tab's content scrolls beneath it. Players is the pool as a list
 * of cards (DraftPoolList); Teams is every team's roster, two to a row, so the picks so far read top to bottom rather
 * than in a row too wide for the screen.
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
  /** Whose turn it is (OnTheClockBanner, embedded and compact), or undefined when no pick is on the clock. */
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

      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as PhoneTab)}>
        {/* The Players tab frames the whole panel in the picking team's colour on your turn, as the table does. */}
        <Panel className="transition-shadow" style={tab === "players" ? poolGlow : undefined}>
          {/* The pinned top: full bleed across the panel's padding, on the panel's own fill so what scrolls under it
              doesn't show through. */}
          <div className="sticky z-20 -mx-4 -mt-4 mb-4 bg-surface" style={{ top: headerHeight }}>
            {banner}
            <TabList aria-label="Draft room" className="flex border-b border-outline">
              <PhoneTabButton id="players">
                Players <span className="num opacity-70">({poolCount})</span>
              </PhoneTabButton>
              <PhoneTabButton id="teams">Teams</PhoneTabButton>
            </TabList>
          </div>

          <TabPanel id="players" className="outline-none">
            {pool}
          </TabPanel>
          <TabPanel id="teams" className="outline-none">
            {finalTeams ?? (
              <>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">{rosters}</div>
                {noTeams && <p className="text-sm text-on-surface-subtle">No teams yet.</p>}
              </>
            )}
          </TabPanel>
        </Panel>
      </Tabs>

      {extras}
    </div>
  );
}

/** One of the two tabs: half the row each, the selected one underlined in the accent colour. data-draft-tab: a hook for a theme's CSS. */
function PhoneTabButton({ id, children }: { id: PhoneTab; children: ReactNode }) {
  return (
    <Tab
      id={id}
      data-draft-tab=""
      className="relative flex-1 cursor-pointer px-3 py-2.5 text-center text-sm font-semibold text-on-surface-muted outline-none transition-colors hover:text-on-surface focus-visible:text-on-surface selected:text-on-surface selected:after:absolute selected:after:inset-x-3 selected:after:-bottom-px selected:after:h-[3px] selected:after:bg-accent"
    >
      {children}
    </Tab>
  );
}
