import { test, expect, type Page } from "@playwright/test";
import { loginAs, dismissNotifPromptIfPresent, E2E_USERS } from "./helpers";

const SLUG = "pokemon";

// Scopes to one task's full container (its expand button + expandable body)
// within an open tile modal. Needed because multiple tasks can render the
// same field labels ("Label", "Points", "Description") simultaneously —
// getByLabel alone would be ambiguous once more than one task is expanded.
function taskPanel(page: Page, taskLabel: string) {
  return page
    .locator(".bg-slate-900.border.border-slate-700.rounded-lg.overflow-hidden")
    .filter({ has: page.getByRole("button", { name: new RegExp(`task: ${taskLabel}$`) }) });
}

// One long test walking the entire bingo lifecycle — a single flow keeps
// state continuity trivial (draft order, team ids, etc. all carry forward
// naturally) at the cost of not being independently re-runnable per step.
// See docs/e2e-testing-plan.md for the phase-by-phase build-out; each phase
// adds more test.step() blocks to this same test.
test("full bingo lifecycle", async ({ page, browser }) => {
  await test.step("admin logs in", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto("/");
    await expect(page.getByText("e2e_admin")).toBeVisible();
  });

  await test.step("admin creates the Pokemon Bingo", async () => {
    await page.goto("/admin");
    await page.getByLabel("Name", { exact: true }).fill("Pokemon Bingo");
    // Override the auto-generated slug ("pokemon-bingo") — every later step
    // and URL in this suite assumes the short slug "pokemon".
    await page.getByLabel("Slug (used in the URL)").fill(SLUG);
    await page.getByLabel("Board size (NxN)").fill("3");
    await page.getByRole("button", { name: "Create bingo" }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${SLUG}/mod$`));
    await dismissNotifPromptIfPresent(page);
  });

  await test.step("admin sets buy-in and bonus pot", async () => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Buy-in (GP)").fill("10000000");
    await page.getByLabel("Bonus pot / extra donations (GP)").fill("50000000");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    // 0 paid signups yet, so total pot is just the bonus.
    await expect(page.getByText(/Total pot:\s*50,000,000 GP/)).toBeVisible();
  });

  await test.step("admin builds the board: Vorkath, Wintertodt, GOTR Speedrun", async () => {
    await page.getByRole("button", { name: "Board", exact: true }).click();

    // --- Tile (0,0): Vorkath — two tasks, Part B's points withheld until Part A ---
    await page.getByRole("button", { name: "Create tile at row 0, column 0" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Vorkath");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Label", { exact: true }).fill("Part A");
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("25");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Obtain a Vorki pet or Draconic visage.");
    await taskPanel(page, "Part A").getByRole("button", { name: "+ item", exact: true }).click();
    await taskPanel(page, "Part A").getByLabel("Item names").fill("Vorki");
    await taskPanel(page, "Part A").getByLabel("Item names").press("Tab");
    await expect(taskPanel(page, "Part A").getByLabel("Remove Vorki")).toBeVisible();
    await expect(taskPanel(page, "Part A").getByLabel("Item names")).toHaveValue("");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part B").getByRole("button", { name: /Expand task: Part B/ }).click();
    await taskPanel(page, "Part B").getByLabel("Label", { exact: true }).fill("Part B");
    await taskPanel(page, "Part B").getByLabel("Points", { exact: true }).fill("35");
    await taskPanel(page, "Part B").getByLabel("Description", { exact: true }).fill("Obtain a second unique drop.");
    // Controlled checkbox — its `checked` prop only reflects the new value
    // once the patch round-trips and the board query refetches, so a plain
    // .check() (single click + immediate verify) races that. Click, then
    // let expect's polling absorb the round-trip.
    await taskPanel(page, "Part B").getByLabel("Withhold points until previous").click();
    await expect(taskPanel(page, "Part B").getByLabel("Withhold points until previous")).toBeChecked();
    await taskPanel(page, "Part B").getByRole("button", { name: "+ item", exact: true }).click();
    await taskPanel(page, "Part B").getByLabel("Item names").fill("Draconic visage");
    await taskPanel(page, "Part B").getByLabel("Item names").press("Tab");
    await expect(taskPanel(page, "Part B").getByLabel("Remove Draconic visage")).toBeVisible();
    await expect(taskPanel(page, "Part B").getByLabel("Item names")).toHaveValue("");

    await page.getByRole("button", { name: "Close" }).click();

    // --- Tile (0,1): Wintertodt — one task ---
    await page.getByRole("button", { name: "Create tile at row 0, column 1" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Wintertodt");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("20");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Complete a Wintertodt kill.");
    await taskPanel(page, "Part A").getByRole("button", { name: "+ item", exact: true }).click();
    await taskPanel(page, "Part A").getByLabel("Item names").fill("Bruma torch");
    await taskPanel(page, "Part A").getByLabel("Item names").press("Tab");
    await expect(taskPanel(page, "Part A").getByLabel("Remove Bruma torch")).toBeVisible();
    await expect(taskPanel(page, "Part A").getByLabel("Item names")).toHaveValue("");

    await page.getByRole("button", { name: "Close" }).click();

    // --- Tile (0,2): GOTR Speedrun — one manual-scoring task, no item list ---
    await page.getByRole("button", { name: "Create tile at row 0, column 2" }).click();
    await page.getByLabel("Name", { exact: true }).fill("GOTR Speedrun");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("20");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Complete a Guardians of the Rift run in under 6 minutes.");
    await taskPanel(page, "Part A").getByRole("button", { name: "Manual (mod judges)" }).click();

    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByRole("button", { name: /Edit tile at row 0, column 0: Vorkath/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit tile at row 0, column 1: Wintertodt/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit tile at row 0, column 2: GOTR Speedrun/ })).toBeVisible();
  });

  await test.step("admin generates lines", async () => {
    await page.getByRole("button", { name: "Lines" }).click();
    await page.getByRole("button", { name: "Generate lines from board" }).click();
    // 3 rows + 3 columns + 2 diagonals for a square 3x3 board.
    await expect(page.locator("tbody tr")).toHaveCount(8);
  });

  await test.step("admin adds signup questions", async () => {
    await page.getByRole("button", { name: "Signup Questions" }).click();
    // Each existing question renders in its own same-shaped wrapper div, in
    // order — no id/placeholder on the prompt input itself (defaultValue,
    // not value, so toHaveValue still reads the live DOM value correctly).
    const questionRows = page.locator(".bg-slate-900.border.border-slate-700.rounded-lg.p-3.space-y-2");

    await page.getByPlaceholder("New question…").fill("What is your preferred combat style?");
    await page.getByLabel("New question type").selectOption({ label: "Dropdown" });
    await page.getByPlaceholder("Comma-separated options").fill("Melee, Ranged, Magic");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(questionRows).toHaveCount(1);
    await expect(questionRows.first().locator("input").first()).toHaveValue("What is your preferred combat style?");
    // Mark it required — it's the only question so far, so its "Required"
    // checkbox is unambiguous.
    await questionRows.first().getByLabel("Required").click();
    await expect(questionRows.first().getByLabel("Required")).toBeChecked();

    await page.getByPlaceholder("New question…").fill("Willing to captain?");
    await page.getByLabel("New question type").selectOption({ label: "Yes / No" });
    await page.getByRole("button", { name: "Add" }).click();
    await expect(questionRows).toHaveCount(2);
    await expect(questionRows.nth(1).locator("input").first()).toHaveValue("Willing to captain?");
  });

  await test.step("admin advances planning to signup", async () => {
    await page.getByRole("button", { name: "Advance to signup →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("signup", { exact: true })).toBeVisible();
  });

  const PLAYER_RSNS: Record<string, string> = {
    "e2e-p1": "Trainer1",
    "e2e-p2": "Trainer2",
    "e2e-p3": "Trainer3",
    "e2e-p4": "Trainer4",
    "e2e-p5": "Trainer5",
  };

  await test.step("five players sign up", async () => {
    for (const discordId of E2E_USERS.players) {
      await loginAs(page, discordId);
      await page.goto(`/b/${SLUG}`);
      // Not exact — the label's accessible name includes a trailing " *"
      // (required-field marker rendered as a nested span; see docs/e2e-
      // testing-plan.md Phase E3 notes).
      await page.getByLabel("RuneScape name").fill(PLAYER_RSNS[discordId]!);
      await page.getByLabel("What is your preferred combat style?").selectOption({ label: "Melee" });
      if (discordId === "e2e-p1" || discordId === "e2e-p2") {
        await page.getByLabel("Willing to captain?").check();
      }
      await page.getByRole("button", { name: "Sign up" }).click();
      await expect(page.getByText("Saved!", { exact: true })).toBeVisible();
    }
  });

  await test.step("a player can withdraw (cancelled, to keep all 5 signups)", async () => {
    await loginAs(page, "e2e-p1");
    await page.goto(`/b/${SLUG}`);
    await expect(page.getByRole("heading", { name: "Edit your signup" })).toBeVisible();
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText("Withdraw your signup?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Withdraw your signup?")).not.toBeVisible();
  });

  await test.step("admin marks buy-in received for all 5 players", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    await page.getByRole("button", { name: "Signups" }).click();

    for (const rsn of Object.values(PLAYER_RSNS)) {
      const row = page.locator("tr", { has: page.getByText(rsn, { exact: true }) });
      await row.getByRole("checkbox").click();
      await expect(row.getByRole("checkbox")).toBeChecked();
    }

    // useMarkBuyin only invalidates the signup-roster query, not the bingo
    // query Settings reads paidSignupCount/potTotal from — a reload is
    // needed to see the updated total (a real gap, not a test workaround
    // for a test-only issue; see docs/e2e-testing-plan.md Phase E3 notes).
    await page.reload();
    await dismissNotifPromptIfPresent(page);
    // 5 paid signups x 10,000,000 buy-in + 50,000,000 bonus.
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText(/Total pot:\s*100,000,000 GP/)).toBeVisible();
  });

  await test.step("admin advances signup to captains and assigns two captains", async () => {
    await page.getByRole("button", { name: "Advance to Signups closed →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Signups closed", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Captains" }).click();
    // teamSizeSummary() returns null (nothing renders) until at least one
    // team exists — it's a forward-looking estimate of
    // remainingCandidates / currentTeamCount, not a final roster count, so
    // it changes shape with each captain assigned rather than jumping
    // straight to "2 teams of 2".
    await page.getByLabel("Assign a captain").selectOption({ label: "Trainer1 (e2e_player_1)" });
    await page.getByRole("button", { name: "Make captain" }).click();
    await expect(page.getByText(/There will be 1 team of 5/)).toBeVisible();

    await page.getByLabel("Assign a captain").selectOption({ label: "Trainer2 (e2e_player_2)" });
    await page.getByRole("button", { name: "Make captain" }).click();
    await expect(page.getByText(/There will be 2 teams of 2/)).toBeVisible();
    await expect(page.getByText(/1 team will have an extra player/)).toBeVisible();

    // 2 captains assigned out of 5 signups — Trainer3/4/5 are still
    // eligible candidates, so the picker stays up (only empty once every
    // signup is a captain). TeamCard's rename field is a defaultValue
    // (uncontrolled) input with no id — toHaveValue reads the live DOM
    // value regardless.
    const teamNameInputs = page.locator("input.flex-1.bg-transparent.text-white.font-semibold.text-sm");
    await expect(teamNameInputs).toHaveCount(2);
    // Team array order isn't guaranteed — compare as a set, not positionally.
    await expect(async () => {
      const values = await teamNameInputs.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
      expect(new Set(values)).toEqual(new Set(["e2e_player_1's Team", "e2e_player_2's Team"]));
    }).toPass();
  });

  await test.step("admin advances captains to draft", async () => {
    await page.getByRole("button", { name: "Advance to draft →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("draft", { exact: true })).toBeVisible();
  });

  // The two captains are always Trainer1 (e2e-p1) and Trainer2 (e2e-p2) —
  // fixed from the signup step above — but which of them goes first is
  // randomized by startDraft's team-order shuffle, so the test reads the
  // "on the clock" indicator rather than assuming an order.
  const RSN_TO_DISCORD_ID: Record<string, string> = { Trainer1: "e2e-p1", Trainer2: "e2e-p2" };

  function onClockColumn(page: Page) {
    return page.locator(".flex.flex-col.items-center.text-center.gap-1.min-w-0", { hasText: "On the clock" });
  }

  async function onClockCaptainRsn(page: Page): Promise<string> {
    return (await onClockColumn(page).locator("span.text-white.font-semibold.text-sm.truncate").innerText()).trim();
  }

  function poolRowDraftButton(page: Page, rsn: string) {
    return page.locator("tr", { has: page.getByText(rsn, { exact: true }) }).getByRole("button", { name: "Draft" });
  }

  let captain1Rsn = "";
  let captain2Rsn = "";

  await test.step("admin starts the draft", async () => {
    await page.goto(`/b/${SLUG}/draft`);
    await page.getByRole("button", { name: "Start Draft" }).click();
    await expect(page.getByText("Round 1 — Pick 1")).toBeVisible();

    captain1Rsn = await onClockCaptainRsn(page);
    captain2Rsn = captain1Rsn === "Trainer1" ? "Trainer2" : "Trainer1";
  });

  await test.step("on-the-clock captain drafts a player, then loses pick access", async () => {
    await loginAs(page, RSN_TO_DISCORD_ID[captain1Rsn]!);
    await page.goto(`/b/${SLUG}/draft`);
    await expect(page.getByText("It's your turn to pick!")).toBeVisible();

    await poolRowDraftButton(page, "Trainer3").click();
    // Snake order (2 teams, 3 total picks): round = ceil(pickNumber / 2), so
    // pick 2 is still round 1 — only pick 3 rolls over to round 2.
    await expect(page.getByText("Round 1 — Pick 2")).toBeVisible();

    // Snake order with 2 teams and an odd pool: the other team picks both
    // remaining picks in a row, so captain1 is immediately out of turn —
    // no "Draft" button should render for them anywhere in the pool.
    await expect(page.getByRole("button", { name: "Draft" })).toHaveCount(0);
  });

  await test.step("the other captain drafts a player", async () => {
    await loginAs(page, RSN_TO_DISCORD_ID[captain2Rsn]!);
    await page.goto(`/b/${SLUG}/draft`);
    await expect(page.getByText("It's your turn to pick!")).toBeVisible();
    await expect(onClockColumn(page).getByText(captain2Rsn, { exact: true })).toBeVisible();

    await poolRowDraftButton(page, "Trainer4").click();
    await expect(page.getByText("Round 2 — Pick 3")).toBeVisible();
  });

  await test.step("admin drafts the final player on behalf of the team on the clock", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/draft`);
    // Admin isn't a captain, so no "It's your turn to pick!" banner — but
    // the site-admin pick-on-behalf-of override still shows the button.
    await poolRowDraftButton(page, "Trainer5").click();
    await expect(page.getByText("Draft complete!")).toBeVisible();
  });

  await test.step("admin advances draft to reveal, then to live", async () => {
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    await page.getByRole("button", { name: "Advance to reveal →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("reveal", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Advance to live →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("live", { exact: true })).toBeVisible();
  });

  const SCREENSHOT_PATH = "e2e/fixtures/screenshot.png";
  const PENDING_ROW = ".bg-slate-800.rounded-lg.border.border-slate-700.overflow-hidden";

  function teamPoints(page: Page) {
    return page.locator("span.text-xl.font-bold.text-yellow-400");
  }

  // TileModal's own "Submit" button, disambiguated from the page header's
  // identically-labeled global "Submit" button (both can be on screen at
  // once — TileModal doesn't unmount when SubmissionModal opens on top of
  // it).
  function tileModalSubmitButton(page: Page, tileName: string) {
    return page
      .locator(".bg-slate-800.rounded-xl")
      .filter({ has: page.getByRole("heading", { name: tileName, exact: true }) })
      .getByRole("button", { name: "Submit", exact: true });
  }

  async function pickTileAndTask(page: Page, tileName: string, taskLabel?: string) {
    await page.getByPlaceholder("Search tiles…").click();
    await page.getByRole("button", { name: tileName, exact: true }).click();
    if (taskLabel) await page.getByRole("button", { name: taskLabel, exact: true }).click();
  }

  await test.step("admin sets the bingo start time to the past so submissions are allowed", async () => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Bingo starts").fill("2020-01-01T00:00");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  await test.step("p3 submits Wintertodt via the tile modal (single item auto-selects)", async () => {
    await loginAs(page, "e2e-p3");
    await page.goto(`/b/${SLUG}`);
    // TileCell's accessible name includes its points badge ("Wintertodt
    // 0/20"), not just the tile name — no exact match here.
    await page.getByRole("button", { name: "Wintertodt" }).click();
    await tileModalSubmitButton(page, "Wintertodt").click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();
  });

  await test.step("admin approves the Wintertodt submission", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const row = page.locator(PENDING_ROW).first();
    await row.click();
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Nothing here")).toBeVisible();
    await page.getByRole("button", { name: /^Approved/ }).click();
    await expect(page.getByText("Wintertodt")).toBeVisible();
  });

  await test.step("p3 sees the Wintertodt tile complete and points awarded (task + line bonus)", async () => {
    await loginAs(page, "e2e-p3");
    await page.goto(`/b/${SLUG}`);
    // This 3x3 test board only has row 0 filled (Vorkath/Wintertodt/GOTR),
    // so column 1 is a 1-tile line consisting of just Wintertodt — it
    // completes the instant Wintertodt does. 20 (task) + 15 (column 1) = 35.
    await expect(teamPoints(page)).toHaveText("35 pts");
  });

  await test.step("p3 submits Vorkath Part A", async () => {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Vorkath", "Part A");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();
  });

  await test.step("admin rejects the Vorkath Part A submission with a note", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const row = page.locator(PENDING_ROW).first();
    await row.click();
    await row.getByPlaceholder("Visible to the submitting player…").fill("Screenshot doesn't show the kill count.");
    await row.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("Nothing here")).toBeVisible();
  });

  await test.step("p3 sees the rejection and points are unchanged", async () => {
    await loginAs(page, "e2e-p3");
    await page.goto(`/b/${SLUG}`);
    await page.getByRole("button", { name: "Submissions" }).click();
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByText("Screenshot doesn't show the kill count.")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(teamPoints(page)).toHaveText("35 pts");
  });

  await test.step("p3 submits GOTR Speedrun (manual scoring, no item list)", async () => {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "GOTR Speedrun");
    await expect(page.getByText("This task is judged manually")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();
  });

  await test.step("admin approves GOTR Speedrun — approving a manual leaf is the completion decision", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const row = page.locator(PENDING_ROW).first();
    await row.click();
    // No separate "mark complete" step for a MANUAL leaf — approving its
    // claim IS the decision (rejecting would be "not done").
    await expect(row.getByText("Approving completes this immediately")).toBeVisible();
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Nothing here")).toBeVisible();
  });

  await test.step("p3 sees points for Wintertodt + GOTR plus two more line bonuses", async () => {
    await loginAs(page, "e2e-p3");
    await page.goto(`/b/${SLUG}`);
    // GOTR is the sole tile in both column 2 and diagonal 1 (rows 1/2 are
    // empty on this sparse test board), so its completion fires both lines
    // at once: 20 (task) + 15 (column 2) + 15 (diagonal 1) = 50, on top of
    // the prior 35 → 85.
    await expect(teamPoints(page)).toHaveText("85 pts");
  });

  await test.step("p3 submits Vorkath Part B before Part A is complete (withheld-points path)", async () => {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Vorkath", "Part B");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();
  });

  await test.step("admin approves Vorkath Part B — points stay withheld", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const row = page.locator(PENDING_ROW).first();
    await row.click();
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Nothing here")).toBeVisible();
  });

  await test.step("p3 sees points unchanged while Vorkath Part A is still incomplete", async () => {
    await loginAs(page, "e2e-p3");
    await page.goto(`/b/${SLUG}`);
    // Withheld points don't fire the tile's lines either — Vorkath still
    // isn't fully complete (Part A isn't), so no column-0/diagonal-0 bonus yet.
    await expect(teamPoints(page)).toHaveText("85 pts");
  });

  await test.step("p3 resubmits Vorkath Part A (this tab stays open for the live-update check)", async () => {
    // Part B is now "completed" (0 withheld points) so it drops out of the
    // available-tasks list — Part A is the only one left, no task picker.
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Vorkath");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();
    await expect(teamPoints(page)).toHaveText("85 pts");
  });

  await test.step("admin approves it from a second browser context — points update live on p3's board with no reload", async () => {
    // A second, independent context (not just a second tab in `page`'s
    // context) so it gets its own cookie jar — admin and p3 need separate
    // sessions open at once. `page` (p3's board) is deliberately never
    // touched here: no goto, no reload. If the final assertion below passes,
    // it can only be because the WebSocket's submission_reviewed broadcast
    // invalidated `page`'s ["teamProgress"] query in the background
    // (WebSocketContext.tsx's invalidateForEvent) and it refetched on its own.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    try {
      await loginAs(adminPage, E2E_USERS.admin);
      await adminPage.goto(`/b/${SLUG}/mod`);
      await dismissNotifPromptIfPresent(adminPage);
      const row = adminPage.locator(PENDING_ROW).first();
      await row.click();
      await row.getByRole("button", { name: "Approve" }).click();
      await expect(adminPage.getByText("Nothing here")).toBeVisible();
    } finally {
      await adminContext.close();
    }

    // Vorkath completing (Part A 25 + released Part B 35) also finishes its
    // last two lines (column 0, diagonal 0 — both single-tile, Vorkath-only)
    // AND row 0, now that all three of its tiles are complete. Task points:
    // 20 (Wintertodt) + 20 (GOTR) + 25 (Vorkath A) + 35 (Vorkath B) = 100.
    // Line bonuses: column 1, column 2, diagonal 1, column 0, diagonal 0,
    // row 0 = 6 × 15 = 90 (row 1/row 2 have zero tiles and can never fire).
    // 100 + 90 = 190.
    await expect(teamPoints(page)).toHaveText("190 pts");
  });
});
