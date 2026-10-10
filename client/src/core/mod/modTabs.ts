import { STAGE_ORDER, type Action, type Stage } from "@bingo/shared";

type ModAction = Extract<Action, "moderate_bingo" | "administer_bingo">;

// What a viewer must hold to see a tab or sub-tab, and the stages it's relevant in. administer_bingo ones are hidden
// from — and their content never rendered for — a Moderator who may not administer the Bingo. The server enforces the
// same split on the underlying routes (requireAdmin on admin.ts vs requireBingoMod on mod.ts), so this is UX
// decluttering on top of a real boundary, not the boundary itself.
//
// `from`/`until` bound the stages it is relevant in. Outside that window (stage already past `until`, or not yet at
// `from`) a tab is either hidden or dimmed and moved to the end, per the mod's "outOfStageTabs" preference, and a sub-tab
// is dimmed. Without bounds it's always in stage.
export type ModTabAccess = { action: ModAction; from?: Stage; until?: Stage };
export type ModSection = ModTabAccess & { key: string; label: string };

// The mod panel's tabs, for ModPage and the Settings tab's list of who sees each. A tab with `sections` is split into
// sub-tabs: it's shown to whoever sees any of them, and is out of stage only when every one they see is.
export const MOD_TABS: ({ key: string; label: string } & ((ModTabAccess & { sections?: undefined }) | { sections: ModSection[] }))[] = [
  { key: "submissions", label: "Submissions", action: "moderate_bingo", from: "live" },
  {
    key: "signups",
    label: "Signups",
    sections: [
      // The roster (who's playing, on which account, their buy-ins) matters all the way through.
      { key: "roster", label: "Roster", action: "moderate_bingo" },
      { key: "questions", label: "Questions", action: "administer_bingo", until: "signup" },
    ],
  },
  { key: "audit", label: "Audit log", action: "moderate_bingo" },
  {
    key: "feedback",
    label: "Feedback",
    sections: [
      // The Feedback form's results (CONTEXT.md "Feedback form"): the Bingo has to be Finished for there to be any.
      { key: "responses", label: "Responses", action: "moderate_bingo", from: "complete" },
      // Feedback questions can be edited in any stage.
      { key: "questions", label: "Questions", action: "administer_bingo" },
      { key: "superlatives", label: "Superlatives", action: "administer_bingo" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    sections: [
      { key: "general", label: "General", action: "administer_bingo" },
      { key: "people", label: "Moderators and Staff", action: "administer_bingo" },
      { key: "tabs", label: "Mod panel tabs", action: "administer_bingo" },
      { key: "roles", label: "What each role can do", action: "administer_bingo" },
    ],
  },
  {
    key: "board",
    label: "Board",
    sections: [
      { key: "tiles", label: "Tiles", action: "administer_bingo", until: "reveal" },
      { key: "lines", label: "Lines", action: "administer_bingo", until: "reveal" },
    ],
  },
  { key: "teams", label: "Captains", action: "administer_bingo", from: "signup" },
  // The just-for-fun extras, none of which affect play.
  {
    key: "extras",
    label: "Extras",
    sections: [
      { key: "achievements", label: "Achievements", action: "administer_bingo" },
      { key: "wrapped-art", label: "Wrapped art", action: "administer_bingo" },
    ],
  },
];
export type ModTab = (typeof MOD_TABS)[number];

export function isOutOfStage(access: ModTabAccess, stage: Stage): boolean {
  const idx = STAGE_ORDER.indexOf(stage);
  return (access.until !== undefined && idx > STAGE_ORDER.indexOf(access.until)) || (access.from !== undefined && idx < STAGE_ORDER.indexOf(access.from));
}

const mayView = (access: ModTabAccess, canAdminister: boolean) => access.action === "moderate_bingo" || canAdminister;

/** The sub-tabs of `tab` this viewer sees (a tab without any is its own one). */
export function visibleSections(tab: ModTab, canAdminister: boolean): ModSection[] {
  return (tab.sections ? tab.sections : [tab]).filter((s) => mayView(s, canAdminister));
}

export function mayViewTab(tab: ModTab, canAdminister: boolean): boolean {
  return visibleSections(tab, canAdminister).length > 0;
}

/** Out of stage for this viewer: every sub-tab they see is. */
export function isTabOutOfStage(tab: ModTab, stage: Stage, canAdminister: boolean): boolean {
  return visibleSections(tab, canAdminister).every((s) => isOutOfStage(s, stage));
}
