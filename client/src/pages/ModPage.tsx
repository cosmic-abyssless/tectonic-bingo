import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Key } from "react-aria-components";
import { useBingo } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useWebSocketEvent } from "../context/WebSocketContext";
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
import { Button } from "../core/ui/Button";
import { Dialog, DialogHeader } from "../core/ui/Dialog";
import { Tab, TabList, TabPanel, Tabs } from "../core/ui/Tabs";

// adminOnly tabs are hidden from — and their content never rendered for — a
// mod who isn't a site admin. The server enforces the same split on the
// underlying routes (requireAdmin on admin.ts vs requireBingoMod on mod.ts),
// so this is UX decluttering on top of a real boundary, not the boundary
// itself.
const TABS = [
  { key: "submissions", label: "Submissions", adminOnly: false },
  { key: "signups", label: "Signups", adminOnly: false },
  { key: "settings", label: "Settings", adminOnly: true },
  { key: "board", label: "Board", adminOnly: true },
  { key: "lines", label: "Lines", adminOnly: true },
  { key: "questions", label: "Signup questions", adminOnly: true },
  { key: "teams", label: "Teams", adminOnly: true },
  { key: "mods", label: "Moderators", adminOnly: true },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Mod surfaces never theme — always core/, regardless of bingo.theme.
export function ModPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: shell } = useBingo(slug);
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [tab, setTab] = useState<Tab>("submissions");

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

  // A tab the user can no longer see (e.g. isAdmin resolved to false after
  // mount) shouldn't leave stale admin-only content selected.
  useEffect(() => {
    const current = TABS.find((t) => t.key === tab);
    if (current?.adminOnly && !isAdmin) setTab("submissions");
  }, [isAdmin, tab]);

  if (!shell || !shell.isMod || !slug) return null;

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  const dismissNotifPrompt = () => {
    localStorage.setItem("mod_notif_prompted", "true");
    setShowNotifPrompt(false);
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Mod panel" subtitle={shell.bingo.name} />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
        <StageControls slug={slug} bingo={shell.bingo} />

        <Tabs selectedKey={tab} onSelectionChange={(key: Key) => setTab(key as Tab)}>
          <TabList>
            {visibleTabs.map((t) => (
              <Tab key={t.key} id={t.key}>
                {t.label}
              </Tab>
            ))}
          </TabList>
          <TabPanel id="submissions">
            <ReviewQueue slug={slug} />
          </TabPanel>
          <TabPanel id="signups">
            <SignupRoster slug={slug} />
          </TabPanel>
          {isAdmin && (
            <>
              <TabPanel id="settings">
                <BingoSettingsForm slug={slug} bingo={shell.bingo} paidSignupCount={shell.paidSignupCount} potTotal={shell.potTotal} />
              </TabPanel>
              <TabPanel id="board">
                <BoardEditor slug={slug} bingo={shell.bingo} categories={shell.categories} />
              </TabPanel>
              <TabPanel id="lines">
                <LineEditor slug={slug} />
              </TabPanel>
              <TabPanel id="questions">
                <QuestionBuilder slug={slug} />
              </TabPanel>
              <TabPanel id="teams">
                <TeamManager slug={slug} />
              </TabPanel>
              <TabPanel id="mods">
                <ModsManager slug={slug} />
              </TabPanel>
            </>
          )}
        </Tabs>
      </main>

      <Dialog isOpen={showNotifPrompt} onClose={dismissNotifPrompt}>
        <DialogHeader title="Enable notifications?" onClose={dismissNotifPrompt} />
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-fg-muted">
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
