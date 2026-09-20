import { describe, expect, it } from "vitest";
import { encodeChoices, formatSignupAnswer, isBlankAnswer, parseChoices } from "@bingo/shared";

describe("multiple-choice answers", () => {
  it("reads a stored list, and treats a blank or plain value gently", () => {
    expect(parseChoices('["Melee","Magic"]')).toEqual(["Melee", "Magic"]);
    expect(parseChoices("")).toEqual([]);
    expect(parseChoices(null)).toEqual([]);
    expect(parseChoices("Melee")).toEqual(["Melee"]); // answered before the question became multiple choice
    expect(parseChoices('[" a ", "", 3, "b"]')).toEqual(["a", "b"]);
  });

  it("encodes without blanks or repeats", () => {
    expect(encodeChoices([" a", "b", "a", ""])).toBe('["a","b"]');
    expect(encodeChoices([])).toBe("[]");
  });

  it("calls an empty list unanswered, and shows a list as words", () => {
    expect(isBlankAnswer("multiselect", "[]")).toBe(true);
    expect(isBlankAnswer("multiselect", '["a"]')).toBe(false);
    expect(isBlankAnswer("text", "  ")).toBe(true);
    expect(isBlankAnswer("text", "[]")).toBe(false); // only a multiple-choice answer is a list
    expect(formatSignupAnswer("multiselect", '["Melee","Magic"]')).toBe("Melee, Magic");
    expect(formatSignupAnswer("select", "Melee")).toBe("Melee");
    expect(formatSignupAnswer("boolean", "true")).toBe("true");
  });
});
