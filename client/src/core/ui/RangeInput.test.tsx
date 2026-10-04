// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RangeInput } from "./RangeInput";

afterEach(cleanup);

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
});
