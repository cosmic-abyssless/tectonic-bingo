// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { FeedbackFormResponse, SignupQuestion } from "@bingo/shared";

// The server's copy of the form, which the test swaps the way a refetch would.
let served: FeedbackFormResponse;
vi.mock("../api/queries", () => ({
  useFeedbackForm: () => ({ data: served, isLoading: false }),
  useFeedbackMembers: () => ({ data: undefined }),
  useSaveFeedback: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

import { useFeedbackForm } from "./useFeedbackForm";

function question(id: string, prompt: string): SignupQuestion {
  return { id, bingoId: "b", form: "feedback", audience: "all", prompt, helperText: null, type: "textarea", optionsJson: null, allowOther: false, multiplePicks: false, maxPicks: null, required: false, sortOrder: 0, visibility: "captains" };
}

const form = (questions: SignupQuestion[], answers: FeedbackFormResponse["answers"] = []): FeedbackFormResponse => ({
  open: true, unavailable: null, isCaptain: false, questions, answers, captainAnswers: [], responded: answers.length > 0, respondedAsCaptain: false,
});

describe("useFeedbackForm", () => {
  beforeEach(() => {
    served = form([question("q1", "How was it?")]);
  });

  it("keeps an unsaved answer when only the questions change under it", () => {
    const { result, rerender } = renderHook(() => useFeedbackForm("b1"));
    act(() => result.current.general[0]!.set("Halfway through a long thought"));
    expect(result.current.general[0]!.value).toBe("Halfway through a long thought");

    // An Admin fixes a typo in a question: the refetched form is a new object with other questions and the same answers.
    served = form([question("q1", "How was it, really?"), question("q2", "Anything else?")]);
    rerender();

    expect(result.current.general.map((q) => q.prompt)).toEqual(["How was it, really?", "Anything else?"]);
    expect(result.current.general[0]!.value).toBe("Halfway through a long thought");
  });

  it("refills from the saved answers when those change", () => {
    const { result, rerender } = renderHook(() => useFeedbackForm("b1"));
    act(() => result.current.general[0]!.set("Typed"));
    served = form([question("q1", "How was it?")], [{ questionId: "q1", value: "Saved" }]);
    rerender();
    expect(result.current.general[0]!.value).toBe("Saved");
  });
});
