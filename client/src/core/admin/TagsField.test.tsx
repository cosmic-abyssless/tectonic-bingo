// @vitest-environment jsdom
// The board editor's Tags field (CONTEXT.md "Tag"), against a faked admin API: chips, a Boss tag's names folded under
// it, Enter adding a Text tag, and each chip's remove.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoardTagsResponse, Tag } from "@bingo/shared";
import { TagsField } from "./TagsField";

const api = vi.hoisted(() => ({
  getBoardTags: vi.fn(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  searchBosses: vi.fn(),
}));
vi.mock("../../api/adminApi", () => api);

afterEach(cleanup);

// jsdom has no CSS.escape, which react-aria uses to find a row by its key.
globalThis.CSS ??= { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) } as typeof CSS;

const tag = (id: string, text: string, kind: Tag["kind"] = "text", bossTagId: string | null = null): Tag => ({ id, kind, text, bossTagId });
const SIRE_TAGS = [tag("t1", "unsired"), tag("b1", "Abyssal Sire", "boss"), tag("a1", "Sire", "text", "b1"), tag("a2", "Abby sire", "text", "b1")];

function renderField(tiles: Record<string, Tag[]>) {
  api.getBoardTags.mockResolvedValue({ tiles, parts: {} } satisfies BoardTagsResponse);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TagsField slug="b1" owner={{ tileId: "tile" }} locked={false} hint="Words the search finds this tile by." />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe("TagsField", () => {
  it("shows Text tags as chips, and a Boss tag with its names from the wiki folded under it", async () => {
    const user = userEvent.setup();
    renderField({ tile: SIRE_TAGS });
    const own = await screen.findByRole("list", { name: "Tags" });
    expect(within(own).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["unsired"]);
    expect(screen.getByText("Abyssal Sire")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Names for Abyssal Sire" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "2 names from the wiki" }));
    const names = screen.getByRole("list", { name: "Names for Abyssal Sire" });
    expect(within(names).getAllByRole("listitem").map((li) => [li.textContent, li.getAttribute("title")])).toEqual([
      ["Sire", "From the boss tag Abyssal Sire"],
      ["Abby sire", "From the boss tag Abyssal Sire"],
    ]);
  });

  it("adds a Text tag on Enter, and empties the box", async () => {
    const user = userEvent.setup();
    renderField({});
    api.addTag.mockResolvedValue({ tags: [tag("t1", "kq")] });
    const input = await screen.findByRole<HTMLInputElement>("textbox", { name: "Add a tag" });
    await user.type(input, "kq{Enter}");
    expect(api.addTag).toHaveBeenCalledWith("b1", { tileId: "tile" }, { text: "kq" });
    await waitFor(() => expect(input.value).toBe(""));
    expect(within(screen.getByRole("list", { name: "Tags" })).getByText("kq")).toBeTruthy();
  });

  it("removes one alias on its own, or the Boss tag with all of its names", async () => {
    const user = userEvent.setup();
    renderField({ tile: SIRE_TAGS });
    await user.click(await screen.findByRole("button", { name: "2 names from the wiki" }));
    api.removeTag.mockResolvedValueOnce({ tags: SIRE_TAGS.filter((t) => t.id !== "a2") });
    await user.click(screen.getByRole("button", { name: "Remove Abby sire" }));
    expect(api.removeTag).toHaveBeenCalledWith("b1", "a2");
    await waitFor(() => expect(screen.getByRole("button", { name: "Hide the 1 name from the wiki" })).toBeTruthy());

    api.removeTag.mockResolvedValueOnce({ tags: [SIRE_TAGS[0]] });
    await user.click(screen.getByRole("button", { name: "Remove Abyssal Sire and its 1 name from the wiki" }));
    expect(api.removeTag).toHaveBeenLastCalledWith("b1", "b1");
    await waitFor(() => expect(screen.queryByText("Abyssal Sire")).toBeNull());
  });

  it("says why a tag wasn't added", async () => {
    const user = userEvent.setup();
    renderField({});
    api.addTag.mockRejectedValue(new Error("Couldn't reach the OSRS Wiki to look up \"Zulrah\". Try again in a moment."));
    api.searchBosses.mockResolvedValue({ bosses: [{ name: "Zulrah", wikiUrl: "" }] });
    await user.click(await screen.findByRole("button", { name: "Boss" }));
    await user.type(screen.getByRole("combobox", { name: "Boss" }), "zul");
    await user.click(await screen.findByRole("option", { name: "Zulrah" }));
    expect(api.addTag).toHaveBeenCalledWith("b1", { tileId: "tile" }, { boss: "Zulrah" });
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't reach the OSRS Wiki/);
  });
});
