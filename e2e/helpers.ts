import type { Page } from "@playwright/test";

// Must match e2e/prepare-db.cjs's literals exactly — that script (plain
// CommonJS, no build step, run as part of the webServer command) is what
// actually inserts these users; this is just the read-side reference.
export const E2E_USERS = {
  admin: "e2e-admin",
  players: ["e2e-p1", "e2e-p2", "e2e-p3", "e2e-p4", "e2e-p5"],
} as const;

// Logs the browser into the real session machinery as any existing user
// row, via the dev-only /auth/dev-login route (server/src/routes/auth.ts —
// only registered when DEV_LOGIN_ENABLED=true, which playwright.config.ts
// sets for the E2E webServer). page.request shares the page's cookie jar,
// so this sets the session cookie the page itself will use.
export async function loginAs(page: Page, discordId: string): Promise<void> {
  const res = await page.request.post("/auth/dev-login", { data: { discordId } });
  if (!res.ok()) {
    throw new Error(`dev-login failed for ${discordId}: ${res.status()} ${await res.text()}`);
  }
}

// ModPage.tsx shows a full-screen "Enable notifications?" prompt the first
// time a mod visits (Notification.permission === "default" in a fresh
// Chromium profile — true for every Playwright run) and it's a fixed
// inset-0 overlay that blocks interaction with the tab bar underneath.
// Call once after first landing on a mod page.
export async function dismissNotifPromptIfPresent(page: Page): Promise<void> {
  const noThanks = page.getByRole("button", { name: "No thanks" });
  if (await noThanks.isVisible().catch(() => false)) {
    await noThanks.click();
  }
}

// The app's dropdowns (client/src/core/ui/Select) are a button that opens a listbox, not a native <select>, so
// Playwright's selectOption doesn't apply: open it by its label, then press the option.
export async function pickOption(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
