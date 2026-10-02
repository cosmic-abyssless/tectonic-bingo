// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { createWrappedProgressStore, WrappedProgressProvider } from "../../../core/wrapped/sceneProgress";
import { ComicReveal } from "./ComicReveal";

afterEach(cleanup);

function Page({ store }: { store: ReturnType<typeof createWrappedProgressStore> }) {
  return (
    <WrappedProgressProvider source={store} reveal={ComicReveal}>
      <WrappedScene steps={3}>
        <Reveal step={0} emphasis="splash" className="mt-4">
          zero
        </Reveal>
        <Reveal step={1} bare>
          one
        </Reveal>
        <Reveal step={2} emphasis="narration">
          two
        </Reveal>
      </WrappedScene>
    </WrappedProgressProvider>
  );
}

const panel = (text: string) => screen.getByText(text).closest(".wrapped-panel") as HTMLElement;
const content = (text: string) => screen.getByText(text).closest(".wrapped-panel-content") as HTMLElement;

describe("the comic's panels", () => {
  it("draws every Reveal as a framed panel, with the section's layout classes, its emphasis and a step to find it by", () => {
    const store = createWrappedProgressStore();
    render(<Page store={store} />);
    expect(panel("zero").className).toContain("mt-4");
    expect(panel("zero").dataset.wrappedStep).toBe("0");
    expect(panel("two").dataset.wrappedStep).toBe("2");
    expect(panel("zero").dataset.emphasis).toBe("splash");
    expect(panel("two").dataset.emphasis).toBe("narration");
    expect(panel("zero").querySelector(".wrapped-panel-frame .wrapped-panel-ink")).not.toBeNull();
    // A section that brings its own frame gets none added.
    expect(panel("one").className).toContain("wrapped-panel-bare");
    expect(panel("one").querySelector(".wrapped-panel-frame")).toBeNull();
  });

  it("is only pencilled in until its step is reached: the content is there but hidden", () => {
    const store = createWrappedProgressStore();
    render(<Page store={store} />);
    for (const text of ["zero", "one", "two"]) {
      expect(panel(text).dataset.revealed).toBe("false");
      expect(panel(text).dataset.ink).toBe("pencil");
      expect(content(text).style.visibility).toBe("hidden");
    }
  });

  it("is inked in once the page reaches its step, and the panels already passed stay drawn", () => {
    const store = createWrappedProgressStore();
    render(<Page store={store} />);
    const [scene] = store.getScenes();
    act(() => store.setSceneState(scene!.id, { reached: 1, current: true }));
    expect(panel("zero").dataset.ink).toBe("inked");
    expect(content("zero").style.visibility).not.toBe("hidden");
    // The next panels are still only pencilled in.
    expect(panel("one").dataset.ink).toBe("pencil");
    // Reaching further doesn't un-draw the earlier one.
    act(() => store.setSceneState(scene!.id, { reached: 3 }));
    expect(panel("zero").dataset.ink).toBe("inked");
    expect(panel("two").dataset.ink).toBe("inked");
  });

  it("is simply drawn when it is already reached as it first appears (a page already passed)", () => {
    const store = createWrappedProgressStore();
    const { unmount } = render(<Page store={store} />);
    const [scene] = store.getScenes();
    act(() => store.setSceneState(scene!.id, { reached: 3, current: true }));
    unmount();
    // The Scene registers afresh, and the store still says it's reached.
    render(<Page store={store} />);
    const [again] = store.getScenes();
    act(() => store.setSceneState(again!.id, { reached: 3 }));
    expect(panel("zero").dataset.ink).toBe("inked");
  });
});
