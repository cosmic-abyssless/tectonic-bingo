// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { createWrappedProgressStore, WrappedProgressProvider } from "../../../core/wrapped/sceneProgress";
import { ComicReveal, PanelFocusContext } from "./ComicReveal";

afterEach(cleanup);

function Page({ store, focus }: { store: ReturnType<typeof createWrappedProgressStore>; focus?: { sceneId: string | null; step: number } }) {
  return (
    <PanelFocusContext.Provider value={focus ?? { sceneId: null, step: 0 }}>
      <WrappedProgressProvider source={store} reveal={ComicReveal}>
        <WrappedScene steps={3}>
          <Reveal step={0} className="mt-4">
            zero
          </Reveal>
          <Reveal step={1} bare>
            one
          </Reveal>
          <Reveal step={2}>two</Reveal>
        </WrappedScene>
      </WrappedProgressProvider>
    </PanelFocusContext.Provider>
  );
}

const panel = (text: string) => screen.getByText(text).closest(".wrapped-panel") as HTMLElement;
const content = (text: string) => screen.getByText(text).closest(".wrapped-panel-content") as HTMLElement;

describe("the comic's panels", () => {
  it("draws every Reveal as a frame, with the section's layout classes and a step to find it by", () => {
    const store = createWrappedProgressStore();
    render(<Page store={store} />);
    expect(panel("zero").className).toContain("mt-4");
    expect(panel("zero").dataset.wrappedStep).toBe("0");
    expect(panel("two").dataset.wrappedStep).toBe("2");
    // A section that brings its own frame gets none added.
    expect(panel("one").className).toContain("wrapped-panel-bare");
    expect(panel("zero").className).not.toContain("wrapped-panel-bare");
  });

  it("is an empty frame until its step is reached: the content is there but hidden", () => {
    const store = createWrappedProgressStore();
    render(<Page store={store} />);
    for (const text of ["zero", "one", "two"]) {
      expect(panel(text).dataset.revealed).toBe("false");
      expect(content(text).style.visibility).toBe("hidden");
      expect(content(text).dataset.paint).toBe("empty");
    }
  });

  it("is painted in by the brush once the page reaches its step, and the panels already passed stay drawn", () => {
    const store = createWrappedProgressStore();
    render(<Page store={store} />);
    const [scene] = store.getScenes();
    act(() => store.setSceneState(scene!.id, { reached: 1, current: true }));
    // The stroke has started (masked), where it was empty before.
    expect(content("zero").dataset.paint).toBe("painting");
    expect(content("zero").style.visibility).not.toBe("hidden");
    expect(content("zero").style.maskImage || content("zero").style.getPropertyValue("-webkit-mask-image")).toContain("svg");
    // The next panels are still empty frames.
    expect(content("one").dataset.paint).toBe("empty");
    // Reaching further doesn't un-draw the earlier one.
    act(() => store.setSceneState(scene!.id, { reached: 3 }));
    expect(panel("zero").dataset.revealed).toBe("true");
    expect(content("two").dataset.paint).not.toBe("empty");
  });

  it("is simply drawn when it is already reached as it first appears (a page already passed)", () => {
    const store = createWrappedProgressStore();
    const { unmount } = render(<Page store={store} />);
    const [scene] = store.getScenes();
    act(() => store.setSceneState(scene!.id, { reached: 3, current: true }));
    unmount();
    // The Scene registers afresh, and the store still says it's reached: nothing to paint.
    render(<Page store={store} />);
    const [again] = store.getScenes();
    act(() => store.setSceneState(again!.id, { reached: 3 }));
    expect(["painting", "drawn"]).toContain(content("zero").dataset.paint);
  });

  it("lights the panel the camera is on", () => {
    const store = createWrappedProgressStore();
    const { rerender } = render(<Page store={store} />);
    const [scene] = store.getScenes();
    rerender(<Page store={store} focus={{ sceneId: scene!.id, step: 2 }} />);
    expect(panel("two").dataset.focused).toBe("true");
    expect(panel("zero").dataset.focused).toBe("false");
  });
});
