import type { BugReport } from "@bingo/shared";
import { api } from "./client";

// Site-wide, not admin-scoped. Only clan Discord members can submit one — the same gate as signing up.
export function createBugReport(payload: { description: string; pageUrl: string | null; userAgent: string | null; palette: string | null }) {
  return api.post<{ bugReport: BugReport }>("/api/bug-reports", payload);
}
