import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Key } from "react-aria-components";
import { STAGE_ORDER, type Stage } from "@bingo/shared";
import { useBingo } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { AuditLog } from "../core/mod/AuditLog";
import { ReviewQueue } from "../core/mod/ReviewQueue";
import { StageControls } from "../core/mod/StageControls";
import { SignupRoster } from "../core/mod/SignupRoster";
import { BingoSettingsForm } from "../core/admin/BingoSettingsForm";
import { ModsManager } from "../core/admin/ModsManager";
import { BoardEditor } from "../core/admin/BoardEditor";
import { LineEditor } from "../core/admin/LineEditor";
import { QuestionBuilder } from "../core/admin/QuestionBuilder";
import { TeamManager } from "../core/admin/TeamManager";
import { AppHeader } from "../core/ui/AppHeader";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { Button } from "../core/ui/Button";
import { Dialog, DialogHeader } from "../core/ui/Dialog";
import { MenuItem } from "../core/ui/Menu";
import { usePreference } from "../core/ui/preferences";
import { Tab, TabList, TabPanel, Tabs } from "../core/ui/Tabs";

// adminOnly tabs are hidden from — and their content never rendered for — a
// mod who isn't a site admin. The server enforces the same split on the
// underlying routes (requireAdmin on admin.ts vs requireBingoMod on mod.ts),
// so this is UX decluttering on top of a real boundary, not the boundary
// itself.
//
// `from`/`until` bound the stages a tab is relevant in. Outside that window
// (stage already past `until`, or not yet at `from`) the tab is either hidden
// or dimmed and moved to the end, per the mod's "outOfStageTabs" preference.
// Tabs without bounds are always shown.
const TABS: { key: string; label: string; adminOnly: boolean; from?: Stage; until?: Stage }[] = [
  { key: "submissions", label: "Submissions", adminOnly: false, from: "live" },
  { key: "signups", label: "Signups", adminOnly: false, until: "draft" },
  { key: "audit", label: "Audit log", adminOnly: false },
  { key: "settings", label: "Settings", adminOnly: true },
  { key: "board", label: "Board", adminOnly: true, until: "reveal" },
  { key: "lines", label: "Lines", adminOnly: true, until: "reveal" },
  { key: "questions", label: "Signup questions", adminOnly: true, until: "signup" },
  { key: "teams", label: "Captains", adminOnly: true, from: "signup" },
  { key: "mods", label: "Moderators", adminOnly: true },
];
type TabDef = (typeof TABS)[number];

// <main> itself is full width now — only the Signups tab (its table benefits from the room, same as the draft
// pool's) actually wants that. Every other tab's content, plus the stage stepper and tab list above them, opts
// back into the old reading width with this.
const NARROW = "mx-auto w-full max-w-6xl";

function isOutOfStage(tab: TabDef, stage: Stage): boolean {
  const idx = STAGE_ORDER.indexOf(stage);
  return (tab.until !== undefined && idx > STAGE_ORDER.indexOf(tab.until)) || (tab.from !== undefined && idx < STAGE_ORDER.indexOf(tab.from));
}

// The tab a mod most likely wants on landing (or lands back on once their current tab goes out of stage) —
// Signups while signups are open or just closed (who's in, who'll be cut, pairing people up), Captains during the
// draft (admin only; a non-admin mod gets Signups), Settings for a still-being-set-up bingo (admin only — a non-admin
// mod has no Settings tab to land on), Submissions otherwise.
function defaultTabFor(stage: Stage | undefined, isAdmin: boolean): string {
  if (stage === "signup" || stage === "captains") return "signups";
  if (stage === "draft") return isAdmin ? "teams" : "signups";
  if (stage === "planning" && isAdmin) return "settings";
  return "submissions";
}

// Mod surfaces never theme — always core/, regardless of bingo.theme.
export function ModPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: shell } = useBingo(slug);
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const stage = shell?.bingo.stage;
  const [tab, setTab] = useState(() => defaultTabFor(stage, isAdmin));
  const [outOfStageTabs, setOutOfStageTabs] = usePreference("outOfStageTabs");

  const visibleTabs = useMemo(() => {
    if (!stage) return [];
    const allowed = TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => ({ ...t, dimmed: isOutOfStage(t, stage) }));
    const current = allowed.filter((t) => !t.dimmed);
    return outOfStageTabs === "hide" ? current : [...current, ...allowed.filter((t) => t.dimmed)];
  }, [stage, isAdmin, outOfStageTabs]);

  const [showNotifPrompt, setShowNotifPrompt] = useState(
    () => "Notification" in window && Notification.permission === "default" && !localStorage.getItem("mod_notif_prompted"),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(`/b/${slug}`);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, slug]);

  useWebSocketEvent((event) => {
    if (event.type === "submission_created" && "Notification" in window && Notification.permission === "granted") {
      new Notification("New bingo submission", { body: "A new submission is pending review" });
    }
  });

  useEffect(() => {
    // isMod is per-bingo and only known once the shell loads — redirect once we know for sure.
    if (shell && !shell.isMod) navigate(`/b/${slug}`, { replace: true });
  }, [shell, navigate, slug]);

  // Land on the stage's tab once the bingo has loaded: the initial useState ran before the stage was known (so it
  // picked Submissions), and an out-of-stage tab can still be listed (dimmed), so the fallback below wouldn't move it.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !stage || !user) return;
    landed.current = true;
    setTab(defaultTabFor(stage, isAdmin));
  }, [stage, isAdmin, user]);

  // A tab the user can no longer see (isAdmin resolved to false after mount, the stage moved past it, or it's
  // just the pre-shell-load placeholder from the initial useState) shouldn't leave stale content selected.
  // Prefer the stage's natural landing tab; Settings is the fallback since it's always in-stage for an admin.
  useEffect(() => {
    if (visibleTabs.length === 0 || visibleTabs.some((t) => t.key === tab)) return;
    const preferred = defaultTabFor(stage, isAdmin);
    setTab(visibleTabs.some((t) => t.key === preferred) ? preferred : visibleTabs.some((t) => t.key === "settings") ? "settings" : visibleTabs[0].key);
  }, [visibleTabs, tab, stage, isAdmin]);

  if (!shell || !shell.isMod || !slug) return null;

  const dismissNotifPrompt = () => {
    localStorage.setItem("mod_notif_prompted", "true");
    setShowNotifPrompt(false);
  };

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader
        back={{ to: `/b/${slug}`, label: "Back to bingo" }}
        title="Mod panel"
        subtitle={shell.bingo.name}
        menuItems={
          <MenuItem id="outOfStageTabs" className="justify-between" onAction={() => setOutOfStageTabs(outOfStageTabs === "hide" ? "dim" : "hide")}>
            Out-of-stage tabs
            <span className="text-xs text-on-surface-subtle">{outOfStageTabs === "hide" ? "Hidden" : "Dimmed"}</span>
          </MenuItem>
        }
      />

      {/* Full width now (was max-w-6xl on the whole <main>) — but only the Signups tab actually wants that (its
          table benefits from the extra room the same way the draft pool's does). Everything else — the stage
          stepper, the tab list itself, and every other tab's content — keeps the old reading width via NARROW,
          since a settings form or a stage stepper spanning the full page would be awkward, not useful. */}
      <main className="w-full space-y-6 px-6 py-6">
        <div className={NARROW}>
          <StageControls slug={slug} bingo={shell.bingo} canChange={isAdmin} />
        </div>

        <PlayerProfileProvider slug={slug}>
          <Tabs selectedKey={tab} onSelectionChange={(key: Key) => setTab(String(key))}>
            <div className={NARROW}>
              <TabList>
                {visibleTabs.map((t) => (
                  <Tab key={t.key} id={t.key} dimmed={t.dimmed}>
                    {t.label}
                  </Tab>
                ))}
              </TabList>
            </div>
            <TabPanel id="submissions">
              <div className={NARROW}>
                <ReviewQueue slug={slug} />
              </div>
            </TabPanel>
            <TabPanel id="signups">
              <SignupRoster slug={slug} />
            </TabPanel>
            <TabPanel id="audit">
              <div className={NARROW}>
                <AuditLog slug={slug} />
              </div>
            </TabPanel>
            {isAdmin && (
              <>
                <TabPanel id="settings">
                  <div className={NARROW}>
                    <BingoSettingsForm slug={slug} bingo={shell.bingo} paidSignupCount={shell.paidSignupCount} potTotal={shell.potTotal} hasSignups={shell.hasSignups} />
                  </div>
                </TabPanel>
                <TabPanel id="board">
                  <div className={NARROW}>
                    <BoardEditor slug={slug} bingo={shell.bingo} categories={shell.categories} />
                  </div>
                </TabPanel>
                <TabPanel id="lines">
                  <div className={NARROW}>
                    <LineEditor slug={slug} />
                  </div>
                </TabPanel>
                <TabPanel id="questions">
                  <div className={NARROW}>
                    <QuestionBuilder slug={slug} />
                  </div>
                </TabPanel>
                <TabPanel id="teams">
                  <div className={NARROW}>
                    <TeamManager slug={slug} />
                  </div>
                </TabPanel>
                <TabPanel id="mods">
                  <div className={NARROW}>
                    <ModsManager slug={slug} />
                  </div>
                </TabPanel>
              </>
            )}
          </Tabs>
        </PlayerProfileProvider>
      </main>

      <Dialog isOpen={showNotifPrompt} onClose={dismissNotifPrompt}>
        <DialogHeader title="Enable notifications?" onClose={dismissNotifPrompt} />
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-on-surface-muted">
            Get a browser notification whenever a new submission arrives for review, even if this tab is in the background.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={dismissNotifPrompt}>
              No thanks
            </Button>
            <Button
              variant="primary"
              onPress={async () => {
                dismissNotifPrompt();
                await Notification.requestPermission();
              }}
            >
              Enable
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
