import { describe, expect, it } from "vitest";
import { encodeChoices, encodeMemberPicks, encodeSingleChoice, formatSignupAnswer, hasBlankOther, isBlankAnswer, parseChoiceAnswer, parseChoices, parseMemberPicks } from "@bingo/shared";

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
  });
});

describe("yes/no answers", () => {
  it("show as Yes and No, and anything else as stored", () => {
    expect(formatSignupAnswer("boolean", "true")).toBe("Yes");
    expect(formatSignupAnswer("boolean", "false")).toBe("No");
    expect(formatSignupAnswer("boolean", "")).toBe("");
    expect(formatSignupAnswer("boolean", undefined)).toBe("");
  });
});

describe("Other answers", () => {
  it("round-trip through the stored form, for single and multiple choice", () => {
    expect(encodeChoices(["Melee"], "hybrid")).toBe('["Melee",{"other":"hybrid"}]');
    expect(parseChoiceAnswer('["Melee",{"other":"hybrid"}]')).toEqual({ choices: ["Melee"], other: "hybrid" });
    expect(parseChoices('["Melee",{"other":"hybrid"}]')).toEqual(["Melee"]);
    expect(encodeSingleChoice({ choices: [], other: "hybrid" })).toBe('{"other":"hybrid"}');
    expect(encodeSingleChoice({ choices: ["Melee"], other: null })).toBe("Melee");
    expect(parseChoiceAnswer('{"other":"hybrid"}')).toEqual({ choices: [], other: "hybrid" });
    expect(parseChoiceAnswer("Melee")).toEqual({ choices: ["Melee"], other: null });
  });

  it("show as \"Other: text\" after any options", () => {
    expect(formatSignupAnswer("multiselect", '["Melee",{"other":" hybrid "}]')).toBe("Melee, Other: hybrid");
    expect(formatSignupAnswer("multiselect", '[{"other":"hybrid"}]')).toBe("Other: hybrid");
    expect(formatSignupAnswer("select", '{"other":"hybrid"}')).toBe("Other: hybrid");
  });

  it("leave answers from before Other existed as they were", () => {
    expect(formatSignupAnswer("select", "Melee")).toBe("Melee");
    expect(formatSignupAnswer("select", "{not json")).toBe("{not json");
    expect(formatSignupAnswer("select", "123")).toBe("123");
    expect(formatSignupAnswer("multiselect", "Melee")).toBe("Melee");
    expect(formatSignupAnswer("text", '{"other":"hybrid"}')).toBe('{"other":"hybrid"}'); // only a choice answer has an Other
  });

  it("count as answered only with text", () => {
    expect(isBlankAnswer("select", '{"other":"hybrid"}')).toBe(false);
    expect(isBlankAnswer("multiselect", '[{"other":"hybrid"}]')).toBe(false);
    expect(isBlankAnswer("select", '{"other":"  "}')).toBe(true);
    expect(isBlankAnswer("multiselect", '[{"other":""}]')).toBe(true);
    expect(hasBlankOther("select", '{"other":" "}')).toBe(true);
    expect(hasBlankOther("multiselect", '["Melee",{"other":""}]')).toBe(true);
    expect(hasBlankOther("multiselect", '["Melee",{"other":"x"}]')).toBe(false);
    expect(hasBlankOther("multiselect", '["Melee"]')).toBe(false);
  });
});

describe("Member pick answers", () => {
  it("read the stored ids and the served names alike, and encode as ids without repeats", () => {
    expect(parseMemberPicks('["u1","u2"]')).toEqual([{ id: "u1", name: null }, { id: "u2", name: null }]);
    expect(parseMemberPicks('[{"id":"u1","name":"Zezima"}]')).toEqual([{ id: "u1", name: "Zezima" }]);
    expect(parseMemberPicks("")).toEqual([]);
    expect(parseMemberPicks("Zezima")).toEqual([]);
    expect(encodeMemberPicks(["u1", "u2", "u1"])).toBe('["u1","u2"]');
  });

  it("show as the members' names, and an old free-text answer as written", () => {
    expect(formatSignupAnswer("member", '[{"id":"u1","name":"Zezima"},{"id":"u2","name":"Lynx Titan"}]')).toBe("Zezima, Lynx Titan");
    expect(formatSignupAnswer("member", '[{"id":"u1","name":null}]')).toBe("Unknown member");
    expect(formatSignupAnswer("member", "[]")).toBe("");
    expect(formatSignupAnswer("member", "Zezima")).toBe("Zezima");
  });

  it("count as answered with at least one pick", () => {
    expect(isBlankAnswer("member", "[]")).toBe(true);
    expect(isBlankAnswer("member", "")).toBe(true);
    expect(isBlankAnswer("member", '["u1"]')).toBe(false);
  });
});
