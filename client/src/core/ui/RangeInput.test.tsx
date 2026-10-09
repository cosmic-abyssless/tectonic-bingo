// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { RangeInput } from "./RangeInput";

afterEach(cleanup);

/** A slider whose page keeps the value it's dragged to, as a real one does. */
function Slider({ onCommit }: { onCommit(value: number): void }) {
  const [value, setValue] = useState(10);
  return <RangeInput aria-label="Tolerance" min={0} max={200} value={value} onChange={setValue} onCommit={onCommit} />;
}

describe("RangeInput", () => {
  it("follows a drag on every step, and commits once when the drag ends", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<RangeInput aria-label="Tolerance" min={0} max={200} value={10} onChange={onChange} onCommit={onCommit} />);
    const input = screen.getByLabelText<HTMLInputElement>("Tolerance");

    for (const value of ["20", "30", "40"]) fireEvent.input(input, { target: { value } });
    expect(onChange.mock.calls.map(([v]) => v)).toEqual([20, 30, 40]);
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "40" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(40);
  });

  it("commits once when the pointer lets go of a drag, not again on the change that follows", () => {
    const onCommit = vi.fn();
    render(<Slider onCommit={onCommit} />);
    const input = screen.getByLabelText<HTMLInputElement>("Tolerance");

    fireEvent.pointerDown(input);
    for (const value of ["20", "30"]) fireEvent.input(input, { target: { value } });
    fireEvent.pointerUp(input);
    fireEvent.change(input);
    expect(onCommit.mock.calls).toEqual([[30]]);

    fireEvent.pointerDown(input);
    fireEvent.pointerUp(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits a held arrow key once, when it's let go of, though the browser fires change on every step", () => {
    const onCommit = vi.fn();
    render(<Slider onCommit={onCommit} />);
    const input = screen.getByLabelText<HTMLInputElement>("Tolerance");

    for (const value of ["11", "12", "13", "14", "15"]) {
      fireEvent.keyDown(input, { key: "ArrowRight", repeat: value !== "11" });
      fireEvent.input(input, { target: { value } });
      fireEvent.change(input);
    }
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyUp(input, { key: "ArrowRight" });
    expect(onCommit.mock.calls).toEqual([[15]]);

    // A key pressed and let go of without moving it (at the end of the range, say) commits nothing.
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyUp(input, { key: "ArrowRight" });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits keys still held when it loses focus", () => {
    const onCommit = vi.fn();
    render(<Slider onCommit={onCommit} />);
    const input = screen.getByLabelText<HTMLInputElement>("Tolerance");

    fireEvent.keyDown(input, { key: "ArrowLeft" });
    fireEvent.input(input, { target: { value: "9" } });
    fireEvent.change(input);
    fireEvent.blur(input);
    expect(onCommit.mock.calls).toEqual([[9]]);
  });
});
