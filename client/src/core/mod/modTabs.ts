import { STAGE_ORDER, type Action, type Stage } from "@bingo/shared";

// The mod panel's tabs, for ModPage and the Permissions tab's list of who sees each. `action` is what a viewer must hold
// to see the tab: administer_bingo tabs are hidden from — and their content never rendered for — a Moderator who may
// not administer the Bingo. The server enforces the same split on the underlying routes (requireAdmin on admin.ts vs
// requireBingoMod on mod.ts), so this is UX decluttering on top of a real boundary, not the boundary itself.
//
// `from`/`until` bound the stages a tab is relevant in. Outside that window (stage already past `until`, or not yet at
// `from`) the tab is either hidden or dimmed and moved to the end, per the mod's "outOfStageTabs" preference. Tabs
// without bounds are always shown.
export const MOD_TABS: { key: string; label: string; action: Extract<Action, "moderate_bingo" | "administer_bingo">; from?: Stage; until?: Stage }[] = [
  { key: "submissions", label: "Submissions", action: "moderate_bingo", from: "live" },
  // The roster (who's playing, on which account, their buy-ins) matters all the way through.
  { key: "signups", label: "Signups", action: "moderate_bingo" },
  { key: "audit", label: "Audit log", action: "moderate_bingo" },
  // The Feedback form's results (CONTEXT.md "Feedback form"): the Bingo has to be Finished for there to be any.
  { key: "feedback", label: "Feedback", action: "moderate_bingo", from: "complete" },
  { key: "settings", label: "Settings", action: "administer_bingo" },
  { key: "achievements", label: "Achievements", action: "administer_bingo" },
  { key: "board", label: "Board", action: "administer_bingo", until: "reveal" },
  { key: "lines", label: "Lines", action: "administer_bingo", until: "reveal" },
  { key: "questions", label: "Signup questions", action: "administer_bingo", until: "signup" },
  // Feedback questions can be edited in any stage.
  { key: "feedback-questions", label: "Feedback questions", action: "administer_bingo" },
  { key: "superlatives", label: "Superlatives", action: "administer_bingo" },
  { key: "teams", label: "Captains", action: "administer_bingo", from: "signup" },
  { key: "permissions", label: "Permissions", action: "administer_bingo" },
  { key: "wrapped-art", label: "Wrapped", action: "administer_bingo" },
];
export type ModTab = (typeof MOD_TABS)[number];

export function isOutOfStage(tab: ModTab, stage: Stage): boolean {
  const idx = STAGE_ORDER.indexOf(stage);
  return (tab.until !== undefined && idx > STAGE_ORDER.indexOf(tab.until)) || (tab.from !== undefined && idx < STAGE_ORDER.indexOf(tab.from));
}
