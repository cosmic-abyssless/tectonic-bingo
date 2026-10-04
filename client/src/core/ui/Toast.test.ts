import { afterEach, describe, expect, it, vi } from "vitest";
import { toast, toastOnce, toastQueue } from "./Toast";

afterEach(() => {
  while (toastQueue.visibleToasts.length) toastQueue.close(toastQueue.visibleToasts[0]!.key);
  vi.restoreAllMocks();
});

describe("toastOnce", () => {
  it("adds one toast for a burst, even once newer toasts have pushed it out of sight, and another once it's closed", () => {
    const add = vi.spyOn(toastQueue, "add");
    const slowDowns = () => add.mock.calls.filter(([data]) => data.title === "Slow down");
    toastOnce("slow-down", { title: "Slow down" });
    for (let i = 0; i < 3; i++) toast({ title: `Saved ${i}` });
    expect(toastQueue.visibleToasts.map((t) => t.content.title)).not.toContain("Slow down");

    toastOnce("slow-down", { title: "Slow down" });
    toastOnce("slow-down", { title: "Slow down" });
    expect(slowDowns()).toHaveLength(1);

    toastQueue.close(add.mock.results[0]!.value as string);
    toastOnce("slow-down", { title: "Slow down" });
    expect(slowDowns()).toHaveLength(2);
  });
});
