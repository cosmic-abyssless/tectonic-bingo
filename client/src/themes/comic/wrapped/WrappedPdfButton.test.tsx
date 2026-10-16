// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WrappedOutroModel, WrappedShareCardModel } from "../../../headless/types";
import { ThemeContext, type ThemeContextValue } from "../../context";

// The export itself is core's (core/wrapped/wrappedPdf.test.ts): here, only that the theme's buttons start it.
const pdf = vi.hoisted(() => ({ start: vi.fn(), busy: false, progress: null as { done: number; total: number } | null, label: "Download PDF" }));
vi.mock("../../../core/wrapped/wrappedPdf", () => ({ useWrappedPdf: () => pdf }));

const { WrappedPdfButton } = await import("./WrappedPdfButton");
const { WrappedOutro } = await import("./WrappedOutro");

beforeEach(() => {
  // The comic reads the colour scheme, and a share card measures the column it's shown in.
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pdf.start.mockClear();
  Object.assign(pdf, { busy: false, progress: null, label: "Download PDF" });
});

const theme = { slots: { WrappedShareCard: () => <div /> } } as unknown as ThemeContextValue;
const card = (key: "player" | "team", label: string) => ({ key, label, bingoName: "Spring Bingo", fileName: `spring-wrapped-${key}.png` }) as unknown as WrappedShareCardModel;
const outro = (cards: WrappedShareCardModel[]): WrappedOutroModel => ({ kind: "outro", art: { images: [], credits: [] }, bingoName: "Spring Bingo", cards });
const renderOutro = (cards: WrappedShareCardModel[]) =>
  render(
    <ThemeContext.Provider value={theme}>
      <WrappedOutro section={outro(cards)} preview={false} onRewind={() => {}} onBoard={() => {}} feedback={null} />
    </ThemeContext.Provider>,
  );

describe("the comic's Download PDF", () => {
  it("in the header: says Download PDF and starts the export when pressed", async () => {
    render(<WrappedPdfButton />);
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(pdf.start).toHaveBeenCalledTimes(1);
  });

  it("says how far it has got while it works, and can't be pressed again", () => {
    Object.assign(pdf, { busy: true, progress: { done: 11, total: 38 }, label: "Making PDF… 12 of 38" });
    render(<WrappedPdfButton />);
    expect(screen.getByRole("button", { name: "Making PDF… 12 of 38" })).toHaveProperty("disabled", true);
  });

  it("on the Outro: once, under the last share card, starting the same export, and left out of the PDF", async () => {
    renderOutro([card("player", "Player card"), card("team", "Team card")]);
    const buttons = screen.getAllByRole("button", { name: "Download PDF" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.closest("[data-wrapped-scene]")?.textContent).toContain("Share your Team card");
    expect(buttons[0]!.closest("[data-pdf-skip]")).not.toBeNull();
    // The back cover's teaser buttons are left out of the PDF too.
    expect(screen.getByRole("button", { name: /Watch the replay/ }).closest("[data-pdf-skip]")).not.toBeNull();
    await userEvent.click(buttons[0]!);
    expect(pdf.start).toHaveBeenCalledTimes(1);
  });

  it("on the Outro of a viewer with no share cards: on the credits", () => {
    renderOutro([]);
    expect(screen.getByRole("button", { name: "Download PDF" }).closest("[data-wrapped-scene]")?.textContent).toContain("That's a wrap!");
  });
});
