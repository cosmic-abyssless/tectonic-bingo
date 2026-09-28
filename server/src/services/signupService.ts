import { now as clockNow } from "../clock";
import { and, count, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { canSeeAnswers, encodeChoices, encodeMemberPicks, formatSignupAnswer, isBlankAnswer, isValidTimeZone, otherText, parseChoiceAnswer, parseMemberPicks, QUESTION_VISIBILITIES, MAX_CHOICE_LENGTH, MAX_MEMBER_PICKS, MAX_MULTISELECT_CHOICES, MAX_OTHER_LENGTH, MAX_QUESTION_HELPER_TEXT, type AnswerViewer, type QuestionVisibility, type SignupQuestionType, type Stage } from "@bingo/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signupAnswers, signupQuestions, signups, teamMembers, teams, users } from "../db/schema";
import { ServiceError } from "./errors";
import { dissolveForUser, getAcceptedPairs, getPendingOutgoingPairs } from "./pairingService";
import { audit, diffFields, markAuditedNoop } from "../audit/record";
import { userLabelById } from "../audit/describe";
import { withRsn } from "./playerNames";
import { parseStoredCaStats } from "./combatAchievements";
import { parseWomSummary } from "./womService";
import { PUBLIC_USER_COLS } from "./userService";
import { inGuildUserIds, nameMemberPicks, withMemberNames } from "./memberPickService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

// Every signup query whose result reaches a client response uses this
// column list — excludes womDataJson/runeProfileDataJson, the raw
// external-API blobs playerStatsService.ts persists (the RuneProfile one
// alone can be 100KB+ per signup). Derived CA snapshots are small and
// selected separately where a roster/form needs them. Raw blobs are read
// by the draft route and written by playerStatsService.ts.
export const PUBLIC_SIGNUP_COLS = {
  id: signups.id,
  bingoId: signups.bingoId,
  userId: signups.userId,
  rsn: signups.rsn,
  timezone: signups.timezone,
  womId: signups.womId,
  rsnVerified: signups.rsnVerified,
  status: signups.status,
  buyinReceivedAt: signups.buyinReceivedAt,
  buyinCollectedByUserId: signups.buyinCollectedByUserId,
  buyinRecordedByUserId: signups.buyinRecordedByUserId,
  createdAt: signups.createdAt,
};

const SIGNUP_CA_COLS = {
  caCurrentJson: signups.caCurrentJson,
  caPeakJson: signups.caPeakJson,
  statsFetchedAt: signups.statsFetchedAt,
  womDataJson: signups.womDataJson,
};

export function getQuestions(db: Db, bingoId: string) {
  return db.select().from(signupQuestions).where(eq(signupQuestions.bingoId, bingoId)).orderBy(signupQuestions.sortOrder).all();
}

export interface CreateQuestionParams {
  bingoId: string;
  prompt: string;
  /** Plain text shown under the question on the signup form. Blank means none. */
  helperText?: string | null;
  type: SignupQuestionType;
  optionsJson?: string | null;
  /** Choice questions only: offer an Other choice with a free-text box. */
  allowOther?: boolean;
  /** Member pick only: several members may be picked (otherwise one). */
  multiplePicks?: boolean;
  /** Member pick with several only: the most that may be picked; null for no limit. */
  maxPicks?: number | null;
  required?: boolean;
  sortOrder?: number;
  visibility?: QuestionVisibility;
}

const isChoiceType = (type: SignupQuestionType) => type === "select" || type === "multiselect";

/** A question's options, or none when they're missing or malformed. */
function optionsOf(optionsJson: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(optionsJson ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Checks the allow-Other flag against the question's type (only a choice question can have it), and that no option
 * reads as an Other answer, which would make the two impossible to tell apart.
 */
function assertChoiceSettings(type: SignupQuestionType, allowOther: unknown, optionsJson: string | null | undefined): void {
  if (allowOther !== undefined && typeof allowOther !== "boolean") throw new ServiceError(400, "allowOther must be true or false");
  if (allowOther && !isChoiceType(type)) throw new ServiceError(400, "Only a single- or multiple-choice question can allow Other");
  if (isChoiceType(type) && optionsOf(optionsJson).some((o) => otherText(o) !== null)) throw new ServiceError(400, "An option can't be written as an Other answer");
}

/**
 * Checks a Member pick's settings: one or several only on a Member pick, and a maximum only with several, a whole
 * number from 1 up. `multiplePicks` and `maxPicks` are what the question ends up with.
 */
function assertMemberSettings(type: SignupQuestionType, multiplePicks: unknown, maxPicks: unknown): void {
  if (typeof multiplePicks !== "boolean") throw new ServiceError(400, "multiplePicks must be true or false");
  if (maxPicks !== null && (typeof maxPicks !== "number" || !Number.isInteger(maxPicks) || maxPicks < 1 || maxPicks > MAX_MEMBER_PICKS)) {
    throw new ServiceError(400, `The maximum must be a whole number from 1 to ${MAX_MEMBER_PICKS}, or empty for no limit`);
  }
  if (type !== "member" && (multiplePicks || maxPicks !== null)) throw new ServiceError(400, "Only a Member pick question can pick several members or have a maximum");
  if (!multiplePicks && maxPicks !== null) throw new ServiceError(400, "Only a Member pick of several members can have a maximum");
}

/** Trims the helper text; blank (or absent) is none. */
function normalizeHelperText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ServiceError(400, "helperText must be text");
  const trimmed = value.trim();
  if (trimmed.length > MAX_QUESTION_HELPER_TEXT) throw new ServiceError(400, `Helper text can be at most ${MAX_QUESTION_HELPER_TEXT} characters`);
  return trimmed || null;
}

function assertVisibility(value: unknown): void {
  if (value !== undefined && !(QUESTION_VISIBILITIES as readonly unknown[]).includes(value)) {
    throw new ServiceError(400, `visibility must be one of ${QUESTION_VISIBILITIES.join(", ")}`);
  }
}

/** The level a request sees answers from: a site admin, else a bingo mod, else (a team lead) a captain. */
export function answerViewerFor(isSiteAdmin: boolean, isMod: boolean): AnswerViewer {
  return isSiteAdmin ? "admin" : isMod ? "mod" : "captain";
}

/**
 * Whether a viewer gets another player's signup answers in their profile. Mods (and site admins) always do; a
 * team lead (captain or co-captain) only while scouting and drafting, the window the draft pool gives them too.
 */
export function seesProfileAnswers(viewer: { isMod: boolean; isTeamLead: boolean }, stage: Stage): boolean {
  return viewer.isMod || (viewer.isTeamLead && (stage === "signup" || stage === "captains" || stage === "draft"));
}

/** The ids of a bingo's questions whose answers `viewer` may see (their own answers aside, which they always can). */
export function visibleQuestionIds(db: Db, bingoId: string, viewer: AnswerViewer): Set<string> {
  const questions = db.select({ id: signupQuestions.id, visibility: signupQuestions.visibility }).from(signupQuestions).where(eq(signupQuestions.bingoId, bingoId)).all();
  return new Set(questions.filter((q) => canSeeAnswers(q.visibility, viewer)).map((q) => q.id));
}

export function createQuestion(db: Db, params: CreateQuestionParams) {
  if ((params.type === "select" || params.type === "multiselect") && !params.optionsJson) {
    throw new ServiceError(400, "optionsJson is required for a choice question");
  }
  assertChoiceSettings(params.type, params.allowOther, params.optionsJson);
  assertMemberSettings(params.type, params.multiplePicks ?? false, params.maxPicks ?? null);
  assertVisibility(params.visibility);
  const values = { ...params, helperText: normalizeHelperText(params.helperText) };
  return db.transaction((tx) => {
    const question = tx.insert(signupQuestions).values(values).returning().get();
    audit(tx, {
      action: "question.created",
      bingoId: params.bingoId,
      entity: { type: "question", id: question.id, label: question.prompt },
      details: { prompt: question.prompt, type: question.type, required: question.required },
    });
    return question;
  });
}

export function updateQuestion(db: Db, id: string, params: Partial<Omit<CreateQuestionParams, "bingoId">>) {
  return db.transaction((tx) => {
    const existing = tx.select().from(signupQuestions).where(eq(signupQuestions.id, id)).get();
    if (!existing) throw new ServiceError(404, "Question not found");
    const type = params.type ?? existing.type;
    assertChoiceSettings(type, params.allowOther, params.optionsJson ?? existing.optionsJson);
    assertVisibility(params.visibility);
    const set = "helperText" in params ? { ...params, helperText: normalizeHelperText(params.helperText) } : { ...params };
    // Other goes with the choices: a question that stops being a choice question stops allowing it.
    if (!isChoiceType(type) && existing.allowOther) set.allowOther = false;
    // Likewise one/several and the maximum go with the Member pick, and the maximum with several.
    if (type !== "member") {
      if (params.multiplePicks === undefined && existing.multiplePicks) set.multiplePicks = false;
      if (params.maxPicks === undefined && existing.maxPicks !== null) set.maxPicks = null;
    }
    const multiplePicks = set.multiplePicks ?? existing.multiplePicks;
    if (!multiplePicks && params.maxPicks === undefined && existing.maxPicks !== null) set.maxPicks = null;
    assertMemberSettings(type, multiplePicks, set.maxPicks === undefined ? existing.maxPicks : set.maxPicks);
    const updated = tx.update(signupQuestions).set(set).where(eq(signupQuestions.id, id)).returning().get();

    const changes = diffFields(existing, updated, { only: Object.keys(set) as (keyof typeof existing)[] });
    if (changes) {
      audit(tx, {
        action: "question.updated",
        bingoId: existing.bingoId,
        entity: { type: "question", id, label: existing.prompt },
        details: { changes: changes as never },
      });
    } else {
      markAuditedNoop();
    }
    return updated;
  });
}

// How many (non-blank) answers each of a bingo's questions has — what deleting it would throw away, for the mod UI's
// confirmation.
export function getAnswerCounts(db: Db, bingoId: string): Record<string, number> {
  const rows = db
    .select({ questionId: signupAnswers.questionId, answers: count() })
    .from(signupAnswers)
    .innerJoin(signupQuestions, eq(signupAnswers.questionId, signupQuestions.id))
    .where(and(eq(signupQuestions.bingoId, bingoId), ne(signupAnswers.value, "")))
    .groupBy(signupAnswers.questionId)
    .all();
  return Object.fromEntries(rows.map((r) => [r.questionId, r.answers]));
}

// Deletes the question and every answer to it (they can't outlive it: signup_answers references the question). The
// mod UI warns first when there are answers; the audit entry records how many went.
export function deleteQuestion(db: Db, id: string): void {
  db.transaction((tx) => {
    const existing = tx.select().from(signupQuestions).where(eq(signupQuestions.id, id)).get();
    const answersDeleted = existing ? (getAnswerCounts(tx, existing.bingoId)[id] ?? 0) : 0;
    tx.delete(signupAnswers).where(eq(signupAnswers.questionId, id)).run();
    tx.delete(signupQuestions).where(eq(signupQuestions.id, id)).run();
    if (existing) {
      audit(tx, {
        action: "question.deleted",
        bingoId: existing.bingoId,
        entity: { type: "question", id, label: existing.prompt },
        details: { prompt: existing.prompt, type: existing.type, required: existing.required, answersDeleted },
      });
    } else {
      markAuditedNoop();
    }
  });
}

// Bulk-reorders questions by the given id order (0-based sortOrder assigned by position).
export function reorderQuestions(db: Db, bingoId: string, orderedIds: string[]): void {
  db.transaction((tx) => {
    for (const [index, id] of orderedIds.entries()) {
      tx.update(signupQuestions)
        .set({ sortOrder: index })
        .where(and(eq(signupQuestions.id, id), eq(signupQuestions.bingoId, bingoId)))
        .run();
    }
    audit(tx, {
      action: "question.reordered",
      bingoId,
      entity: { type: "question", id: null },
      details: { order: orderedIds },
    });
  });
}

// ---------------------------------------------------------------------------
// Signups (player-facing) & roster (mod-facing)
// ---------------------------------------------------------------------------

function assertSignupOpen(bingo: Bingo): void {
  if (bingo.stage !== "signup") {
    throw new ServiceError(400, `Signups are only open during the signup stage (current stage: ${bingo.stage})`);
  }
}

export interface SignupAnswerInput {
  questionId: string;
  value: string;
}

export function getSignupForUser(db: Db, bingoId: string, userId: string) {
  const row = db
    .select({ ...PUBLIC_SIGNUP_COLS, ...SIGNUP_CA_COLS })
    .from(signups)
    .where(and(eq(signups.bingoId, bingoId), eq(signups.userId, userId)))
    .get();
  if (!row) return null;
  const { caCurrentJson, caPeakJson, statsFetchedAt, womDataJson, ...signup } = row;
  void womDataJson;
  const answers = withMemberNames(db, bingoId, db.select().from(signupAnswers).where(eq(signupAnswers.signupId, signup.id)).all());
  return { signup, answers, caCurrentJson, caPeakJson, statsFetchedAt };
}

// Trimmed, or a 400 for anything Intl doesn't recognise as a zone.
function normalizeTimeZone(tz: string): string {
  const trimmed = tz.trim();
  if (!isValidTimeZone(trimmed)) throw new ServiceError(400, "Please pick a valid timezone");
  return trimmed;
}

export interface CreateSignupParams {
  bingoId: string;
  userId: string;
  rsn: string;
  // Required of players by the route; optional here so scripts/tests that don't care about it needn't pass one.
  timezone?: string | null;
  answers: SignupAnswerInput[];
  // Set by the route handler after checking the submitted RSN against the
  // signer's tectonic-api RSNs. Never trust a client-sent verified claim.
  womId?: string | null;
  rsnVerified?: boolean;
}

type AnsweredQuestion = { id: string; type: SignupQuestionType; optionsJson: string | null; allowOther: boolean; multiplePicks: boolean; maxPicks: number | null };

/**
 * A Member pick answer in its stored form: a list of user ids, each an existing user in the clan right now who isn't
 * the answerer, none twice, and no more than the question allows. A member already in the player's saved answer
 * stays pickable after leaving the clan, so saving the form untouched still works.
 */
function normalizeMemberPicks(db: Db, question: AnsweredQuestion, value: unknown, answererUserId: string, previous: string | undefined): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "[]";
  let items: unknown = null;
  try {
    items = JSON.parse(text);
  } catch {
    // not a list: refused below
  }
  // Each pick is a user id; the named form the server sends out ({ id, name }) is taken back too.
  const ids = Array.isArray(items) ? items.map((i) => (typeof i === "string" ? i : i && typeof i === "object" ? (i as { id?: unknown }).id : null)) : null;
  if (!ids || ids.some((id) => typeof id !== "string" || !id)) throw new ServiceError(400, "A Member pick answer must be a list of members");
  const picks = ids as string[];
  if (new Set(picks).size !== picks.length) throw new ServiceError(400, "The same member is picked twice");
  if (picks.includes(answererUserId)) throw new ServiceError(400, "You can't pick yourself");
  if (!question.multiplePicks && picks.length > 1) throw new ServiceError(400, "Pick only one member");
  const max = Math.min(question.maxPicks ?? MAX_MEMBER_PICKS, MAX_MEMBER_PICKS);
  if (picks.length > max) throw new ServiceError(400, `Pick at most ${max} member${max === 1 ? "" : "s"}`);
  const kept = new Set(parseMemberPicks(previous).map((p) => p.id));
  const inGuild = inGuildUserIds(db, picks.filter((id) => !kept.has(id)));
  if (picks.some((id) => !kept.has(id) && !inGuild.has(id))) throw new ServiceError(400, "Only clan members who have logged in to the site can be picked");
  return encodeMemberPicks(picks);
}

/**
 * Checks each answer against its question and returns it in its stored form. A choice has to be one of the options,
 * and Other (with its text) is only taken where the question allows it. `previous` is the signup's saved answers, if
 * any: what a player already has stays valid (the form keeps showing it until they untick it) even once the Admin
 * has edited the options or turned Other off. A multiple-choice answer is stored as a cleaned JSON list (trimmed, no
 * blanks or repeats); text and yes/no answers are stored as given.
 */
function normalizeAnswers<T extends { questionId: string; value: string }>(db: Db, answererUserId: string, questions: AnsweredQuestion[], answers: T[], previous: ReadonlyMap<string, string> = new Map()): T[] {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  return answers.map((a) => {
    const question = questionById.get(a.questionId);
    if (question?.type === "member") return { ...a, value: normalizeMemberPicks(db, question, a.value, answererUserId, previous.get(a.questionId)) };
    if (!question || !isChoiceType(question.type)) return a;
    const multiple = question.type === "multiselect";
    const text = typeof a.value === "string" ? a.value.trim() : "";
    if (!text) return { ...a, value: multiple ? "[]" : "" };

    let choices: string[];
    let other: string | null;
    if (multiple) {
      let items: unknown = null;
      try {
        items = JSON.parse(text);
      } catch {
        // not a list: refused below
      }
      const others = Array.isArray(items) ? items.filter((c) => typeof c !== "string") : [];
      if (!Array.isArray(items) || others.length > 1 || others.some((c) => otherText(c) === null)) {
        throw new ServiceError(400, "A multiple-choice answer must be a list of choices");
      }
      choices = [...new Set((items.filter((c) => typeof c === "string") as string[]).map((c) => c.trim()).filter(Boolean))];
      other = others.length ? otherText(others[0]) : null;
      if (choices.length > MAX_MULTISELECT_CHOICES || choices.some((c) => c.length > MAX_CHOICE_LENGTH)) throw new ServiceError(400, "Too many choices, or a choice is too long");
    } else {
      other = otherText(text);
      choices = other === null ? [text] : [];
    }

    const before = parseChoiceAnswer(previous.get(a.questionId));
    const kept = new Set([...optionsOf(question.optionsJson), ...before.choices, ...(multiple ? [] : [(previous.get(a.questionId) ?? "").trim()])]);
    const stray = choices.find((c) => !kept.has(c));
    if (stray !== undefined) throw new ServiceError(400, `"${stray}" isn't one of the options`);

    if (other !== null) {
      other = other.trim();
      if (!question.allowOther && other !== (before.other ?? "").trim()) throw new ServiceError(400, "This question doesn't take an Other answer");
      if (!other) throw new ServiceError(400, "Write something for Other, or untick it");
      if (other.length > MAX_OTHER_LENGTH) throw new ServiceError(400, `Other can be at most ${MAX_OTHER_LENGTH} characters`);
    }

    const value = multiple ? encodeChoices(choices, other) : other !== null ? JSON.stringify({ other }) : choices[0]!;
    return { ...a, value };
  });
}

/** A signup's saved answers by question, the `previous` normalizeAnswers keeps valid. */
function savedAnswers(db: Db, signupId: string | undefined): Map<string, string> {
  if (!signupId) return new Map();
  return new Map(db.select().from(signupAnswers).where(eq(signupAnswers.signupId, signupId)).all().map((a) => [a.questionId, a.value]));
}

export function createSignup(db: Db, bingo: Bingo, params: CreateSignupParams) {
  assertSignupOpen(bingo);
  if (!params.rsn.trim()) throw new ServiceError(400, "RSN is required");

  return db.transaction((tx) => {
    const existing = tx.select().from(signups).where(and(eq(signups.bingoId, params.bingoId), eq(signups.userId, params.userId))).get();
    if (existing?.status === "active") throw new ServiceError(409, "You've already signed up for this bingo");

    const questions = tx.select().from(signupQuestions).where(eq(signupQuestions.bingoId, params.bingoId)).all();
    const answers = normalizeAnswers(tx, params.userId, questions, params.answers, savedAnswers(tx, existing?.id));
    const answerById = new Map(answers.map((a) => [a.questionId, a.value]));
    const missingRequired = questions.some((q) => q.required && isBlankAnswer(q.type, answerById.get(q.id)));
    if (missingRequired) throw new ServiceError(400, "Please answer every required question");

    const values = {
      rsn: params.rsn.trim(),
      timezone: params.timezone ? normalizeTimeZone(params.timezone) : null,
      womId: params.womId ?? null,
      rsnVerified: params.rsnVerified ?? false,
    };
    // A withdrawn signup is reused rather than duplicated: (bingo, user) is
    // unique. The buy-in columns are left alone on purpose — someone who
    // withdraws and re-signs up (the common case: a mistake, a change of
    // mind) already paid, and that shouldn't have to be re-collected or
    // re-recorded. calculatePotTotal only counts active signups, so a
    // withdrawn row's buy-in never counts towards the pot until it is active
    // again, and a mod can still unmark it by hand if the GP was refunded.
    if (existing) {
      tx.delete(signupAnswers).where(eq(signupAnswers.signupId, existing.id)).run();
      tx.update(signups)
        .set({ ...values, status: "active", createdAt: clockNow() })
        .where(eq(signups.id, existing.id))
        .run();
    }
    const signup = existing
      ? tx.select(PUBLIC_SIGNUP_COLS).from(signups).where(eq(signups.id, existing.id)).get()!
      : tx.insert(signups).values({ bingoId: params.bingoId, userId: params.userId, ...values, createdAt: clockNow() }).returning(PUBLIC_SIGNUP_COLS).get();
    for (const a of answers) {
      tx.insert(signupAnswers).values({ signupId: signup.id, questionId: a.questionId, value: a.value }).run();
    }
    audit(tx, {
      action: "signup.created",
      bingoId: params.bingoId,
      entity: { type: "signup", id: signup.id, label: signup.rsn },
      details: { rsn: signup.rsn, rsnVerified: signup.rsnVerified, answerCount: params.answers.length, reactivated: !!existing },
    });
    return signup;
  });
}

export interface CreateLateSignupParams {
  userId: string;
  rsn: string;
  /** The Team they join: required from the Draft on, and refused while Signups are closed (they go into the pool). */
  teamId?: string | null;
  // Route-computed from tectonic-api, never client-trusted (as CreateSignupParams).
  womId?: string | null;
  rsnVerified?: boolean;
}

const LATE_SIGNUP_STAGES: Bingo["stage"][] = ["captains", "draft", "reveal", "live"];

/**
 * A Late signup (CONTEXT.md "Signup"): an Admin signs a clan member up on their behalf, from Signups closed until the
 * Bingo is Finished. While Signups are closed they go into the draft pool; from the Draft on they go straight onto the
 * Team given, outside the pick order (not a pick, so the Shares and who's Cut don't change). It's a real Signup: an
 * RSN, a buy-in to collect, the signup questions unanswered. A Withdrawn Signup is reactivated with its answers; an
 * active one is refused (Add member is for that). Joins as a single in a duo bingo.
 */
export function createLateSignup(db: Db, bingo: Bingo, params: CreateLateSignupParams) {
  if (bingo.stage === "complete") throw new ServiceError(400, "This bingo is finished, so its Teams and signups are locked. Move it back to Live to change them.", "bingo_finished");
  if (!LATE_SIGNUP_STAGES.includes(bingo.stage)) throw new ServiceError(400, "A late signup can only be added once signups have closed");
  const rsn = params.rsn.trim();
  if (!rsn) throw new ServiceError(400, "RSN is required");
  const needsTeam = bingo.stage !== "captains";
  if (needsTeam && !params.teamId) throw new ServiceError(400, "Pick the Team they join");
  if (!needsTeam && params.teamId) throw new ServiceError(400, "Until the Draft begins a late signup goes into the draft pool, not onto a Team");

  return db.transaction((tx) => {
    const user = tx.select({ id: users.id }).from(users).where(eq(users.id, params.userId)).get();
    if (!user) throw new ServiceError(404, "User not found");
    const team = params.teamId ? tx.select({ id: teams.id, bingoId: teams.bingoId, name: teams.name }).from(teams).where(eq(teams.id, params.teamId)).get() : undefined;
    if (params.teamId && (!team || team.bingoId !== bingo.id)) throw new ServiceError(404, "Team not found");
    const onATeam = tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(eq(teams.bingoId, bingo.id), eq(teamMembers.userId, params.userId)))
      .get();
    if (onATeam) throw new ServiceError(409, "This player is already on a Team in this bingo");
    const existing = tx.select().from(signups).where(and(eq(signups.bingoId, bingo.id), eq(signups.userId, params.userId))).get();
    if (existing?.status === "active") {
      throw new ServiceError(409, "This player is already signed up. Put them on a Team with Add member on the Captains tab.", "already_signed_up");
    }

    const values = { rsn, womId: params.womId ?? null, rsnVerified: params.rsnVerified ?? false, status: "active" as const, createdAt: clockNow() };
    // A Withdrawn Signup comes back with its answers (and its buy-in, as createSignup keeps it).
    const signup = existing
      ? tx.update(signups).set(values).where(eq(signups.id, existing.id)).returning(PUBLIC_SIGNUP_COLS).get()!
      : tx.insert(signups).values({ bingoId: bingo.id, userId: params.userId, ...values }).returning(PUBLIC_SIGNUP_COLS).get();
    audit(tx, {
      action: "signup.created",
      bingoId: bingo.id,
      entity: { type: "signup", id: signup.id, label: signup.rsn },
      details: { rsn: signup.rsn, rsnVerified: signup.rsnVerified, answerCount: 0, reactivated: !!existing, late: true },
      onBehalfOfUserId: params.userId,
    });
    if (team) {
      tx.insert(teamMembers).values({ teamId: team.id, userId: params.userId, isCaptain: false, joinedAt: clockNow() }).run();
      const displayName = userLabelById(tx, params.userId, bingo.id);
      audit(tx, {
        action: "team.member_added",
        bingoId: bingo.id,
        entity: { type: "user", id: params.userId, label: displayName },
        teamId: team.id,
        details: { userId: params.userId, displayName: displayName ?? "Unknown" },
        onBehalfOfUserId: params.userId,
      });
    }
    return signup;
  });
}

export interface UpdateSignupParams {
  rsn?: string;
  timezone?: string;
  answers?: SignupAnswerInput[];
  // Same convention as CreateSignupParams: route-computed, never client-trusted.
  womId?: string | null;
  rsnVerified?: boolean;
}

export function updateSignup(db: Db, bingo: Bingo, signupId: string, params: UpdateSignupParams) {
  assertSignupOpen(bingo);
  return db.transaction((tx) => {
    const existing = tx.select().from(signups).where(eq(signups.id, signupId)).get();
    if (!existing) throw new ServiceError(404, "Signup not found");

    // Only what actually changed is written and recorded: saving the form untouched records nothing.
    let rsnChange: { before: string; after: string } | undefined;
    if (params.rsn !== undefined) {
      if (!params.rsn.trim()) throw new ServiceError(400, "RSN is required");
      const newRsn = params.rsn.trim();
      if (newRsn !== existing.rsn) rsnChange = { before: existing.rsn, after: newRsn };
      const womId = params.womId ?? null;
      const rsnVerified = params.rsnVerified ?? false;
      // The WOM id and verification are the server's, re-derived on every save: kept current, but not a change the
      // player made, so not one to record on their own.
      if (rsnChange || womId !== existing.womId || rsnVerified !== existing.rsnVerified) {
        tx.update(signups).set({ rsn: newRsn, womId, rsnVerified }).where(eq(signups.id, signupId)).run();
      }
    }

    // Before/after per changed answer, keyed by the question's prompt, as the audit log's details view shows them.
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    if (rsnChange) {
      before.RSN = rsnChange.before;
      after.RSN = rsnChange.after;
    }
    if (params.timezone !== undefined) {
      const timezone = normalizeTimeZone(params.timezone);
      if (timezone !== existing.timezone) {
        tx.update(signups).set({ timezone }).where(eq(signups.id, signupId)).run();
        before.Timezone = existing.timezone ?? "—";
        after.Timezone = timezone;
      }
    }
    const questions = tx.select().from(signupQuestions).where(eq(signupQuestions.bingoId, bingo.id)).all();
    const questionById = new Map(questions.map((q) => [q.id, q]));
    const shown = (type: SignupQuestionType, value: string) => formatSignupAnswer(type, type === "member" ? nameMemberPicks(tx, bingo.id, value) : value) || "—";
    for (const a of normalizeAnswers(tx, existing.userId, questions, params.answers ?? [], savedAnswers(tx, signupId))) {
      const existingAnswer = tx
        .select()
        .from(signupAnswers)
        .where(and(eq(signupAnswers.signupId, signupId), eq(signupAnswers.questionId, a.questionId)))
        .get();
      // No answer and a blank one are the same thing to the player.
      if ((existingAnswer?.value ?? "") === a.value) continue;
      if (existingAnswer) {
        tx.update(signupAnswers).set({ value: a.value }).where(eq(signupAnswers.id, existingAnswer.id)).run();
      } else {
        tx.insert(signupAnswers).values({ signupId, questionId: a.questionId, value: a.value }).run();
      }
      const question = questionById.get(a.questionId);
      if (question) {
        // The audit log is readable by every mod, so an admins-only answer is recorded as changed, not what to.
        const hidden = question.visibility === "admins";
        before[question.prompt] = hidden ? "(hidden)" : shown(question.type, existingAnswer?.value ?? "");
        after[question.prompt] = hidden ? "(hidden)" : shown(question.type, a.value);
      }
    }

    const updated = tx.select(PUBLIC_SIGNUP_COLS).from(signups).where(eq(signups.id, signupId)).get()!;
    if (Object.keys(after).length > 0) {
      audit(tx, {
        action: "signup.updated",
        bingoId: bingo.id,
        entity: { type: "signup", id: signupId, label: updated.rsn },
        details: { changes: { before, after } },
      });
    } else {
      markAuditedNoop();
    }
    return updated;
  });
}

// A mod setting (or clearing) a player's timezone from the roster — how signups from before timezone was asked get
// one without the player having to come back, and how a wrong one gets fixed. Unlike the player's own edit, not tied
// to the signup stage: it's reference info for the draft and the event, not something that changes the roster.
export function setSignupTimezone(db: Db, bingo: Bingo, signupId: string, timezone: string | null, actorUserId: string) {
  if (bingo.stage === "complete") throw new ServiceError(400, "This bingo is finished");
  const next = timezone === null ? null : normalizeTimeZone(timezone);
  return db.transaction((tx) => {
    const existing = tx.select().from(signups).where(and(eq(signups.id, signupId), eq(signups.bingoId, bingo.id))).get();
    if (!existing) throw new ServiceError(404, "Signup not found");
    if (existing.timezone === next) {
      markAuditedNoop();
      return tx.select(PUBLIC_SIGNUP_COLS).from(signups).where(eq(signups.id, signupId)).get()!;
    }
    const updated = tx.update(signups).set({ timezone: next }).where(eq(signups.id, signupId)).returning(PUBLIC_SIGNUP_COLS).get()!;
    audit(tx, {
      action: "signup.timezone_set",
      bingoId: bingo.id,
      entity: { type: "signup", id: signupId, label: existing.rsn },
      details: { before: existing.timezone, after: next },
      actor: { userId: actorUserId },
      onBehalfOfUserId: existing.userId,
    });
    return updated;
  });
}

// Players withdraw themselves only while signups are open; mods can also trim
// the roster during the captains stage, and during the Draft an undrafted
// signup (one not on a Team). A drafted Player waits for the Draft to end, when
// Remove from Team applies. A Finished bingo's signups are locked.
export function withdrawSignup(db: Db, bingo: Bingo, signupId: string, { byMod = false } = {}) {
  if (byMod) {
    if (bingo.stage === "complete") throw new ServiceError(400, "This bingo is finished, so its Teams and signups are locked. Move it back to Live to change them.", "bingo_finished");
    if (bingo.stage !== "signup" && bingo.stage !== "captains" && bingo.stage !== "draft") {
      throw new ServiceError(400, `Signups can't be withdrawn once the Draft is over — use Remove from Team on the Captains tab (current stage: ${bingo.stage})`);
    }
  } else {
    assertSignupOpen(bingo);
  }
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: signups.id, userId: signups.userId, rsn: signups.rsn, discordId: users.discordId })
      .from(signups)
      .innerJoin(users, eq(signups.userId, users.id))
      .where(and(eq(signups.id, signupId), eq(signups.bingoId, bingo.id)))
      .get();
    if (!existing) throw new ServiceError(404, "Signup not found");
    // Captains can be assigned during signups, so a lead may try to withdraw
    // while already heading a team; the team has to go first.
    const lead = tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(eq(teams.bingoId, bingo.id), eq(teamMembers.userId, existing.userId), or(eq(teamMembers.isCaptain, true), eq(teamMembers.isCoCaptain, true))))
      .get();
    if (lead) {
      throw new ServiceError(
        400,
        byMod
          ? "This player leads a team — remove or delete the team before withdrawing the signup"
          : "You lead a Team, so you can't withdraw yourself. Contact an admin if you need to.",
      );
    }
    if (bingo.stage === "draft") {
      const onATeam = tx
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(and(eq(teams.bingoId, bingo.id), eq(teamMembers.userId, existing.userId)))
        .get();
      if (onATeam) throw new ServiceError(400, "This player is on a Team, so they can't be withdrawn until the Draft ends");
    }
    dissolveForUser(tx, bingo.id, { id: existing.userId, discordId: existing.discordId });
    const updated = tx.update(signups).set({ status: "withdrawn" }).where(eq(signups.id, signupId)).returning(PUBLIC_SIGNUP_COLS).get();
    audit(tx, {
      action: "signup.withdrawn",
      bingoId: bingo.id,
      entity: { type: "signup", id: signupId, label: existing.rsn },
      details: { rsn: existing.rsn },
      onBehalfOfUserId: byMod ? existing.userId : null,
    });
    return updated;
  });
}

/** The whole roster. `viewer` limits which questions' answers come with it (see QuestionVisibility). */
export function getAllSignups(db: Db, bingoId: string, viewer: AnswerViewer = "admin") {
  const rows = db
    .select({ signup: PUBLIC_SIGNUP_COLS, user: PUBLIC_USER_COLS, ...SIGNUP_CA_COLS })
    .from(signups)
    .innerJoin(users, eq(signups.userId, users.id))
    .where(eq(signups.bingoId, bingoId))
    .orderBy(signups.createdAt)
    .all();
  const signupIds = rows.map((r) => r.signup.id);
  const answers = withMemberNames(db, bingoId, signupIds.length ? db.select().from(signupAnswers).where(inArray(signupAnswers.signupId, signupIds)).all() : []);
  const visible = visibleQuestionIds(db, bingoId, viewer);

  const collectorIds = [...new Set(rows.map((r) => r.signup.buyinCollectedByUserId).filter((id): id is string => !!id))];
  const collectors = collectorIds.length ? withRsn(db, bingoId, db.select(PUBLIC_USER_COLS).from(users).where(inArray(users.id, collectorIds)).all()) : [];
  const collectorById = new Map(collectors.map((u) => [u.id, u]));

  const pairingByUserId = new Map<string, (typeof schema.signupPairings.$inferSelect)>();
  for (const { pairing, userIds } of getAcceptedPairs(db, bingoId)) {
    for (const userId of userIds) pairingByUserId.set(userId, pairing);
  }
  const outgoingRequestByUserId = new Map(getPendingOutgoingPairs(db, bingoId).map((r) => [r.requesterUserId, { pairing: r.pairing, target: r.target }]));

  return rows.map((r) => {
    const womSummary = parseWomSummary(r.womDataJson ? JSON.parse(r.womDataJson) : null);
    return {
      signup: r.signup,
      user: { ...r.user, rsn: r.signup.rsn },
      answers: answers.filter((a) => a.signupId === r.signup.id && visible.has(a.questionId)),
      collectedByUser: r.signup.buyinCollectedByUserId ? (collectorById.get(r.signup.buyinCollectedByUserId) ?? null) : null,
      pairing: pairingByUserId.get(r.signup.userId) ?? null,
      outgoingPairingRequest: outgoingRequestByUserId.get(r.signup.userId) ?? null,
      caCurrent: parseStoredCaStats(r.caCurrentJson),
      caPeak: parseStoredCaStats(r.caPeakJson),
      womStats: womSummary ? { ehb: womSummary.ehb, ehp: womSummary.ehp } : null,
    };
  });
}

// Active (non-withdrawn) signups with buy-in marked received — the basis
// for bingoService.calculatePotTotal.
export function getPaidSignupCount(db: Db, bingoId: string): number {
  return db
    .select()
    .from(signups)
    .where(and(eq(signups.bingoId, bingoId), eq(signups.status, "active"), isNotNull(signups.buyinReceivedAt)))
    .all().length;
}

// Any row, withdrawn included — mirrors the signup-mode lock in
// bingoService.updateBingoSettings so the client can disable the control.
export function hasAnySignup(db: Db, bingoId: string): boolean {
  return db.select({ id: signups.id }).from(signups).where(eq(signups.bingoId, bingoId)).get() !== undefined;
}

const BUYIN_STAGES: Bingo["stage"][] = ["signup", "captains", "draft", "reveal"];

export interface MarkBuyinParams {
  received: boolean;
  collectedByUserId?: string | null;
  recordedByUserId: string;
}

export function markBuyin(db: Db, bingo: Bingo, signupId: string, params: MarkBuyinParams) {
  if (!BUYIN_STAGES.includes(bingo.stage)) {
    throw new ServiceError(400, `Buy-in can only be marked during signup, draft, or reveal (current stage: ${bingo.stage})`);
  }
  return db.transaction((tx) => {
    const existing = tx.select().from(signups).where(eq(signups.id, signupId)).get();
    if (!existing) throw new ServiceError(404, "Signup not found");
    const collectedByUserId = params.received ? (params.collectedByUserId ?? null) : null;
    const updated = tx
      .update(signups)
      .set({
        buyinReceivedAt: params.received ? clockNow() : null,
        buyinCollectedByUserId: collectedByUserId,
        buyinRecordedByUserId: params.received ? params.recordedByUserId : null,
      })
      .where(eq(signups.id, signupId))
      .returning(PUBLIC_SIGNUP_COLS)
      .get()!;
    audit(tx, {
      action: "signup.buyin_marked",
      bingoId: bingo.id,
      entity: { type: "signup", id: signupId, label: existing.rsn },
      details: {
        received: params.received,
        collectedByUserId,
        collectedByName: collectedByUserId ? (userLabelById(tx, collectedByUserId, bingo.id) ?? null) : null,
        before: { receivedAt: existing.buyinReceivedAt ? existing.buyinReceivedAt.toISOString() : null },
      },
      actor: { userId: params.recordedByUserId },
    });
    return updated;
  });
}
