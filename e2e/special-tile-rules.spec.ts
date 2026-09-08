import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loginAs, dismissNotifPromptIfPresent, E2E_USERS } from "./helpers";

// Separate bingo/slug from full-flow.spec.ts's "pokemon" — this test exists
// purely to exercise the per-task "weird rule" fields (TileTask's flag
// columns, options groups, wildcards, freeze) that the main lifecycle test
// never touches. No signup questions, no buy-in, no lines (irrelevant here
// and their point-math would just add noise — see docs/e2e-testing-plan.md
// Phase E5 for how easily that math gets away from you). One captain acting
// as the sole team member submits everything.
const SLUG = "special-rules";
const SCREENSHOT_PATH = "e2e/fixtures/screenshot.png";
const PENDING_ROW = ".bg-slate-800.rounded-lg.border.border-slate-700.overflow-hidden";
const CAPTAIN = "e2e-p4";

function taskPanel(page: Page, taskLabel: string) {
  return page
    .locator(".bg-slate-900.border.border-slate-700.rounded-lg.overflow-hidden")
    .filter({ has: page.getByRole("button", { name: new RegExp(`task: ${taskLabel}$`) }) });
}

function teamPoints(page: Page) {
  return page.locator("span.text-xl.font-bold.text-yellow-400");
}

function pendingRow(page: Page) {
  return page.locator(PENDING_ROW).first();
}

async function pickTileAndTask(page: Page, tileName: string, taskLabel?: string) {
  await page.getByPlaceholder("Search tiles…").click();
  await page.getByRole("button", { name: tileName, exact: true }).click();
  if (taskLabel) await page.getByRole("button", { name: taskLabel, exact: true }).click();
}

// Explicit item pick — for tasks whose item list has more than one option
// left (SearchableSelect stays interactive, not readOnly-auto-selected).
async function pickItem(page: Page, itemName: string) {
  await page.getByPlaceholder("Search items…").click();
  await page.getByRole("button", { name: itemName, exact: true }).click();
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface BoardTile {
  name: string;
  tasks: { id: string; label: string }[];
}

async function getTaskId(request: APIRequestContext, tileName: string, taskLabel: string): Promise<string> {
  const res = await request.get(`/api/bingos/${SLUG}/board`);
  const body = (await res.json()) as { tiles: BoardTile[] };
  const tile = body.tiles.find((t) => t.name === tileName);
  const task = tile?.tasks.find((t) => t.label === taskLabel);
  if (!task) throw new Error(`Task "${taskLabel}" on tile "${tileName}" not found in board response`);
  return task.id;
}

// A raw multipart POST bypassing the UI entirely — proves the server itself
// rejects the submission (submissionService.ts's own comment: "the client
// mirrors these checks for UX, but this is the enforcement"), not just that
// the client hid the option. The client-side UI checks are asserted
// separately in each scenario below.
async function rawSubmit(request: APIRequestContext, taskId: string) {
  return request.post(`/api/bingos/${SLUG}/submissions`, {
    // A bare string multipart value is sent as a text field, not a file —
    // multer's req.file stays undefined and the route rejects with
    // "Screenshot is required" before ever reaching the real check this is
    // trying to exercise. Needs an explicit {name, mimeType, buffer}.
    multipart: {
      screenshot: { name: "screenshot.png", mimeType: "image/png", buffer: readFileSync(SCREENSHOT_PATH) },
      taskId,
      itemClaims: "[]",
    },
  });
}

// TODO: rewrite against the requirement-tree model (ITEM/ALL/ANY/COUNT leaves, claims bound to nodes).
test.skip("special tile-rule mechanics", async ({ page }) => {
  await test.step("admin logs in and creates the special-rules bingo", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto("/admin");
    await page.getByLabel("Name").fill("Special Rules Bingo");
    await page.getByLabel("Slug (used in the URL)").fill(SLUG);
    await page.getByLabel("Board size (NxN)").fill("3");
    await page.getByRole("button", { name: "Create bingo" }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${SLUG}/mod$`));
    await dismissNotifPromptIfPresent(page);
  });

  await test.step("admin builds Barrows (requires a complete set from one options group, plus the no-duplicates badge)", async () => {
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await page.getByRole("button", { name: "Create tile at row 0, column 0" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Barrows");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("30");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Obtain a complete set from one brother.");
    // These flag checkboxes are DB-backed (patch + query invalidate on blur/
    // change) — checked only reflects the new value once that round-trips,
    // so .click() + a separate toBeChecked() (which polls) instead of a
    // plain .check() (click + immediate verify, which races it).
    await taskPanel(page, "Part A").getByLabel("Requires a complete set").click();
    await expect(taskPanel(page, "Part A").getByLabel("Requires a complete set")).toBeChecked();
    await taskPanel(page, "Part A").getByLabel("No duplicate items").click();
    await expect(taskPanel(page, "Part A").getByLabel("No duplicate items")).toBeChecked();

    // Added items render as an inline-editable name input (TaskEditor.tsx),
    // not plain text — assert via its aria-label, not getByText (Playwright
    // has no getByDisplayValue; that's a Testing Library API, not Playwright's).
    for (const item of ["Ahrim's hood", "Ahrim's robetop", "Ahrim's robeskirt", "Ahrim's staff"]) {
      await taskPanel(page, "Part A").getByPlaceholder("Item name").fill(item);
      await taskPanel(page, "Part A").getByPlaceholder("Options group (optional)").fill("ahrim");
      await taskPanel(page, "Part A").getByRole("button", { name: "Add" }).click();
      await expect(taskPanel(page, "Part A").getByRole("textbox", { name: `Item name for ${item}` })).toBeVisible();
    }
    for (const item of ["Dharok's helm", "Dharok's platebody", "Dharok's platelegs", "Dharok's greataxe"]) {
      await taskPanel(page, "Part A").getByPlaceholder("Item name").fill(item);
      await taskPanel(page, "Part A").getByPlaceholder("Options group (optional)").fill("dharok");
      await taskPanel(page, "Part A").getByRole("button", { name: "Add" }).click();
      await expect(taskPanel(page, "Part A").getByRole("textbox", { name: `Item name for ${item}` })).toBeVisible();
    }

    await page.getByRole("button", { name: "Close" }).click();
  });

  await test.step("admin builds K'ril Tsutsaroth (minSubmissions gates completion even once the item tally is satisfied)", async () => {
    await page.getByRole("button", { name: "Create tile at row 0, column 1" }).click();
    await page.getByLabel("Name", { exact: true }).fill("K'ril Tsutsaroth");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("25");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Obtain two different unique drops.");
    await taskPanel(page, "Part A").getByLabel("Min. approved submissions to complete").fill("2");

    for (const item of ["Steam battlestaff", "Zamorakian spear", "Zamorak hilt"]) {
      await taskPanel(page, "Part A").getByPlaceholder("Item name").fill(item);
      await taskPanel(page, "Part A").getByPlaceholder("Options group (optional)").fill("drop");
      await taskPanel(page, "Part A").getByRole("button", { name: "Add" }).click();
      await expect(taskPanel(page, "Part A").getByRole("textbox", { name: `Item name for ${item}` })).toBeVisible();
    }

    await page.getByRole("button", { name: "Close" }).click();
  });

  await test.step("admin builds Cerberus (allowsPreviouslyAcquired folding + a wildcard capped at 1 redemption)", async () => {
    await page.getByRole("button", { name: "Create tile at row 0, column 2" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Cerberus");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("25");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Obtain your first Cerberus drop.");
    await taskPanel(page, "Part A").getByLabel("Allows pre-load screenshot").click();
    await expect(taskPanel(page, "Part A").getByLabel("Allows pre-load screenshot")).toBeChecked();
    await taskPanel(page, "Part A").getByPlaceholder("Item name").fill("Any Cerberus drop");
    await taskPanel(page, "Part A").getByRole("button", { name: "Add" }).click();
    await expect(taskPanel(page, "Part A").getByRole("textbox", { name: "Item name for Any Cerberus drop" })).toBeVisible();

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part B").getByRole("button", { name: /Expand task: Part B/ }).click();
    await taskPanel(page, "Part B").getByLabel("Points", { exact: true }).fill("40");
    await taskPanel(page, "Part B").getByLabel("Description", { exact: true }).fill("Obtain two more Cerberus drops (drops from Part A count).");
    await taskPanel(page, "Part B").getByLabel("Folds previous task's claims").click();
    await expect(taskPanel(page, "Part B").getByLabel("Folds previous task's claims")).toBeChecked();
    await taskPanel(page, "Part B").getByLabel("Min. approved submissions to complete").fill("2");
    await taskPanel(page, "Part B").getByPlaceholder("Item name").fill("Any Cerberus drop");
    await taskPanel(page, "Part B").getByRole("button", { name: "Add" }).click();
    await expect(taskPanel(page, "Part B").getByRole("textbox", { name: "Item name for Any Cerberus drop" })).toBeVisible();

    // A single wildcard, applicable to any task on the tile, at the schema
    // default of 1 redemption per team — the admin UI has no field to set
    // maxRedemptionsPerTeam or item quantity at creation time, so this test
    // is built around those defaults rather than around chosen values.
    await page.getByRole("button", { name: "+ Add wildcard" }).click();
    const wildcardRow = page.locator("li").filter({ has: page.getByLabel("Wildcard applicable task") });
    await wildcardRow.locator("input").first().fill("Cerberus jar");
    await wildcardRow.locator("input").first().blur();

    await page.getByRole("button", { name: "Close" }).click();
  });

  await test.step("admin builds Colosseum (frozen — negative path only, no waiting out a real 2-hour timer)", async () => {
    await page.getByRole("button", { name: "Create tile at row 1, column 0" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Colosseum");
    await page.getByLabel("Name", { exact: true }).press("Tab");
    await page.getByLabel("Freeze period").click();
    await expect(page.getByLabel("Freeze period")).toBeChecked();
    await page.getByLabel("Freeze duration (minutes)").fill("120");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("20");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Clear waves 1 through 3.");
    await taskPanel(page, "Part A").getByPlaceholder("Item name").fill("Waves 1-3 proof");
    await taskPanel(page, "Part A").getByRole("button", { name: "Add" }).click();
    await expect(taskPanel(page, "Part A").getByRole("textbox", { name: "Item name for Waves 1-3 proof" })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
  });

  await test.step("admin builds Duke Sucellus (submitRequiresPrevious — Part B can't even be submitted before Part A)", async () => {
    await page.getByRole("button", { name: "Create tile at row 1, column 1" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Duke Sucellus");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("20");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Kill Duke Sucellus.");
    await taskPanel(page, "Part A").getByPlaceholder("Item name").fill("Duke Sucellus kill proof");
    await taskPanel(page, "Part A").getByRole("button", { name: "Add" }).click();
    await expect(taskPanel(page, "Part A").getByRole("textbox", { name: "Item name for Duke Sucellus kill proof" })).toBeVisible();

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part B").getByRole("button", { name: /Expand task: Part B/ }).click();
    await taskPanel(page, "Part B").getByLabel("Points", { exact: true }).fill("30");
    await taskPanel(page, "Part B").getByLabel("Description", { exact: true }).fill("Obtain a Vestige.");
    await taskPanel(page, "Part B").getByLabel("Requires previous task").click();
    await expect(taskPanel(page, "Part B").getByLabel("Requires previous task")).toBeChecked();
    await taskPanel(page, "Part B").getByPlaceholder("Item name").fill("Vestige");
    await taskPanel(page, "Part B").getByRole("button", { name: "Add" }).click();
    await expect(taskPanel(page, "Part B").getByRole("textbox", { name: "Item name for Vestige" })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
  });

  await test.step("admin advances to signup, one captain signs up, advances to captains and creates the team", async () => {
    await page.getByRole("button", { name: "Advance to signup →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("signup", { exact: true })).toBeVisible();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    // RSN input has maxLength=12 (matches OSRS's real limit).
    await page.getByLabel("RuneScape name").fill("RuleTester");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Saved!", { exact: true })).toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    await page.getByRole("button", { name: "Advance to captains →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("captains", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Teams" }).click();
    await page.getByLabel("Assign a captain").selectOption({ label: "RuleTester (e2e_player_4)" });
    await page.getByRole("button", { name: "Make captain" }).click();
    await expect(page.getByText(/There will be 1 team of 1/)).toBeVisible();
  });

  await test.step("admin skips the draft entirely (advanceStage has no draft-completeness gate) straight to live, and sets a starts-at that leaves Colosseum still frozen", async () => {
    await page.getByRole("button", { name: "Advance to draft →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("draft", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Advance to reveal →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("reveal", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Advance to live →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("live", { exact: true })).toBeVisible();

    // 10 minutes ago: bingo has "started" (submissions unblocked generally),
    // but well inside Colosseum's 120-minute freeze window.
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Bingo starts").fill(toDatetimeLocal(new Date(Date.now() - 10 * 60_000)));
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  await test.step("Barrows: partial set (3/4) doesn't complete, the 4th piece does — plus the no-duplicates badge renders", async () => {
    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);

    for (const item of ["Ahrim's hood", "Ahrim's robetop", "Ahrim's robeskirt", "Ahrim's staff"]) {
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page.getByText("Submit Completion")).toBeVisible();
      await pickTileAndTask(page, "Barrows");
      await pickItem(page, item);
      await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
      await page.getByRole("button", { name: "Submit for Review" }).click();
      await expect(page.getByText("Submit Completion")).not.toBeVisible();
    }

    await page.getByRole("button", { name: "Barrows" }).click();
    await expect(page.getByText("No duplicates", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    for (let i = 0; i < 3; i++) {
      const row = pendingRow(page);
      await row.click();
      await row.getByRole("button", { name: "Approve" }).click();
    }

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    // A 3/4 set is not "complete" — requiresCompleteSet needs every item in
    // one whole group, not most of one.
    await expect(teamPoints(page)).toHaveText("0 pts");

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const lastRow = pendingRow(page);
    await lastRow.click();
    await lastRow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("30 pts");
  });

  await test.step("K'ril Tsutsaroth: minSubmissions still gates completion even once the item tally alone would satisfy the group", async () => {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "K'ril Tsutsaroth");
    await pickItem(page, "Steam battlestaff");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const row = pendingRow(page);
    await row.click();
    await row.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    // One approved submission out of the required 2 — the group's item
    // requirement is technically satisfied already, but minSubmissions
    // still blocks completion on its own.
    await expect(teamPoints(page)).toHaveText("30 pts");

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "K'ril Tsutsaroth");
    await pickItem(page, "Zamorakian spear");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const row2 = pendingRow(page);
    await row2.click();
    await row2.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("55 pts");
  });

  await test.step("Cerberus: wildcard redemption succeeds once, a second redemption is rejected server-side, then a real claim completes Part B via allowsPreviouslyAcquired folding", async () => {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Cerberus", "Part A");
    await page.getByLabel("Submit with a wildcard").check();
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const partARow = pendingRow(page);
    await partARow.click();
    await partARow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("80 pts");
    await page.getByRole("button", { name: "Cerberus" }).click();
    await expect(page.getByText("Pre-load allowed", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    // Second wildcard redemption attempt, on the tile's other task — this
    // submission is allowed (Part B isn't complete yet), but its approval
    // must be rejected: the wildcard is already at its 1-per-team cap.
    // Part A is complete now, so it's excluded from availableTasks — Part B
    // is the only one left, no task picker to click.
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Cerberus");
    await page.getByLabel("Submit with a wildcard").check();
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const wildcardRow2 = pendingRow(page);
    await wildcardRow2.click();
    await wildcardRow2.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/already been redeemed/)).toBeVisible();
    // Rejected approval — the submission is still sitting there, pending.
    await expect(wildcardRow2).toBeVisible();
    await wildcardRow2.getByRole("button", { name: "Reject" }).click();

    // A real (non-wildcard) claim on Part B — combined with Part A's already-
    // approved submission folding in via allowsPreviouslyAcquired, this is
    // the 2nd approved submission minSubmissions needs, and the item tally
    // is satisfied too.
    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Cerberus");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const partBRow = pendingRow(page);
    await partBRow.click();
    await partBRow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("120 pts");
  });

  await test.step("Colosseum: a frozen tile is unreachable through either submit entry point, and the server rejects a direct API call too", async () => {
    await expect(page.getByRole("button", { name: /Colosseum/ })).toContainText("🔒");

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await page.getByPlaceholder("Search tiles…").click();
    await expect(page.getByRole("button", { name: "Colosseum", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();

    // page.request, not a bare `request` fixture — it shares page's cookie
    // jar (already logged in as the captain), so this call is authenticated.
    const colosseumTaskId = await getTaskId(page.request, "Colosseum", "Part A");
    const res = await rawSubmit(page.request, colosseumTaskId);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/frozen/);
  });

  await test.step("Duke Sucellus: Part B is unreachable and server-rejected before Part A, then unlocks normally once Part A is approved", async () => {
    const partBTaskId = await getTaskId(page.request, "Duke Sucellus", "Part B");
    const res = await rawSubmit(page.request, partBTaskId);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/previous task/);

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await page.getByPlaceholder("Search tiles…").click();
    await page.getByRole("button", { name: "Duke Sucellus", exact: true }).click();
    // Only Part A is offered — Part B is excluded client-side too.
    await expect(page.getByText("Submitting for Part A")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const partARow = pendingRow(page);
    await partARow.click();
    await partARow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("140 pts");

    // Part B is submittable now that Part A is done — and Part A is
    // complete now too, so it drops out of availableTasks, leaving Part B
    // as the sole option with no task picker to click (same shape as
    // Cerberus above).
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Duke Sucellus");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const partBRow = pendingRow(page);
    await partBRow.click();
    await partBRow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    // Barrows 30 + K'ril 25 + Cerberus 65 (25 + 40) + Duke Sucellus 50 (20 + 30) = 170.
    await expect(teamPoints(page)).toHaveText("170 pts");
  });
});
