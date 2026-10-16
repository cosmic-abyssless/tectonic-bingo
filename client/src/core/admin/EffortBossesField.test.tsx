// @vitest-environment jsdom
// The board editor's Effort bosses field (CONTEXT.md "Effort"), against a faked admin API: a Part's derived, added and
// removed bosses as chips, what ✕ and "restore" send, and a Tile's field listing what each Part ends up with.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoardEffortBossesResponse, EffortBoss } from "@bingo/shared";
import { EffortBossesField } from "./EffortBossesField";

const api = vi.hoisted(() => ({
  getBoardEffortBosses: vi.fn(),
  changeEffortBoss: vi.fn(),
  resetEffortBoss: vi.fn(),
}));
vi.mock("../../api/adminApi", () => api);

afterEach(cleanup);

// jsdom has no CSS.escape, which react-aria uses to find a row by its key.
globalThis.CSS ??= { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) } as typeof CSS;

const row = (id: string, metric: string, mode: EffortBoss["mode"], on: { tileId?: string; partId?: string }): EffortBoss => ({
  id,
  tileId: on.tileId ?? null,
  partId: on.partId ?? null,
  metric,
  mode,
});

// The Vorkath Tile: Part "Head" derives Vorkath; Part "Page 2" derives Vorkath and the King Black Dragon.
const DERIVED = [
  { partId: "head", metrics: ["vorkath"] },
  { partId: "page", metrics: ["king_black_dragon", "vorkath"] },
];

function renderField(bosses: EffortBoss[], props: { owner: { tileId: string } | { partId: string }; parts?: { id: string; label: string }[] }) {
  api.getBoardEffortBosses.mockResolvedValue({ bosses, derived: DERIVED } satisfies BoardEffortBossesResponse);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EffortBossesField slug="b1" tileId="tile" locked={false} {...props} />
    </QueryClientProvider>,
  );
}

const chips = async () =>
  within(await screen.findByRole("list", { name: "Effort bosses" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe("EffortBossesField on a Part", () => {
  it("shows derived bosses from items, added ones, and removed ones struck through with restore", async () => {
    renderField([row("r1", "king_black_dragon", "remove", { partId: "page" }), row("a1", "zulrah", "add", { partId: "page" })], { owner: { partId: "page" } });
    expect(await chips()).toEqual(["King Black Dragonremovedrestore", "Vorkathfrom items", "Zulrahadded"]);
    expect(screen.getByText("King Black Dragon").className).toContain("line-through");
  });

  it("✕ on a derived boss writes a remove, ✕ on an added one drops the add, restore drops the remove", async () => {
    const user = userEvent.setup();
    const board = [row("r1", "king_black_dragon", "remove", { partId: "page" }), row("a1", "zulrah", "add", { partId: "page" })];
    renderField(board, { owner: { partId: "page" } });
    const answer = { bosses: board, derived: DERIVED };
    api.changeEffortBoss.mockResolvedValue(answer);
    api.resetEffortBoss.mockResolvedValue(answer);

    await user.click(await screen.findByRole("button", { name: "Remove Vorkath" }));
    expect(api.changeEffortBoss).toHaveBeenCalledWith("b1", { partId: "page" }, { metric: "vorkath", mode: "remove" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Zulrah" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Remove Zulrah" }));
    expect(api.resetEffortBoss).toHaveBeenLastCalledWith("b1", "a1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore King Black Dragon" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Restore King Black Dragon" }));
    expect(api.resetEffortBoss).toHaveBeenLastCalledWith("b1", "r1");
  });

  it("shows a boss its Tile removes as removed there, with nothing to press, and the Tile's added ones", async () => {
    renderField([row("t1", "vorkath", "remove", { tileId: "tile" }), row("t2", "nex", "add", { tileId: "tile" })], { owner: { partId: "head" } });
    expect(await chips()).toEqual(["Nexfrom the Tile", "Vorkathremoved on the Tile"]);
    expect(screen.queryByRole("button", { name: /Restore Vorkath/ })).toBeNull();
  });

  it("adds a boss picked from Wise Old Man's", async () => {
    const user = userEvent.setup();
    renderField([], { owner: { partId: "head" } });
    api.changeEffortBoss.mockResolvedValue({ bosses: [row("a1", "zulrah", "add", { partId: "head" })], derived: DERIVED });
    await user.click(await screen.findByRole("button", { name: "Boss" }));
    await user.type(screen.getByRole("combobox", { name: "Effort boss" }), "zulr");
    await user.click(await screen.findByRole("option", { name: "Zulrah" }));
    expect(api.changeEffortBoss).toHaveBeenCalledWith("b1", { partId: "head" }, { metric: "zulrah", mode: "add" });
    await waitFor(async () => expect(await chips()).toEqual(["Vorkathfrom items", "Zulrahadded"]));
  });
});

describe("EffortBossesField on a Tile", () => {
  it("edits the Tile's own rows and lists each Part's bosses", async () => {
    const user = userEvent.setup();
    renderField([row("t1", "nex", "add", { tileId: "tile" }), row("t2", "king_black_dragon", "remove", { tileId: "tile" })], {
      owner: { tileId: "tile" },
      parts: [
        { id: "head", label: "Head" },
        { id: "page", label: "Page 2" },
      ],
    });
    expect(await chips()).toEqual(["King Black Dragonremoved from every Partrestore", "Nexon every Part", "Vorkathfrom items"]);
    const each = screen.getByRole("list", { name: "Each Part's Effort bosses" });
    expect(
      within(each)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Head: Nex, Vorkath", "Page 2: Nex, Vorkath"]);

    api.changeEffortBoss.mockResolvedValue({ bosses: [], derived: DERIVED });
    await user.click(screen.getByRole("button", { name: "Remove Vorkath from every Part" }));
    expect(api.changeEffortBoss).toHaveBeenCalledWith("b1", { tileId: "tile" }, { metric: "vorkath", mode: "remove" });
  });
});
