// How signup answers are stored and shown. Every answer is text; a multiple-choice ("multiselect") answer is a JSON
// list of the chosen options, e.g. ["Melee","Magic"]. One place reads and formats them so the signup form, the
// roster, the draft room and the profile all agree.

type AnswerType = "text" | "textarea" | "select" | "multiselect" | "boolean";

/** The most choices one multiple-choice answer can hold, and the longest a single choice can be. */
export const MAX_MULTISELECT_CHOICES = 100;
export const MAX_CHOICE_LENGTH = 200;

/**
 * The choices in a stored multiple-choice answer. Tolerant: a blank answer is none, and a plain value that isn't a
 * list (an answer given before the question became multiple choice) counts as a single choice.
 */
export function parseChoices(value: string | null | undefined): string[] {
  const text = (value ?? "").trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim());
  } catch {
    // not JSON: fall through
  }
  return [text];
}

/** The stored form of a set of choices. */
export function encodeChoices(choices: readonly string[]): string {
  return JSON.stringify([...new Set(choices.map((c) => c.trim()).filter(Boolean))]);
}

/** Whether an answer says nothing: empty, or (for multiple choice) an empty list. */
export function isBlankAnswer(type: AnswerType, value: string | null | undefined): boolean {
  if (type === "multiselect") return parseChoices(value).length === 0;
  return (value ?? "").trim() === "";
}

/** An answer as a person reads it: a multiple-choice list is "Melee, Magic"; anything else is as stored. */
export function formatSignupAnswer(type: AnswerType, value: string | null | undefined): string {
  if (type === "multiselect") return parseChoices(value).join(", ");
  return value ?? "";
}
