// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyColumnVisibility } from "./hiddenColumns";

describe("applyColumnVisibility", () => {
  it("hides unchecked columns and shows checked ones without dropping hidden ids from other tables", () => {
    const prev = new Set(["discord", "oldQuestion"]);
    expect([...applyColumnVisibility(prev, ["discord", "status", "buyin"], ["status", "buyin"])].sort()).toEqual(["discord", "oldQuestion"]);
    expect([...applyColumnVisibility(prev, ["discord", "status"], ["discord", "status"])].sort()).toEqual(["oldQuestion"]);
  });
});
