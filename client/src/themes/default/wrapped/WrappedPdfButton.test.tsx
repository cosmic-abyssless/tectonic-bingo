// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WrappedOutroModel } from "../../../headless/types";
import { ThemeContext, type ThemeContextValue } from "../../context";

// The export itself is core's (core/wrapped/wrappedPdf.test.ts): here, only that the theme's buttons start it.
const pdf = vi.hoisted(() => ({ start: vi.fn(), busy: false, progress: null as { done: number; total: number } | null, label: "Download PDF" }));
vi.mock("../../../core/wrapped/wrappedPdf", () => ({ useWrappedPdf: () => pdf }));

const { WrappedPdfButton } = await import("./WrappedPdfButton");
const { WrappedOutro } = await import("./WrappedOutro");

afterEach(() => {
  cleanup();
  pdf.start.mockClear();
  Object.assign(pdf, { busy: false, progress: null, label: "Download PDF" });
});

const theme = { slots: { WrappedShareCard: () => <div /> } } as unknown as ThemeContextValue;
const outro: WrappedOutroModel = { kind: "outro", art: { images: [], credits: [] }, bingoName: "Spring Bingo", cards: [] };

describe("the default theme's Download PDF", () => {
  it("in the header: says Download PDF and starts the export when pressed", async () => {
    render(<WrappedPdfButton size="sm" />);
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(pdf.start).toHaveBeenCalledTimes(1);
  });

  it("says how far it has got while it works, and can't be pressed again", () => {
    Object.assign(pdf, { busy: true, progress: { done: 11, total: 38 }, label: "Making PDF… 12 of 38" });
    render(<WrappedPdfButton />);
    expect(screen.getByRole("button", { name: "Making PDF… 12 of 38" })).toHaveProperty("disabled", true);
  });

  it("on the Outro: there beside the share cards, starting the same export, and left out of the PDF", async () => {
    render(
      <ThemeContext.Provider value={theme}>
        <WrappedOutro section={outro} preview={false} onRewind={() => {}} onBoard={() => {}} feedback={null} />
      </ThemeContext.Provider>,
    );
    const button = screen.getByRole("button", { name: "Download PDF" });
    expect(button.closest("[data-pdf-skip]")).not.toBeNull();
    // The way out is left out of the PDF too.
    expect(screen.getByRole("button", { name: /Watch the replay/ }).closest("[data-pdf-skip]")).not.toBeNull();
    await userEvent.click(button);
    expect(pdf.start).toHaveBeenCalledTimes(1);
  });
});
