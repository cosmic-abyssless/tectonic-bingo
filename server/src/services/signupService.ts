import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signupAnswers, signupQuestions, signups, users } from "../db/schema";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

// Every signup query whose result reaches a client response uses this
// column list — excludes womDataJson/runeProfileDataJson/statsFetchedAt,
// the raw external-API blobs playerStatsService.ts persists (the
// RuneProfile one alone can be 100KB+ per signup). Those are read directly
// by draftService's own query (see routes/bingos.ts's /:slug/draft, the one
// place that actually needs them) and written directly by
// playerStatsService.ts — signupService never touches them.
export const PUBLIC_SIGNUP_COLS = {
  id: signups.id,
  bingoId: signups.bingoId,
  userId: signups.userId,
  rsn: signups.rsn,
  womId: signups.womId,
  rsnVerified: signups.rsnVerified,
  status: signups.status,
  buyinReceivedAt: signups.buyinReceivedAt,
  buyinCollectedByUserId: signups.buyinCollectedByUserId,
  buyinRecordedByUserId: signups.buyinRecordedByUserId,
  createdAt: signups.createdAt,
};

export function getQuestions(db: Db, bingoId: string) {
  return db.select().from(signupQuestions).where(eq(signupQuestions.bingoId, bingoId)).orderBy(signupQuestions.sortOrder).all();
}

export interface CreateQuestionParams {
  bingoId: string;
  prompt: string;
  type: "text" | "textarea" | "select" | "boolean";
  optionsJson?: string | null;
  required?: boolean;
  sortOrder?: number;
}
export function createQuestion(db: Db, params: CreateQuestionParams) {
  if (params.type === "select" && !params.optionsJson) {
    throw new ServiceError(400, "optionsJson is required for a select question");
  }
  return db.insert(signupQuestions).values(params).returning().get();
}

export function updateQuestion(db: Db, id: string, params: Partial<Omit<CreateQuestionParams, "bingoId">>) {
  const existing = db.select().from(signupQuestions).where(eq(signupQuestions.id, id)).get();
  if (!existing) throw new ServiceError(404, "Question not found");
  return db.update(signupQuestions).set(params).where(eq(signupQuestions.id, id)).returning().get();
}

export function deleteQuestion(db: Db, id: string): void {
  db.delete(signupQuestions).where(eq(signupQuestions.id, id)).run();
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
  const signup = db.select(PUBLIC_SIGNUP_COLS).from(signups).where(and(eq(signups.bingoId, bingoId), eq(signups.userId, userId))).get();
  if (!signup) return null;
  const answers = db.select().from(signupAnswers).where(eq(signupAnswers.signupId, signup.id)).all();
  return { signup, answers };
}

export interface CreateSignupParams {
  bingoId: string;
  userId: string;
  rsn: string;
  answers: SignupAnswerInput[];
  // Set by the route handler after checking the submitted RSN against the
  // signer's tectonic-api RSNs. Never trust a client-sent verified claim.
  womId?: string | null;
  rsnVerified?: boolean;
}

export function createSignup(db: Db, bingo: Bingo, params: CreateSignupParams) {
  assertSignupOpen(bingo);
  if (!params.rsn.trim()) throw new ServiceError(400, "RSN is required");

  return db.transaction((tx) => {
    const existing = tx.select().from(signups).where(and(eq(signups.bingoId, params.bingoId), eq(signups.userId, params.userId))).get();
    if (existing) throw new ServiceError(409, "You've already signed up for this bingo");

    const questions = tx.select().from(signupQuestions).where(eq(signupQuestions.bingoId, params.bingoId)).all();
    const answeredIds = new Set(params.answers.map((a) => a.questionId));
    const missingRequired = questions.some((q) => q.required && !answeredIds.has(q.id));
    if (missingRequired) throw new ServiceError(400, "Please answer every required question");

    const signup = tx
      .insert(signups)
      .values({
        bingoId: params.bingoId,
        userId: params.userId,
        rsn: params.rsn.trim(),
        womId: params.womId ?? null,
        rsnVerified: params.rsnVerified ?? false,
      })
      .returning(PUBLIC_SIGNUP_COLS)
      .get();
    for (const a of params.answers) {
      tx.insert(signupAnswers).values({ signupId: signup.id, questionId: a.questionId, value: a.value }).run();
    }
    return signup;
  });
}

export interface UpdateSignupParams {
  rsn?: string;
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

    if (params.rsn !== undefined) {
      if (!params.rsn.trim()) throw new ServiceError(400, "RSN is required");
      tx.update(signups)
        .set({
          rsn: params.rsn.trim(),
          womId: params.womId ?? null,
          rsnVerified: params.rsnVerified ?? false,
        })
        .where(eq(signups.id, signupId))
        .run();
    }
    for (const a of params.answers ?? []) {
      const existingAnswer = tx
        .select()
        .from(signupAnswers)
        .where(and(eq(signupAnswers.signupId, signupId), eq(signupAnswers.questionId, a.questionId)))
        .get();
      if (existingAnswer) {
        tx.update(signupAnswers).set({ value: a.value }).where(eq(signupAnswers.id, existingAnswer.id)).run();
      } else {
        tx.insert(signupAnswers).values({ signupId, questionId: a.questionId, value: a.value }).run();
      }
    }
    return tx.select(PUBLIC_SIGNUP_COLS).from(signups).where(eq(signups.id, signupId)).get()!;
  });
}

export function withdrawSignup(db: Db, bingo: Bingo, signupId: string) {
  assertSignupOpen(bingo);
  const existing = db.select().from(signups).where(eq(signups.id, signupId)).get();
  if (!existing) throw new ServiceError(404, "Signup not found");
  return db.update(signups).set({ status: "withdrawn" }).where(eq(signups.id, signupId)).returning(PUBLIC_SIGNUP_COLS).get();
}

export function getAllSignups(db: Db, bingoId: string) {
  const rows = db
    .select({ signup: PUBLIC_SIGNUP_COLS, user: users })
    .from(signups)
    .innerJoin(users, eq(signups.userId, users.id))
    .where(eq(signups.bingoId, bingoId))
    .all();
  const signupIds = rows.map((r) => r.signup.id);
  const answers = signupIds.length ? db.select().from(signupAnswers).where(inArray(signupAnswers.signupId, signupIds)).all() : [];

  const collectorIds = [...new Set(rows.map((r) => r.signup.buyinCollectedByUserId).filter((id): id is string => !!id))];
  const collectors = collectorIds.length ? db.select().from(users).where(inArray(users.id, collectorIds)).all() : [];
  const collectorById = new Map(collectors.map((u) => [u.id, u]));

  return rows.map((r) => ({
    ...r,
    answers: answers.filter((a) => a.signupId === r.signup.id),
    collectedByUser: r.signup.buyinCollectedByUserId ? (collectorById.get(r.signup.buyinCollectedByUserId) ?? null) : null,
  }));
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
  const existing = db.select().from(signups).where(eq(signups.id, signupId)).get();
  if (!existing) throw new ServiceError(404, "Signup not found");
  return db
    .update(signups)
    .set({
      buyinReceivedAt: params.received ? new Date() : null,
      buyinCollectedByUserId: params.received ? (params.collectedByUserId ?? null) : null,
      buyinRecordedByUserId: params.received ? params.recordedByUserId : null,
    })
    .where(eq(signups.id, signupId))
    .returning(PUBLIC_SIGNUP_COLS)
    .get();
}
