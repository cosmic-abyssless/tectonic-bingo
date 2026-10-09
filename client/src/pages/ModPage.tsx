import { useEscapeBack } from "../core/ui/useEscapeBack";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useBingoHeader, useBingoMenuEntries } from "../headless";
import type { Key } from "react-aria-components";
import { STAGE_ORDER, type Stage } from "@bingo/shared";
import { useBingo, usePendingCount } from "../api/queries";
import { useBoardDraftStatus } from "../api/adminQueries";
import { useCan, usePageAccess } from "../headless/permissions";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { AuditLog } from "../core/mod/AuditLog";
import { AUDIT_FILTER_PARAMS } from "../core/mod/auditFilters";
import { ReviewQueue, SUBMISSION_FILTER_PARAMS } from "../core/mod/ReviewQueue";
import { StageControls } from "../core/mod/StageControls";
import { WrappedControls } from "../core/mod/WrappedControls";
import { SignupRoster } from "../core/mod/SignupRoster";
import { BingoSettingsForm } from "../core/admin/BingoSettingsForm";
import { PermissionsPanel } from "../core/admin/PermissionsPanel";
import { AchievementsManager } from "../core/admin/AchievementsManager";
import { BoardEditor } from "../core/admin/BoardEditor";
import { LineEditor } from "../core/admin/LineEditor";
import { QuestionBuilder } from "../core/admin/QuestionBuilder";
import { FeedbackResults } from "../core/feedback/FeedbackResults";
import { SuperlativesManager } from "../core/admin/SuperlativesManager";
import { TeamManager } from "../core/admin/TeamManager";
import { WrappedArtManager } from "../core/admin/WrappedArtManager";
import { AppHeader } from "../core/ui/AppHeader";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { Button } from "../core/ui/Button";
import { Badge, Notice } from "../core/ui/Card";
import { InfoIcon } from "../core/ui/icons";
import { Dialog, DialogHeader } from "../core/ui/Dialog";
import { usePreference } from "../core/ui/preferences";
import { Tab, TabList, TabPanel, Tabs } from "../core/ui/Tabs";
import { useSetUrlParams, useUrlParam } from "../core/ui/useUrlParam";

// adminOnly tabs are hidden from — and their content never rendered for — a
// mod who may not administer the bingo. The server enforces the same split on the
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
  // The roster (who's playing, on which account, their buy-ins) matters all the way through.
  { key: "signups", label: "Signups", adminOnly: false },
  { key: "audit", label: "Audit log", adminOnly: false },
  // The Feedback form's results (CONTEXT.md "Feedback form"): the Bingo has to be Finished for there to be any.
  { key: "feedback", label: "Feedback", adminOnly: false, from: "complete" },
  { key: "settings", label: "Settings", adminOnly: true },
  { key: "achievements", label: "Achievements", adminOnly: true },
  { key: "board", label: "Board", adminOnly: true, until: "reveal" },
  { key: "lines", label: "Lines", adminOnly: true, until: "reveal" },
  { key: "questions", label: "Signup questions", adminOnly: true, until: "signup" },
  // Feedback questions can be edited in any stage.
  { key: "feedback-questions", label: "Feedback questions", adminOnly: true },
  { key: "superlatives", label: "Superlatives", adminOnly: true },
  { key: "teams", label: "Captains", adminOnly: true, from: "signup" },
  { key: "permissions", label: "Permissions", adminOnly: true },
  { key: "wrapped-art", label: "Wrapped", adminOnly: true },
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
function defaultTabFor(stage: Stage | undefined, canAdminister: boolean): string {
  if (stage === "signup" || stage === "captains") return "signups";
  if (stage === "draft") return canAdminister ? "teams" : "signups";
  if (stage === "planning" && canAdminister) return "settings";
  return "submissions";
}

// Mod surfaces never theme — always core/, regardless of bingo.theme.
export function ModPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: shell } = useBingo(slug);
  // The panel is for whoever may moderate the bingo; its admin-only tabs for whoever may administer it.
  const canAdminister = useCan("administer_bingo", slug).allowed;
  // Losing moderate_bingo while here (removed as a Moderator) sends them back to the bingo, with a toast.
  const mayModerate = usePageAccess(slug, (can) => can("moderate_bingo").allowed, "moderate_bingo", shell?.bingo.name);
  const stage = shell?.bingo.stage;
  // The Submissions tab's count: the same live one as the tab title and the board's Mod panel link.
  const pendingCount = usePendingCount(slug, mayModerate).data?.count ?? 0;
  const [urlTab] = useUrlParam("tab");
  const setUrl = useSetUrlParams();
  const [outOfStageTabs, setOutOfStageTabs] = usePreference("outOfStageTabs");
  // The same "This Bingo" entries as every other page of the bingo, then the panel's own setting.
  const bingoMenuEntries = useBingoMenuEntries(slug ?? "", useBingoHeader(slug ?? ""));

  const historical = shell?.historical ?? null;
  // The Draft board (CONTEXT.md): while it has unpublished changes, the Board tab says so (Admins only), and it and the
  // Lines tab stay in stage whatever the stage, so the changes are never out of sight.
  const { data: draftStatus } = useBoardDraftStatus(slug ?? "", !!slug && canAdminister && !historical);
  const unpublished = canAdminister && !!draftStatus?.hasChanges;
  const visibleTabs = useMemo(() => {
    if (!stage) return [];
    // A Historical Bingo (CONTEXT.md) is read-only: only the lists of what it recorded, whatever the stage says, and for
    // Admins its Board where it recorded Tasks (locked, as a Finished Bingo's is), to check how the old rules came across.
    if (historical)
      return TABS.filter(
        (t) => (t.key === "submissions" && historical.submissions) || (t.key === "signups" && historical.signupRoster) || (t.key === "board" && historical.tasks && canAdminister),
      ).map((t) => ({ ...t, dimmed: false }));
    const allowed = TABS.filter((t) => !t.adminOnly || canAdminister).map((t) => ({ ...t, dimmed: isOutOfStage(t, stage) && !(unpublished && (t.key === "board" || t.key === "lines")) }));
    const current = allowed.filter((t) => !t.dimmed);
    return outOfStageTabs === "hide" ? current : [...current, ...allowed.filter((t) => t.dimmed)];
  }, [stage, canAdminister, outOfStageTabs, historical, unpublished]);

  // The tab is in the URL (?tab=...) so a link opens it. Without one, or with one this mod can't see (an admin-only
  // tab, or one the stage has moved past), it's the stage's natural landing tab; Settings is the fallback since it's
  // always in-stage for an admin.
  const tab = useMemo(() => {
    if (urlTab && visibleTabs.some((t) => t.key === urlTab)) return urlTab;
    const preferred = defaultTabFor(stage, canAdminister);
    if (visibleTabs.length === 0 || visibleTabs.some((t) => t.key === preferred)) return preferred;
    return visibleTabs.some((t) => t.key === "settings") ? "settings" : visibleTabs[0]!.key;
  }, [urlTab, visibleTabs, stage, canAdminister]);
  // One tab's filters (in the URL too) don't carry over to the next.
  const setTab = (key: string) => {
    if (key !== tab) setUrl({ tab: key, ...Object.fromEntries([...SUBMISSION_FILTER_PARAMS, ...AUDIT_FILTER_PARAMS].map((p) => [p, null])) });
  };

  const [showNotifPrompt, setShowNotifPrompt] = useState(
    () => "Notification" in window && Notification.permission === "default" && !localStorage.getItem("mod_notif_prompted"),
  );

  useEscapeBack(`/b/${slug}`);

  useWebSocketEvent((event) => {
    if (event.type === "submission_created" && "Notification" in window && Notification.permission === "granted") {
      new Notification("New bingo submission", { body: "A new submission is pending review" });
    }
  });

  if (!shell || !mayModerate || !slug) return null;

  const dismissNotifPrompt = () => {
    localStorage.setItem("mod_notif_prompted", "true");
    setShowNotifPrompt(false);
  };

  return (
    // Around the header too: its account menu opens the viewer's own profile.
    <PlayerProfileProvider slug={slug}>
      <div className="min-h-dvh bg-background text-on-surface">
        <AppHeader
          title="Mod panel"
          subtitle={shell.bingo.name}
          menuEntries={[
            ...bingoMenuEntries,
            {
              id: "outOfStageTabs",
              text: "Out-of-stage tabs",
              label: "Out-of-stage tabs",
              badge: <span className="ml-auto pl-3 text-xs text-on-surface-subtle">{outOfStageTabs === "hide" ? "Hidden" : "Dimmed"}</span>,
              onAction: () => setOutOfStageTabs(outOfStageTabs === "hide" ? "dim" : "hide"),
            },
          ]}
        />

        {/* Full width now (was max-w-6xl on the whole <main>) — but only the Signups tab actually wants that (its
            table benefits from the extra room the same way the draft pool's does). Everything else — the stage
            stepper, the tab list itself, and every other tab's content — keeps the old reading width via NARROW,
            since a settings form or a stage stepper spanning the full page would be awkward, not useful. */}
        <main className="w-full space-y-6 px-6 py-6">
          {historical ? (
            <div className={NARROW}>
              <Notice tone="info" icon={<InfoIcon size={14} />}>
                <strong>A historical Bingo is read-only.</strong> It was imported from another website: its stage, Board, Teams and settings can't be changed here. A Site Admin can delete it from Site admin.
              </Notice>
            </div>
          ) : (
            <div className={NARROW}>
              <StageControls slug={slug} bingo={shell.bingo} canChange={canAdminister} />
            </div>
          )}
          {shell.bingo.stage === "complete" && !historical && (
            <div className={NARROW}>
              <WrappedControls slug={slug} />
            </div>
          )}

          {/* A sparse Historical Bingo recorded nothing a tab lists: the notice above is all there is. */}
          {visibleTabs.length > 0 && (
            <Tabs selectedKey={tab} onSelectionChange={(key: Key) => setTab(String(key))}>
              <div className={NARROW}>
                <TabList>
                  {visibleTabs.map((t) => (
                    <Tab key={t.key} id={t.key} dimmed={t.dimmed}>
                      {t.label}
                      {t.key === "submissions" && pendingCount > 0 && (
                        <Badge tone="warn" className="num ml-1.5">
                          {pendingCount}
                        </Badge>
                      )}
                      {t.key === "board" && unpublished && (
                        <Badge tone="warn" className="ml-1.5">
                          Unpublished
                        </Badge>
                      )}
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
              <TabPanel id="feedback">
                <div className={NARROW}>
                  <FeedbackResults slug={slug} />
                </div>
              </TabPanel>
              {/* Offered on a Historical Bingo too, where it recorded Tasks (the tab list above decides), and locked there. */}
              {canAdminister && (
                <TabPanel id="board">
                  <div className={NARROW}>
                    <BoardEditor slug={slug} bingo={shell.bingo} />
                  </div>
                </TabPanel>
              )}
              {canAdminister && !historical && (
                <>
                  <TabPanel id="settings">
                    <div className={NARROW}>
                      <BingoSettingsForm slug={slug} bingo={shell.bingo} paidSignupCount={shell.paidSignupCount} potTotal={shell.potTotal} hasSignups={shell.hasSignups} />
                    </div>
                  </TabPanel>
                  <TabPanel id="achievements">
                    <div className={NARROW}>
                      <AchievementsManager slug={slug} bingo={shell.bingo} />
                    </div>
                  </TabPanel>
                  <TabPanel id="lines">
                    <div className={NARROW}>
                      <LineEditor slug={slug} bingo={shell.bingo} />
                    </div>
                  </TabPanel>
                  <TabPanel id="questions">
                    <div className={NARROW}>
                      <QuestionBuilder slug={slug} />
                    </div>
                  </TabPanel>
                  <TabPanel id="feedback-questions">
                    <div className={NARROW}>
                      <QuestionBuilder slug={slug} form="feedback" />
                    </div>
                  </TabPanel>
                  <TabPanel id="superlatives">
                    <div className={NARROW}>
                      <SuperlativesManager slug={slug} bingo={shell.bingo} />
                    </div>
                  </TabPanel>
                  <TabPanel id="teams">
                    <div className={NARROW}>
                      <TeamManager slug={slug} />
                    </div>
                  </TabPanel>
                  <TabPanel id="permissions">
                    {/* Every role and what it may do; Moderators and Staff, granted per Bingo, are also managed here. */}
                    <div className={NARROW}>
                      <PermissionsPanel slug={slug} bingo={shell.bingo} />
                    </div>
                  </TabPanel>
                  <TabPanel id="wrapped-art">
                    <div className={`${NARROW} space-y-8`}>
                      <WrappedArtManager slug={slug} />
                    </div>
                  </TabPanel>
                </>
              )}
            </Tabs>
          )}
        </main>

        {/* Nothing new ever arrives for a Historical Bingo. */}
        <Dialog isOpen={showNotifPrompt && !historical} onClose={dismissNotifPrompt}>
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
    </PlayerProfileProvider>
  );
}
