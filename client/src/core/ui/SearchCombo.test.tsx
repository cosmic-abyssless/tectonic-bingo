// @vitest-environment jsdom
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComboBox, ListBox, ListBoxItem } from "react-aria-components";
import { ComboFocusFirst, ComboInput, ComboPopover, SearchCombo } from "./SearchCombo";
import { SearchableSelect } from "./SearchableSelect";

afterEach(cleanup);

// jsdom has no CSS.escape, which react-aria uses to find a row by its key.
globalThis.CSS ??= { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) } as typeof CSS;

const FRUITS = ["Apple", "Apricot", "Banana", "Cherry"];

/** Searching, as ItemSearchInput and UserSearchInput do: the test owns the text and matches the items to it. */
function Search({ onPick, clearOnPick }: { onPick: (fruit: string) => void; clearOnPick?: boolean }) {
  const [text, setText] = useState("");
  const q = text.trim().toLowerCase();
  return (
    <SearchCombo
      items={q ? FRUITS.filter((f) => f.toLowerCase().includes(q)) : []}
      itemKey={(f) => f}
      itemText={(f) => f}
      onPick={onPick}
      inputValue={text}
      onInputChange={setText}
      clearOnPick={clearOnPick}
      aria-label="Fruit"
    />
  );
}

describe("SearchCombo", () => {
  it("is a combobox whose list is a listbox, and picks the highlighted row with the arrows and Enter", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Search onPick={onPick} />);
    const input = screen.getByRole("combobox", { name: "Fruit" });
    await user.type(input, "ap");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Apple", "Apricot"]);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    // The highlighted row is the input's active descendant, which is what a screen reader announces.
    expect(document.getElementById(input.getAttribute("aria-activedescendant")!)?.textContent).toBe("Apricot");
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("Apricot");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps free text: blurring, or Enter with no row highlighted, leaves what was typed", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Search onPick={onPick} />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.type(input, "Any Cerberus drop");
    await user.keyboard("{Enter}");
    await user.tab();
    expect(input.value).toBe("Any Cerberus drop");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("closes on Escape, then clears on a second Escape", async () => {
    const user = userEvent.setup();
    render(<Search onPick={() => {}} />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.type(input, "ban");
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.value).toBe("ban");
    await user.keyboard("{Escape}");
    expect(input.value).toBe("");
  });

  it("empties the box after a pick with clearOnPick", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Search onPick={onPick} clearOnPick />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.type(input, "cher");
    await user.click(screen.getByRole("option", { name: "Cherry" }));
    expect(onPick).toHaveBeenCalledWith("Cherry");
    expect(input.value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("SearchableSelect", () => {
  const options = [
    { id: "a", label: "Apple" },
    { id: "b", label: "Banana", group: "Yellow" },
    { id: "c", label: "Cherry" },
  ];

  it("shows the chosen option, lists them all on focus, filters on typing and picks with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect value="a" options={options} placeholder="Pick a fruit" onChange={onChange} />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    expect(input.value).toBe("Apple");
    await user.click(input);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    // Grouped options sit under their heading.
    expect(screen.getByRole("group", { name: "Yellow" })).toBeTruthy();
    await user.keyboard("che{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("highlights the top match once typed in, so Enter alone picks it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect value="a" options={options} placeholder="Pick a fruit" onChange={onChange} />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.click(input);
    await user.keyboard("an");
    // A frame later: react-aria clears the highlight as the text changes, then the top match gets it back.
    await waitFor(() => expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent).toBe("Banana"));
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("replaces the chosen option's text with what's typed, first letter and all", async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="a" options={options} placeholder="Pick a fruit" onChange={() => {}} />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}{ArrowUp}Ban");
    expect(input.value).toBe("Ban");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Banana"]);
  });

  it("puts the chosen option back when the list is closed with Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect value="a" options={options} placeholder="Pick a fruit" onChange={onChange} />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.click(input);
    await user.keyboard("che{Escape}");
    expect(input.value).toBe("Apple");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("can't be opened or changed while read-only", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect value="a" options={options} placeholder="Pick a fruit" onChange={onChange} readOnly />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}ban{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.value).toBe("Apple");
    expect(onChange).not.toHaveBeenCalled();
  });

  // The Submit flow's Tile picker: a Tile is found by more than its name (its Items, its Tags), and the Tags need the
  // server, which is asked for what's typed.
  it("filters with the caller's matcher, and tells the caller what's typed", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    const tagged = new Set(["c"]);
    render(
      <SearchableSelect
        value="a"
        options={options}
        placeholder="Pick a fruit"
        onChange={() => {}}
        matches={(o, q) => o.label.toLowerCase().includes(q) || (q === "red" && tagged.has(o.id))}
        onQueryChange={onQueryChange}
      />,
    );
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.click(input);
    expect(onQueryChange).toHaveBeenLastCalledWith("");
    await user.keyboard("Red");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Cherry"]);
    expect(onQueryChange).toHaveBeenLastCalledWith("red");
  });
});

describe("ComboFocusFirst", () => {
  /** The board's Tile search: rows found at once, and a later match (a Tag match, from the server) that goes first. */
  function Tiles({ late }: { late: boolean }) {
    const [text, setText] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const rows = text ? [...(late ? ["Gauntlet"] : []), "Pets", "Zulrah"] : [];
    return (
      <ComboBox ref={rootRef} aria-label="Tiles" inputValue={text} onInputChange={setText} items={rows.map((id) => ({ id }))} allowsCustomValue>
        <ComboFocusFirst />
        <ComboInput />
        <ComboPopover anchorRef={rootRef}>
          <ListBox>{(row: { id: string }) => <ListBoxItem id={row.id}>{row.id}</ListBoxItem>}</ListBox>
        </ComboPopover>
      </ComboBox>
    );
  }
  const highlighted = (input: HTMLInputElement) => document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent;

  it("moves the highlight to a match that arrives above the top row it highlighted", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Tiles late={false} />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.click(input);
    await user.keyboard("cg");
    await waitFor(() => expect(highlighted(input)).toBe("Pets"));
    rerender(<Tiles late />);
    await waitFor(() => expect(highlighted(input)).toBe("Gauntlet"));
  });

  it("leaves a highlight the keyboard moved", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Tiles late={false} />);
    const input = screen.getByRole<HTMLInputElement>("combobox");
    await user.click(input);
    await user.keyboard("cg");
    await waitFor(() => expect(highlighted(input)).toBe("Pets"));
    await user.keyboard("{ArrowDown}");
    expect(highlighted(input)).toBe("Zulrah");
    rerender(<Tiles late />);
    await new Promise((r) => setTimeout(r, 50));
    expect(highlighted(input)).toBe("Zulrah");
  });
});
