// A Finished Bingo's Feedback form: its anonymous Feedback responses and Captain responses (CONTEXT.md "Feedback
// form"; docs/adr/0002-anonymous-feedback.md).
//
// The anonymity rules, all of which this file keeps:
//  - A response stores no user id. Its Player finds it again by `respondentKey`, an HMAC of (user id, Bingo id, kind)
//    made with FEEDBACK_SECRET; a Captain's Captain response has its own kind, so its key shares nothing with their
//    Feedback response's.
//  - Responses and answers carry no timestamps, and nothing here writes to the audit log (the routes are auditSkip'd).
//  - Results come out in a fixed shuffled order (by the responses' random ids), never the order they were given in.
//  - Without FEEDBACK_SECRET, or with a different one than a Bingo's responses were keyed with, its form takes no
//    answers (`feedbackUnavailable`): never a stand-in secret, which would either expose respondents or count them twice.
import crypto from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  can,
  isBlankAnswer,
  parseChoiceAnswer,
  type FeedbackAnswer,
  type FeedbackFormResponse,
  type FeedbackOptionTotal,
  type FeedbackResultList,
  type FeedbackResultsResponse,
  type FeedbackSubmission,
  type FeedbackUnavailable,
  type SignupQuestion,
} from "@bingo/shared";
import * as schema from "../db/schema";
import { feedbackAnswers, feedbackResponses } from "../db/schema";
import { log } from "../log";
import { ServiceError } from "./errors";
import { bingoRoles, assertCan } from "./permissions";
import { getQuestions, normalizeAnswers, optionsOf } from "./signupService";
import { withMemberNames } from "./memberPickService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;
type Kind = "player" | "captain";

/** The longest a text answer on the Feedback form can be. */
export const MAX_FEEDBACK_TEXT = 5000;

/**
 * FEEDBACK_SECRET, or null when it isn't set. There is never a stand-in: a built-in default (this repository is public)
 * would let anyone holding the database tell whose a response is, and a made-up one would differ on every restart, so
 * every Player who had answered could answer again and be counted twice.
 */
function feedbackSecret(): string | null {
  const secret = process.env.FEEDBACK_SECRET;
  return secret && secret.trim() !== "" ? secret : null;
}

function secretOrThrow(): string {
  const secret = feedbackSecret();
  if (!secret) throw new ServiceError(503, UNAVAILABLE_MESSAGE.not_configured);
  return secret;
}

/**
 * The key a response is stored under: an HMAC of (user id, Bingo id, kind) with FEEDBACK_SECRET, so the server can find
 * a Player's own response again without anything stored saying whose it is.
 */
export function respondentKey(userId: string, bingoId: string, kind: Kind): string {
  return crypto.createHmac("sha256", secretOrThrow()).update(JSON.stringify([userId, bingoId, kind])).digest("hex");
}

// What a response's `key_check` is made from: with the secret, a value that is the same for every response the secret
// keyed, and different for any other secret. It names no one.
const KEY_CHECK_LABEL = "tectonic-bingo feedback key check v1";

function keyCheckOf(secret: string): string {
  return crypto.createHmac("sha256", secret).update(KEY_CHECK_LABEL).digest("hex");
}

/** What the API says when a form can't take answers (the client shows its own words). */
export const UNAVAILABLE_MESSAGE: Record<FeedbackUnavailable, string> = {
  not_configured: "Feedback can't be answered on this server: FEEDBACK_SECRET isn't set, and responses can't be kept anonymous without it",
  key_changed:
    "Feedback can't be answered for this Bingo: its responses were saved with a different FEEDBACK_SECRET, so nobody's earlier answers could be found and every Player who answered would be counted twice. Restore the secret they were saved with.",
};

// A changed secret is logged once per Bingo per process, not on every request.
const warnedKeyChanged = new Set<string>();

/**
 * Why this Bingo's Feedback form can't take answers on this server, or null when it can:
 *  - "not_configured": FEEDBACK_SECRET isn't set.
 *  - "key_changed": its responses were keyed with a different FEEDBACK_SECRET (changed or lost since). The form is closed
 *    to answers rather than letting every Player who answered add a second response, since theirs can't be found.
 * Results don't need the secret, so they're shown either way.
 */
export function feedbackUnavailable(db: Db, bingoId: string): FeedbackUnavailable | null {
  const secret = feedbackSecret();
  if (!secret) return "not_configured";
  const other = db
    .select({ id: feedbackResponses.id })
    .from(feedbackResponses)
    .where(and(eq(feedbackResponses.bingoId, bingoId), ne(feedbackResponses.keyCheck, keyCheckOf(secret))))
    .limit(1)
    .get();
  if (!other) return null;
  if (!warnedKeyChanged.has(bingoId)) {
    warnedKeyChanged.add(bingoId);
    log.warn("feedback responses were keyed with a different FEEDBACK_SECRET: the form takes no answers until it is restored", { bingoId });
  }
  return "key_changed";
}

/** The questions a Player answers: every All Players one, and a Captain's Captains-only ones besides. */
function questionsFor(questions: SignupQuestion[] | ReturnType<typeof getQuestions>, isCaptain: boolean) {
  return questions.filter((q) => q.audience === "all" || isCaptain);
}

function findResponse(db: Db, bingoId: string, userId: string, kind: Kind) {
  return db
    .select()
    .from(feedbackResponses)
    .where(eq(feedbackResponses.respondentKey, respondentKey(userId, bingoId, kind)))
    .get();
}

function answersOf(db: Db, bingo: Bingo, responseId: string | undefined): FeedbackAnswer[] {
  if (!responseId) return [];
  const rows = db.select({ questionId: feedbackAnswers.questionId, value: feedbackAnswers.value }).from(feedbackAnswers).where(eq(feedbackAnswers.responseId, responseId)).all();
  return withMemberNames(db, bingo.id, rows);
}

/**
 * Whether `user` can answer this Bingo's Feedback form right now: it's Finished (a reopened Bingo closes it) and they're
 * a Player. A Moderator who didn't play, a Cut or withdrawn signup and a non-member aren't Players, and a Historical
 * Bingo (read-only, always Finished, its roster imported) has no Feedback form to answer.
 */
function answerer(db: Db, bingo: Bingo, user: { id: string; isAdmin: boolean }) {
  const roles = bingoRoles(db, bingo, user);
  const isPlayer = roles.includes("player");
  return { roles, isPlayer, isCaptain: roles.includes("captain"), open: isPlayer && !bingo.historical && can(roles, bingo, "answer_feedback").ok };
}

/** Whether the form is open to `user`, and if so whether this server can take their answers: all the Member pick list needs of it. */
export function feedbackOpenTo(db: Db, bingo: Bingo, user: { id: string; isAdmin: boolean }): { open: boolean; unavailable: FeedbackUnavailable | null } {
  if (!answerer(db, bingo, user).open) return { open: false, unavailable: null };
  return { open: true, unavailable: feedbackUnavailable(db, bingo.id) };
}

const CLOSED: FeedbackFormResponse = { open: false, unavailable: null, isCaptain: false, questions: [], answers: [], captainAnswers: [], responded: false, respondedAsCaptain: false };

export function getFeedbackForm(db: Db, bingo: Bingo, user: { id: string; isAdmin: boolean }): FeedbackFormResponse {
  const { isCaptain, open } = answerer(db, bingo, user);
  if (!open) return CLOSED;
  // Open to them, but this server can't take their answers right now: say why rather than show a form that would fail.
  const unavailable = feedbackUnavailable(db, bingo.id);
  if (unavailable) return { ...CLOSED, unavailable };
  const questions = questionsFor(getQuestions(db, bingo.id, "feedback"), isCaptain);
  const own = findResponse(db, bingo.id, user.id, "player");
  const ownCaptain = isCaptain ? findResponse(db, bingo.id, user.id, "captain") : undefined;
  return {
    open: true,
    unavailable: null,
    isCaptain,
    questions,
    answers: answersOf(db, bingo, own?.id),
    captainAnswers: answersOf(db, bingo, ownCaptain?.id),
    responded: !!own,
    respondedAsCaptain: !!ownCaptain,
  };
}

/**
 * Checks one part of a submission (the Feedback response's answers, or the Captain response's) against the questions it
 * may answer, and returns the answers to keep in their stored form. A blank answer is left out, and a part with no
 * answer at all is refused. `previous` is what the Player already saved, which stays valid if an Admin has since
 * edited the options (see normalizeAnswers).
 */
function checkAnswers(
  db: Db,
  userId: string,
  questions: ReturnType<typeof getQuestions>,
  input: unknown,
  previous: ReadonlyMap<string, string>,
  part: string,
): FeedbackAnswer[] {
  if (!Array.isArray(input)) throw new ServiceError(400, `${part} must be a list of answers`);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  for (const a of input as Partial<FeedbackAnswer>[]) {
    if (!a || typeof a.questionId !== "string" || typeof a.value !== "string") throw new ServiceError(400, "Each answer needs a questionId and a value");
    if (!byId.has(a.questionId)) throw new ServiceError(400, "An answer is for a question this form doesn't ask you");
    if (seen.has(a.questionId)) throw new ServiceError(400, "A question is answered twice");
    seen.add(a.questionId);
  }
  const normalized = normalizeAnswers(db, userId, questions, input as FeedbackAnswer[], previous);
  for (const a of normalized) {
    const question = byId.get(a.questionId)!;
    if ((question.type === "text" || question.type === "textarea") && a.value.length > MAX_FEEDBACK_TEXT) {
      throw new ServiceError(400, `An answer can be at most ${MAX_FEEDBACK_TEXT} characters`);
    }
    if (question.type === "boolean" && !["true", "false", ""].includes(a.value)) throw new ServiceError(400, "A yes/no answer must be yes or no");
  }
  const answered = new Map(normalized.map((a) => [a.questionId, a.value]));
  if (questions.some((q) => q.required && isBlankAnswer(q.type, answered.get(q.id)))) throw new ServiceError(400, "Please answer every required question");
  const kept = normalized.filter((a) => !isBlankAnswer(byId.get(a.questionId)!.type, a.value));
  if (kept.length === 0) throw new ServiceError(400, "Answer at least one question");
  return kept;
}

/** The user's saved response of this kind: its id (none if they haven't given one) and its answers as stored, the `previous` checkAnswers keeps valid. */
function ownResponse(db: Db, bingoId: string, userId: string, kind: Kind): { id: string | undefined; previous: Map<string, string> } {
  const response = findResponse(db, bingoId, userId, kind);
  if (!response) return { id: undefined, previous: new Map() };
  const rows = db.select({ questionId: feedbackAnswers.questionId, value: feedbackAnswers.value }).from(feedbackAnswers).where(eq(feedbackAnswers.responseId, response.id)).all();
  return { id: response.id, previous: new Map(rows.map((r) => [r.questionId, r.value])) };
}

/** Replaces the response `existingId` (or creates one when there's none yet) with `answers`. */
function saveResponse(db: Db, bingoId: string, userId: string, kind: Kind, existingId: string | undefined, answers: FeedbackAnswer[]): void {
  const responseId =
    existingId ??
    db.insert(feedbackResponses).values({ bingoId, kind, respondentKey: respondentKey(userId, bingoId, kind), keyCheck: keyCheckOf(secretOrThrow()) }).returning({ id: feedbackResponses.id }).get().id;
  if (existingId) db.delete(feedbackAnswers).where(eq(feedbackAnswers.responseId, responseId)).run();
  for (const a of answers) db.insert(feedbackAnswers).values({ responseId, questionId: a.questionId, value: a.value }).run();
}

/**
 * Saves a Player's Feedback response, and a Captain's Captain response when `captainAnswers` is given: each replaces
 * what was saved, or is created. Refused unless the Bingo is Finished and the user is a Player (and, for the Captain
 * response, a Captain). Writes nothing to the audit log.
 */
export function submitFeedback(db: Db, bingo: Bingo, user: { id: string; isAdmin: boolean }, submission: Partial<FeedbackSubmission>): FeedbackFormResponse {
  const { roles, isPlayer, isCaptain } = answerer(db, bingo, user);
  if (!isPlayer) throw new ServiceError(403, "Only Players of this Bingo can give feedback");
  assertCan(roles, bingo, "answer_feedback", { role: new ServiceError(403, "Only Players of this Bingo can give feedback") });
  if (submission.captainAnswers !== undefined && !isCaptain) throw new ServiceError(403, "Only Captains can answer the Captains-only questions");
  const unavailable = feedbackUnavailable(db, bingo.id);
  if (unavailable) throw new ServiceError(503, UNAVAILABLE_MESSAGE[unavailable]);

  db.transaction((tx) => {
    const all = getQuestions(tx, bingo.id, "feedback");
    const forEveryone = all.filter((q) => q.audience === "all");
    const forCaptains = all.filter((q) => q.audience === "captains");
    if (submission.answers === undefined && submission.captainAnswers === undefined) throw new ServiceError(400, "answers are required");

    if (submission.answers !== undefined) {
      if (forEveryone.length === 0) throw new ServiceError(400, "This Bingo has no questions for every Player");
      const own = ownResponse(tx, bingo.id, user.id, "player");
      saveResponse(tx, bingo.id, user.id, "player", own.id, checkAnswers(tx, user.id, forEveryone, submission.answers, own.previous, "answers"));
    }
    if (submission.captainAnswers !== undefined) {
      if (forCaptains.length === 0) throw new ServiceError(400, "This Bingo has no Captains-only questions");
      const own = ownResponse(tx, bingo.id, user.id, "captain");
      saveResponse(tx, bingo.id, user.id, "captain", own.id, checkAnswers(tx, user.id, forCaptains, submission.captainAnswers, own.previous, "captainAnswers"));
    }
  });
  return getFeedbackForm(db, bingo, user);
}

// ---------------------------------------------------------------------------
// Results (Moderators and Admins)
// ---------------------------------------------------------------------------

/** The options a question's totals count: its own, then Other, then any an answer still holds that were since removed. */
function totalsFor(question: SignupQuestion, answers: string[]): FeedbackOptionTotal[] | null {
  if (question.type === "boolean") {
    return [
      { option: "Yes", count: answers.filter((v) => v === "true").length },
      { option: "No", count: answers.filter((v) => v === "false").length },
    ];
  }
  if (question.type !== "select" && question.type !== "multiselect") return null;
  const counts = new Map(optionsOf(question.optionsJson).map((o) => [o, 0]));
  let other = 0;
  for (const value of answers) {
    const { choices, other: otherValue } = parseChoiceAnswer(value);
    for (const choice of choices) counts.set(choice, (counts.get(choice) ?? 0) + 1);
    if (otherValue !== null && otherValue.trim() !== "") other += 1;
  }
  const totals = [...counts].map(([option, count]) => ({ option, count }));
  if (question.allowOther || other > 0) totals.push({ option: "Other", count: other });
  return totals;
}

function resultList(db: Db, bingo: Bingo, kind: Kind, questions: SignupQuestion[]): FeedbackResultList {
  // By the responses' random ids: a fixed shuffled order, stable between views and never the order they came in.
  const responses = db
    .select({ id: feedbackResponses.id })
    .from(feedbackResponses)
    .where(and(eq(feedbackResponses.bingoId, bingo.id), eq(feedbackResponses.kind, kind)))
    .orderBy(feedbackResponses.id)
    .all();
  const rows = responses.length
    ? db
        .select({ responseId: feedbackAnswers.responseId, questionId: feedbackAnswers.questionId, value: feedbackAnswers.value })
        .from(feedbackAnswers)
        .where(inArray(feedbackAnswers.responseId, responses.map((r) => r.id)))
        .all()
    : [];
  const named = withMemberNames(db, bingo.id, rows);
  const byResponse = new Map<string, FeedbackAnswer[]>();
  for (const row of named) {
    const list = byResponse.get(row.responseId) ?? [];
    list.push({ questionId: row.questionId, value: row.value });
    byResponse.set(row.responseId, list);
  }
  const order = new Map(questions.map((q, i) => [q.id, i]));
  const list = responses.map((r) => ({ answers: (byResponse.get(r.id) ?? []).sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0)) }));

  const totals: Record<string, FeedbackOptionTotal[]> = {};
  for (const question of questions) {
    const given = list.flatMap((r) => r.answers.filter((a) => a.questionId === question.id).map((a) => a.value));
    const counted = totalsFor(question, given);
    if (counted) totals[question.id] = counted;
  }
  return { count: list.length, responses: list, totals };
}

/** The Bingo's Feedback results: how many responded, each response, and the totals, for Feedback and Captain responses apart. */
export function getFeedbackResults(db: Db, bingo: Bingo): FeedbackResultsResponse {
  const questions = getQuestions(db, bingo.id, "feedback") as SignupQuestion[];
  return {
    questions,
    unavailable: feedbackUnavailable(db, bingo.id),
    feedback: resultList(db, bingo, "player", questions.filter((q) => q.audience === "all")),
    captain: resultList(db, bingo, "captain", questions.filter((q) => q.audience === "captains")),
  };
}
