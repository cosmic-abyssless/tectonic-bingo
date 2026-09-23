import { now as clockNow } from "../clock";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { formatSignupAnswer, isBlankAnswer, isValidTimeZone, MAX_CHOICE_LENGTH, MAX_MULTISELECT_CHOICES, MAX_QUESTION_HELPER_TEXT, type SignupQuestionType } from "@bingo/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signupAnswers, signupQuestions, signups, teamMembers, teams, users } from "../db/schema";
import { ServiceError } from "./errors";
import { dissolveForUser, getAcceptedPairs, getPendingOutgoingPairs } from "./pairingService";
import { audit, diffFields, markAuditedNoop } from "../audit/record";
import { userLabelById } from "../audit/describe";
import { rsnsInBingo } from "./playerNames";
import { parseStoredCaStats } from "./combatAchievements";
import { parseWomSummary } from "./womService";

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
  required?: boolean;
  sortOrder?: number;
}
/** Trims the helper text; blank (or absent) is none. */
function normalizeHelperText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ServiceError(400, "helperText must be text");
  const trimmed = value.trim();
  if (trimmed.length > MAX_QUESTION_HELPER_TEXT) throw new ServiceError(400, `Helper text can be at most ${MAX_QUESTION_HELPER_TEXT} characters`);
  return trimmed || null;
}

export function createQuestion(db: Db, params: CreateQuestionParams) {
  if ((params.type === "select" || params.type === "multiselect") && !params.optionsJson) {
    throw new ServiceError(400, "optionsJson is required for a choice question");
  }
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
    const set = "helperText" in params ? { ...params, helperText: normalizeHelperText(params.helperText) } : params;
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

export function deleteQuestion(db: Db, id: string): void {
  db.transaction((tx) => {
    const existing = tx.select().from(signupQuestions).where(eq(signupQuestions.id, id)).get();
    tx.delete(signupQuestions).where(eq(signupQuestions.id, id)).run();
    if (existing) {
      audit(tx, {
        action: "question.deleted",
        bingoId: existing.bingoId,
        entity: { type: "question", id, label: existing.prompt },
        details: { prompt: existing.prompt, type: existing.type, required: existing.required },
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
  const answers = db.select().from(signupAnswers).where(eq(signupAnswers.signupId, signup.id)).all();
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

/**
 * Checks each answer against its question. A multiple-choice answer has to be a list of choices; it is stored as a
 * cleaned JSON list (trimmed, no blanks or repeats). Answers to other questions are stored as given.
 */
function normalizeAnswers<T extends { questionId: string; value: string }>(questions: { id: string; type: SignupQuestionType }[], answers: T[]): T[] {
  const typeById = new Map(questions.map((q) => [q.id, q.type]));
  return answers.map((a) => {
    if (typeById.get(a.questionId) !== "multiselect") return a;
    let choices: unknown = [];
    if (typeof a.value === "string" && a.value.trim() !== "") {
      try {
        choices = JSON.parse(a.value);
      } catch {
        choices = null;
      }
    }
    if (!Array.isArray(choices) || choices.some((c) => typeof c !== "string")) throw new ServiceError(400, "A multiple-choice answer must be a list of choices");
    const cleaned = [...new Set((choices as string[]).map((c) => c.trim()).filter(Boolean))];
    if (cleaned.length > MAX_MULTISELECT_CHOICES || cleaned.some((c) => c.length > MAX_CHOICE_LENGTH)) throw new ServiceError(400, "Too many choices, or a choice is too long");
    return { ...a, value: JSON.stringify(cleaned) };
  });
}

export function createSignup(db: Db, bingo: Bingo, params: CreateSignupParams) {
  assertSignupOpen(bingo);
  if (!params.rsn.trim()) throw new ServiceError(400, "RSN is required");

  return db.transaction((tx) => {
    const existing = tx.select().from(signups).where(and(eq(signups.bingoId, params.bingoId), eq(signups.userId, params.userId))).get();
    if (existing?.status === "active") throw new ServiceError(409, "You've already signed up for this bingo");

    const questions = tx.select().from(signupQuestions).where(eq(signupQuestions.bingoId, params.bingoId)).all();
    const answers = normalizeAnswers(questions, params.answers);
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
    const shown = (type: SignupQuestionType, value: string) => formatSignupAnswer(type, value) || "—";
    for (const a of normalizeAnswers(questions, params.answers ?? [])) {
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
        before[question.prompt] = shown(question.type, existingAnswer?.value ?? "");
        after[question.prompt] = shown(question.type, a.value);
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
// the roster during the captains stage, right up until the draft begins.
export function withdrawSignup(db: Db, bingo: Bingo, signupId: string, { byMod = false } = {}) {
  if (byMod) {
    if (bingo.stage !== "signup" && bingo.stage !== "captains") {
      throw new ServiceError(400, `Signups can't be removed once the draft has started (current stage: ${bingo.stage})`);
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
    if (lead) throw new ServiceError(400, "This player leads a team — remove or delete the team before withdrawing the signup");
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

export function getAllSignups(db: Db, bingoId: string) {
  const rows = db
    .select({ signup: PUBLIC_SIGNUP_COLS, user: users, ...SIGNUP_CA_COLS })
    .from(signups)
    .innerJoin(users, eq(signups.userId, users.id))
    .where(eq(signups.bingoId, bingoId))
    .orderBy(signups.createdAt)
    .all();
  const signupIds = rows.map((r) => r.signup.id);
  const answers = signupIds.length ? db.select().from(signupAnswers).where(inArray(signupAnswers.signupId, signupIds)).all() : [];

  const collectorIds = [...new Set(rows.map((r) => r.signup.buyinCollectedByUserId).filter((id): id is string => !!id))];
  const collectors = collectorIds.length ? db.select().from(users).where(inArray(users.id, collectorIds)).all() : [];
  const collectorRsns = rsnsInBingo(db, bingoId, collectorIds);
  const collectorById = new Map(collectors.map((u) => [u.id, { ...u, rsn: collectorRsns.get(u.id) ?? null }]));

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
      answers: answers.filter((a) => a.signupId === r.signup.id),
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
