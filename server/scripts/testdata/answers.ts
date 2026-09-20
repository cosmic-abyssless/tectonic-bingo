// What each fake player answers on the signup form. The questions come from the imported board, so whatever an
// admin adds is answered too: every required question gets a real answer (the server refuses a signup without
// them), and optional ones are answered about half the time and otherwise left blank, like a real form.
import { encodeChoices, type SignupQuestion } from "@bingo/shared";
import type { Player } from "./people";
import { clamp, type Rng } from "./rng";

export interface GeneratedAnswer {
  questionId: string;
  value: string;
}

const GENERIC_TEXT = ["Bossing", "Raids", "Slayer", "Learning new content", "Chill vibes", "Pets", "Anything really", "Whatever the team needs"];
const OPTIONAL_ANSWER_CHANCE = 0.55;

function optionsOf(question: SignupQuestion): string[] {
  try {
    const parsed: unknown = JSON.parse(question.optionsJson ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

/** "UTC-5", from the hours a player is offset from UTC. */
const utcLabel = (offset: number): string => (offset === 0 ? "UTC" : `UTC${offset > 0 ? "+" : ""}${offset}`);

function textAnswer(question: SignupQuestion, player: Player, rng: Rng): string {
  // "write yes in the box to agree": the one answer that has to be exact.
  if (/\b(write|type)\b[^.]{0,40}\byes\b/i.test(question.prompt)) return "yes";
  if (/time ?zone|country/i.test(question.prompt)) return utcLabel(player.offset);
  return rng.pick(GENERIC_TEXT);
}

function answerOne(question: SignupQuestion, player: Player, rng: Rng): string {
  switch (question.type) {
    case "boolean":
      return String(rng.chance(0.5));
    case "select": {
      const options = optionsOf(question);
      return options.length > 0 ? rng.pick(options) : "";
    }
    case "multiselect": {
      const options = optionsOf(question);
      if (options.length === 0) return "";
      // A stronger player is comfortable with more of them.
      const count = clamp(Math.round(1 + player.skill * (options.length - 1) + rng.normal(0, 1)), 1, options.length);
      const chosen = new Set(rng.shuffle(options).slice(0, count));
      return encodeChoices(options.filter((o) => chosen.has(o))); // in the question's own order
    }
    default:
      return textAnswer(question, player, rng);
  }
}

/** One answer per question, in the shape the signup endpoint takes. `rng` should be this player's own stream. */
export function answerQuestions(questions: readonly SignupQuestion[], player: Player, rng: Rng): GeneratedAnswer[] {
  return questions.map((question) => {
    const skip = !question.required && !rng.chance(OPTIONAL_ANSWER_CHANCE);
    return { questionId: question.id, value: skip ? "" : answerOne(question, player, rng) };
  });
}
