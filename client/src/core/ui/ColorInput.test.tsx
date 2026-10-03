// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ColorInput } from "./ColorInput";

afterEach(cleanup);

describe("ColorInput", () => {
  it("follows a drag across the picker without saving, and saves once when the picker closes", () => {
    const onCommit = vi.fn();
    render(<ColorInput aria-label="Team color" value="#6366f1" onCommit={onCommit} />);
    const input = screen.getByLabelText<HTMLInputElement>("Team color");

    for (const hex of ["#700000", "#800000", "#900000", "#a00000"]) fireEvent.input(input, { target: { value: hex } });
    expect(input.value).toBe("#a00000");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "#a00000" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("#a00000");
  });

  it("saves nothing when the picker closes on the colour it already had", () => {
    const onCommit = vi.fn();
    render(<ColorInput aria-label="Team color" value="#6366f1" onCommit={onCommit} />);
    const input = screen.getByLabelText<HTMLInputElement>("Team color");

    fireEvent.input(input, { target: { value: "#700000" } });
    fireEvent.input(input, { target: { value: "#6366f1" } });
    fireEvent.change(input, { target: { value: "#6366f1" } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("shows a colour saved elsewhere", () => {
    const { rerender } = render(<ColorInput aria-label="Team color" value="#6366f1" onCommit={() => {}} />);
    rerender(<ColorInput aria-label="Team color" value="#22c55e" onCommit={() => {}} />);
    expect(screen.getByLabelText<HTMLInputElement>("Team color").value).toBe("#22c55e");
  });
});
