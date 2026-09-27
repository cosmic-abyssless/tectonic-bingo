// How signup answers are stored and shown. Every answer is text; a multiple-choice ("multiselect") answer is a JSON
// list of the chosen options, e.g. ["Melee","Magic"]. One place reads and formats them so the signup form, the
// roster, the draft room and the profile all agree.
//
// A choice question that allows Other stores its free text as an {"other": text} object: the whole answer for a
// single choice ('{"other":"hybrid"}'), or the list's last item for multiple choice ('["Melee",{"other":"hybrid"}]').
// An option label is plain text and a list's options are strings, so neither can be mistaken for it (the server also
// refuses an option label that is itself such an object).

type AnswerType = "text" | "textarea" | "select" | "multiselect" | "boolean";

/** The most choices one multiple-choice answer can hold, and the longest a single choice can be. */
export const MAX_MULTISELECT_CHOICES = 100;
export const MAX_CHOICE_LENGTH = 200;
/** The longest an Other answer's text can be. */
export const MAX_OTHER_LENGTH = 100;

/** A choice question's answer: the options picked, and the Other text ("" while Other is picked but not yet filled in). */
export interface ChoiceAnswer {
  choices: string[];
  other: string | null;
}

/** The text of an {"other": text} object, or null for anything else. The text is as stored, not trimmed. */
export function otherText(item: unknown): string | null {
  if (typeof item === "string") {
    if (!item.trim().startsWith("{")) return null;
    try {
      return otherText(JSON.parse(item));
    } catch {
      return null;
    }
  }
  if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
  const other = (item as { other?: unknown }).other;
  return typeof other === "string" ? other : null;
}

/**
 * A stored single- or multiple-choice answer. Tolerant: a blank answer is none, and a plain value that isn't a list
 * (an answer given before the question became multiple choice) counts as a single choice.
 */
export function parseChoiceAnswer(value: string | null | undefined): ChoiceAnswer {
  const text = (value ?? "").trim();
  if (!text) return { choices: [], other: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { choices: [text], other: null };
  }
  if (Array.isArray(parsed)) {
    const choices = parsed.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim());
    const other = parsed.map(otherText).find((o) => o !== null) ?? null;
    return { choices, other };
  }
  const other = otherText(parsed);
  return other !== null ? { choices: [], other } : { choices: [text], other: null };
}

/** The options chosen in a stored answer (any Other text aside). */
export function parseChoices(value: string | null | undefined): string[] {
  return parseChoiceAnswer(value).choices;
}

/** The stored form of a set of choices, plus Other's text when it's picked (null when it isn't). */
export function encodeChoices(choices: readonly string[], other: string | null = null): string {
  const unique = [...new Set(choices.map((c) => c.trim()).filter(Boolean))];
  return JSON.stringify(other === null ? unique : [...unique, { other }]);
}

/** The stored form of a single choice: the option itself, or Other with its text. */
export function encodeSingleChoice(answer: ChoiceAnswer): string {
  if (answer.other !== null) return JSON.stringify({ other: answer.other });
  return answer.choices[0] ?? "";
}

/** Whether a choice answer picks Other but leaves its text blank, which can't be saved. */
export function hasBlankOther(type: AnswerType, value: string | null | undefined): boolean {
  if (type !== "select" && type !== "multiselect") return false;
  const { other } = parseChoiceAnswer(value);
  return other !== null && other.trim() === "";
}

/** Whether an answer says nothing: empty, or (for multiple choice) an empty list. Other with no text says nothing. */
export function isBlankAnswer(type: AnswerType, value: string | null | undefined): boolean {
  if (type === "select" || type === "multiselect") {
    const { choices, other } = parseChoiceAnswer(value);
    return choices.length === 0 && (other ?? "").trim() === "";
  }
  return (value ?? "").trim() === "";
}

/**
 * An answer as a person reads it: a multiple-choice list is "Melee, Other: hybrid", a single choice "Other: hybrid"
 * or the option, yes/no "Yes" or "No", and anything else as stored.
 */
export function formatSignupAnswer(type: AnswerType, value: string | null | undefined): string {
  if (type === "boolean") return value === "true" ? "Yes" : value === "false" ? "No" : (value ?? "");
  if (type === "select" || type === "multiselect") {
    const { choices, other } = parseChoiceAnswer(value);
    const otherShown = other !== null && other.trim() !== "" ? [`Other: ${other.trim()}`] : [];
    return [...choices, ...otherShown].join(", ");
  }
  return value ?? "";
}
