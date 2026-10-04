// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Stage } from "@bingo/shared";

// The bingo's stage and the Player's clan RSNs, as the queries would serve them.
let stage: Stage = "reveal";
let clanRsns: string[] = [];
const setSignupAccount = vi.fn(async () => ({ signup: {} }));
vi.mock("../../api/queries", () => ({
  queryKeys: { signupRoster: (s: string) => ["signupRoster", s], bingo: (s: string) => ["bingo", s], playerProfile: (s: string, u: string) => ["playerProfile", s, u] },
  useBingo: () => ({ data: { bingo: { stage } } }),
}));
vi.mock("../../api/adminQueries", () => ({
  useLateSignupRsns: (_slug: string, userId: string) => ({ data: userId ? { rsns: clanRsns } : undefined, isFetching: false }),
}));
vi.mock("../../api/adminApi", () => ({ setSignupAccount: (...args: unknown[]) => setSignupAccount(...(args as [])) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }) }));

import { BorrowedAccountForm, liveWarning, type AccountTarget } from "./BorrowedAccountDialog";
import { BorrowedBadge } from "../signup/BorrowedAccount";

afterEach(cleanup);
beforeEach(() => {
  stage = "reveal";
  clanRsns = [];
  setSignupAccount.mockClear();
});

const own: AccountTarget = { signupId: "s1", userId: "u1", rsn: "Alice Main", accountBorrowed: false, ownName: "alice_dc" };
const borrowed: AccountTarget = { ...own, rsn: "Bob", accountBorrowed: true };

function renderForm(target: AccountTarget) {
  const onDone = vi.fn();
  render(<BorrowedAccountForm slug="b1" target={target} onDone={onDone} onCancel={vi.fn()} />);
  return { onDone };
}

describe("liveWarning", () => {
  it("warns only while Live, naming the account Wise Old Man stops counting", () => {
    expect(liveWarning("reveal", "Alice Main", "Bob")).toBeNull();
    expect(liveWarning("live", "Alice Main", "Bob")).toBe("This bingo is Live: Wise Old Man will count Bob for the whole competition, from its start, and stop counting Alice Main.");
    expect(liveWarning("live", "Alice Main", " ")).toContain("will count the new account");
  });
});

describe("BorrowedAccountForm", () => {
  it("sets a borrowed account once there's an RSN and a reason", async () => {
    const user = userEvent.setup();
    const { onDone } = renderForm(own);
    expect(screen.queryByText("Back to their own account")).toBeNull();
    const submit = screen.getByRole("button", { name: "Set borrowed account" });
    await user.type(screen.getByLabelText(/^RSN of the account they're playing on/), "Bob");
    // No reason yet.
    expect(submit.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByLabelText(/^Reason/), "Her account is banned");
    await user.click(submit);
    expect(setSignupAccount).toHaveBeenCalledWith("b1", "s1", { rsn: "Bob", reason: "Her account is banned" });
    expect(onDone).toHaveBeenCalled();
  });

  it("warns, while Live, that Wise Old Man counts the new account for the whole competition", async () => {
    stage = "live";
    const user = userEvent.setup();
    renderForm(own);
    await user.type(screen.getByLabelText(/^RSN of the account they're playing on/), "Bob");
    expect(screen.getByText(/Wise Old Man will count Bob for the whole competition/)).toBeTruthy();
  });

  it("on a borrowed account, sets them back to their first clan RSN as their own account", async () => {
    clanRsns = ["Alice Main", "Alice Alt"];
    const user = userEvent.setup();
    renderForm(borrowed);
    await user.click(screen.getByLabelText("Back to their own account"));
    await user.type(screen.getByLabelText(/^Reason/), "Her account is back");
    await user.click(screen.getByRole("button", { name: "Set back" }));
    expect(setSignupAccount).toHaveBeenCalledWith("b1", "s1", { rsn: "Alice Main", reason: "Her account is back", ownAccount: true });
  });
});

describe("BorrowedBadge", () => {
  it("shows the Player's own name", () => {
    render(<BorrowedBadge ownName="alice_dc" />);
    expect(screen.getByText("borrowed · alice_dc")).toBeTruthy();
  });
});
