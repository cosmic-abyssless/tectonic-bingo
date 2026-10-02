// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { page, PAGE_SIZE, shownToInclude, useLoadMore } from "./paging";

const many = Array.from({ length: PAGE_SIZE * 2 + 10 }, (_, i) => i);

describe("paging", () => {
  it("draws 25 at a time", () => {
    expect(PAGE_SIZE).toBe(25);
  });

  it("draws a page, then Load more adds one until nothing is left", () => {
    expect(page(many, PAGE_SIZE)).toMatchObject({ rows: many.slice(0, PAGE_SIZE), remaining: PAGE_SIZE + 10 });
    expect(page(many, PAGE_SIZE * 2).remaining).toBe(10);
    expect(page(many, PAGE_SIZE * 3)).toMatchObject({ rows: many, remaining: 0 });
    expect(page([1, 2], PAGE_SIZE)).toEqual({ rows: [1, 2], remaining: 0 });
  });

  it("draws whole pages up to a row opened past them, never fewer than already shown", () => {
    expect(shownToInclude(10, PAGE_SIZE)).toBe(PAGE_SIZE);
    expect(shownToInclude(PAGE_SIZE, PAGE_SIZE)).toBe(PAGE_SIZE * 2);
    expect(shownToInclude(PAGE_SIZE * 2 + 9, PAGE_SIZE)).toBe(PAGE_SIZE * 3);
    expect(shownToInclude(3, PAGE_SIZE * 3)).toBe(PAGE_SIZE * 3);
    expect(shownToInclude(-1, PAGE_SIZE)).toBe(PAGE_SIZE);
  });
});

describe("useLoadMore", () => {
  it("adds a page with more, and goes back to the first page when its reset key changes", () => {
    const { result, rerender } = renderHook(({ key }) => useLoadMore(many, key), { initialProps: { key: "all" } });
    expect(result.current.rows).toHaveLength(PAGE_SIZE);
    act(() => result.current.more());
    expect(result.current.rows).toHaveLength(PAGE_SIZE * 2);
    expect(result.current.remaining).toBe(10);
    rerender({ key: "pending" });
    expect(result.current.rows).toHaveLength(PAGE_SIZE);
  });
});
