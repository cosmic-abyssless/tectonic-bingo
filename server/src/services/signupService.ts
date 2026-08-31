import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signupQuestions } from "../db/schema";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;

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
