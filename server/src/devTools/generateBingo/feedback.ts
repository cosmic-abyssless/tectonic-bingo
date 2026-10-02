// The Feedback form (CONTEXT.md "Feedback form"): the Admin sets its questions up with the Bingo (unless the board
// brought its own), and once the Bingo is Finished most Players answer it, a Captain also their Captains-only
// questions, through the same endpoints the site uses. Not everyone does, a few edit what they wrote, and the run's
// own player (--me) is left to find the card inviting them to. Nothing here is attributed: the server keeps no record
// of who answered (docs/adr/0002-anonymous-feedback.md), so the run only counts what it sent.
import type { FeedbackFormResponse, FeedbackResultsResponse, SignupQuestion } from "@bingo/shared";
import { answerQuestions, type GeneratedAnswer } from "./answers";
import type { Api } from "./client";
import type { Player } from "./people";
import type { Rng } from "./rng";
import { HOUR } from "./timeline";

interface QuestionSpec {
  prompt: string;
  type: SignupQuestion["type"];
  helperText?: string;
  options?: string[];
  allowOther?: boolean;
  required?: boolean;
  multiplePicks?: boolean;
  maxPicks?: number;
  audience?: "all" | "captains";
}

/** What the Admin adds when the board has no Feedback questions: every type, and a couple for Captains only. */
export const DEFAULT_FEEDBACK_QUESTIONS: readonly QuestionSpec[] = [
  { prompt: "What did you enjoy most about this Bingo?", type: "textarea", helperText: "A sentence or two is plenty." },
  { prompt: "How was the Board's difficulty?", type: "select", options: ["Too easy", "About right", "Too hard"], allowOther: true, required: true },
  { prompt: "Which parts would you keep next time?", type: "multiselect", options: ["Duo teams", "Superlatives", "Wrapped", "Rewind", "The draft"], allowOther: true },
  { prompt: "Would you play another Bingo?", type: "boolean", required: true },
  { prompt: "Anything we should change?", type: "text" },
  { prompt: "Who made your Team's Bingo better?", type: "member", multiplePicks: true, maxPicks: 3 },
  { prompt: "How did the draft feel?", type: "select", options: ["Fair", "Chaotic", "Too slow"], audience: "captains" },
  { prompt: "What would make being a Captain easier?", type: "textarea", audience: "captains" },
];

const COMMENTS = [
  "Loved the board, the exclusives made it tense.",
  "Too many boss tiles for the casuals on our team.",
  "Great pace. The first weekend was brutal though.",
  "More tiles that skillers can do, please.",
  "The Codeword screenshots were a hassle but fine.",
  "Rewind was the best part. Nothing to change!",
  "Mods were quick with reviews.",
  "Drops that need a proof screenshot confused a few of us.",
];

/** Of a Team's Players, how many answer the form, and of those how many go back and edit it. */
const TURNOUT = 0.7;
const CAPTAIN_TURNOUT = 0.85;
const EDITED = 0.12;

/** The board's Feedback questions, or the defaults added by the Admin at `at` when it has none. */
export async function ensureFeedbackQuestions(api: Api, admin: string, slug: string, at: Date): Promise<SignupQuestion[]> {
  const base = `/api/bingos/${slug}/admin/questions`;
  const existing = (await api.as(admin).get<{ questions: SignupQuestion[] }>(`${base}?form=feedback`)).questions;
  if (existing.length > 0) return existing;
  const created: SignupQuestion[] = [];
  for (const [i, q] of DEFAULT_FEEDBACK_QUESTIONS.entries()) {
    const body = {
      form: "feedback",
      prompt: q.prompt,
      type: q.type,
      helperText: q.helperText,
      optionsJson: q.options ? JSON.stringify(q.options) : undefined,
      allowOther: q.allowOther ?? false,
      required: q.required ?? false,
      multiplePicks: q.multiplePicks ?? false,
      maxPicks: q.maxPicks ?? null,
      audience: q.audience ?? "all",
      sortOrder: i,
    };
    created.push((await api.as(admin).post<{ question: SignupQuestion }>(base, body, { at })).question);
  }
  return created;
}

/** One person's answers to some questions, in the shape the endpoint takes: nothing blank, and comments in place of the signup form's generic text. */
function answers(questions: readonly SignupQuestion[], player: Player, rng: Rng, others: readonly string[]): GeneratedAnswer[] {
  return answerQuestions(questions, player, rng, others)
    .map((a) => {
      const question = questions.find((q) => q.id === a.questionId)!;
      return question.type === "text" || question.type === "textarea" ? { ...a, value: a.value ? rng.pick(COMMENTS) : "" } : a;
    })
    .filter((a) => a.value !== "" && a.value !== "[]");
}

export interface FeedbackTeam {
  /** The Team's Players who have an account. */
  members: Player[];
  /** Who leads it: the Captain, and a duo's co-captain. */
  leads: Player[];
}

export interface FeedbackRun {
  responses: number;
  captainResponses: number;
  problems: string[];
}

/**
 * The Players of a Finished Bingo answer its Feedback form between `from` and about a day on. Each sends what the form
 * would: every Player their Feedback response, a Captain also their Captain response (a few Captains answer only one of
 * the two). A few then edit theirs. `me` (--me) never answers, so their card is still there to try. Afterwards the
 * results (as the Admin) are checked against what was sent.
 */
export async function runFeedback(input: { api: Api; admin: string; slug: string; teams: FeedbackTeam[]; players: Player[]; rng: Rng; from: Date }): Promise<FeedbackRun> {
  const { api, admin, slug, teams, players, rng } = input;
  const run: FeedbackRun = { responses: 0, captainResponses: 0, problems: [] };
  const questions = (await api.as(admin).get<{ questions: SignupQuestion[] }>(`/api/bingos/${slug}/admin/questions?form=feedback`)).questions;
  const forEveryone = questions.filter((q) => q.audience === "all");
  const forCaptains = questions.filter((q) => q.audience === "captains");
  if (questions.length === 0) return run;
  // A server that can't take answers (no FEEDBACK_SECRET, or one its earlier responses weren't keyed with) gets none: the
  // rest of the Bingo is still generated, and the run says why there's no Feedback.
  const { unavailable } = await api.as(admin).get<FeedbackResultsResponse>(`/api/bingos/${slug}/mod/feedback`);
  if (unavailable) {
    run.problems.push(`No Feedback responses were generated: the server can't take answers (${unavailable === "not_configured" ? "FEEDBACK_SECRET isn't set" : "its FEEDBACK_SECRET isn't the one earlier responses were saved with"})`);
    return run;
  }
  const everyone = players.flatMap((p) => (p.userId ? [p.userId] : []));

  for (const team of teams) {
    for (const player of team.members) {
      if (player.isMe) continue;
      const isCaptain = team.leads.includes(player);
      const mine = rng.fork(`feedback-${player.index}`);
      const others = everyone.filter((id) => id !== player.userId); // a Member pick can't pick its own answerer
      const general = forEveryone.length > 0 && mine.chance(isCaptain ? CAPTAIN_TURNOUT : TURNOUT);
      const asCaptain = isCaptain && forCaptains.length > 0 && mine.chance(CAPTAIN_TURNOUT);
      const body: { answers?: GeneratedAnswer[]; captainAnswers?: GeneratedAnswer[] } = {};
      if (general) body.answers = answers(forEveryone, player, mine, others);
      if (asCaptain) body.captainAnswers = answers(forCaptains, player, mine, others);
      // A part with nothing to say (every optional question skipped) isn't sent: the form wouldn't take it either.
      if (body.answers?.length === 0) delete body.answers;
      if (body.captainAnswers?.length === 0) delete body.captainAnswers;
      if (!body.answers && !body.captainAnswers) continue;

      const at = new Date(input.from.getTime() + mine.between(0.1, 20) * HOUR);
      await api.as(player.discordId).put<FeedbackFormResponse>(`/api/bingos/${slug}/feedback`, body, { at });
      if (body.answers) run.responses++;
      if (body.captainAnswers) run.captainResponses++;
      if (mine.chance(EDITED)) {
        const later = new Date(at.getTime() + mine.between(0.2, 2) * HOUR);
        const edit = { ...body, ...(body.answers ? { answers: answers(forEveryone, player, mine.fork("edit"), others) } : {}) };
        if (edit.answers?.length === 0) delete edit.answers;
        if (edit.answers || edit.captainAnswers) await api.as(player.discordId).put<FeedbackFormResponse>(`/api/bingos/${slug}/feedback`, edit, { at: later });
      }
    }
  }

  // The count the Admin sees is the number sent: an edit replaces, never adds.
  const results = await api.as(admin).get<FeedbackResultsResponse>(`/api/bingos/${slug}/mod/feedback`);
  if (results.feedback.count !== run.responses) run.problems.push(`${run.responses} Feedback responses were sent but the results show ${results.feedback.count}`);
  if (results.captain.count !== run.captainResponses) run.problems.push(`${run.captainResponses} Captain responses were sent but the results show ${results.captain.count}`);
  return run;
}
