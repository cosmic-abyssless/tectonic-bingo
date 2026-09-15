import type { BugReport } from "@bingo/shared";
import { api } from "./client";

// Site-wide, not admin-scoped — every logged-in user can submit one.
export function createBugReport(payload: { description: string; pageUrl: string | null; userAgent: string | null }) {
  return api.post<{ bugReport: BugReport }>("/api/bug-reports", payload);
}
