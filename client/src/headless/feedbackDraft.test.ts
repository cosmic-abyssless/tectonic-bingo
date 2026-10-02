import { describe, expect, it } from "vitest";
import type { SignupQuestion } from "@bingo/shared";
import { feedbackSubmission, isFilled, partProblem } from "./feedbackDraft";

let n = 0;
function question(extra: Partial<SignupQuestion> = {}): SignupQuestion {
  n += 1;
  return { id: `q${n}`, bingoId: "b", form: "feedback", audience: "all", prompt: `Q${n}`, helperText: null, type: "text", optionsJson: null, allowOther: false, multiplePicks: false, maxPicks: null, required: false, sortOrder: n, visibility: "captains", ...extra };
}

describe("the Feedback form's draft", () => {
  const liked = question({ required: true });
  const idea = question();
  const draft = question({ audience: "captains" });
  const role = question({ type: "select", optionsJson: JSON.stringify(["a", "b"]), allowOther: true, audience: "captains" });

  it("sends nothing until something is answered", () => {
    expect(feedbackSubmission([liked, idea], [draft], {})).toBeNull();
    expect(feedbackSubmission([liked, idea], [draft], { [idea.id]: "   " })).toBeNull();
  });

  it("needs the required questions of a part it sends", () => {
    expect(feedbackSubmission([liked, idea], [], { [idea.id]: "x" })).toBeNull();
    expect(partProblem([liked, idea], { [idea.id]: "x" })).toBe("required");
    expect(feedbackSubmission([liked, idea], [], { [liked.id]: "ok" })).toEqual({ answers: [{ questionId: liked.id, value: "ok" }, { questionId: idea.id, value: "" }] });
  });

  it("sends a Captain's own part alone, leaving the Feedback response as it was", () => {
    expect(feedbackSubmission([liked, idea], [draft], { [draft.id]: "tense" })).toEqual({ captainAnswers: [{ questionId: draft.id, value: "tense" }] });
  });

  it("sends both parts when both are filled in, each its own", () => {
    expect(feedbackSubmission([liked], [draft], { [liked.id]: "ok", [draft.id]: "tense" })).toEqual({
      answers: [{ questionId: liked.id, value: "ok" }],
      captainAnswers: [{ questionId: draft.id, value: "tense" }],
    });
  });

  it("holds back a part whose Other is ticked with nothing written", () => {
    const other = JSON.stringify({ other: "" });
    expect(partProblem([role], { [role.id]: other })).toBe("other");
    expect(feedbackSubmission([], [role], { [role.id]: other })).toBeNull();
    expect(isFilled([role], { [role.id]: JSON.stringify({ other: "hybrid" }) })).toBe(true);
  });
});
