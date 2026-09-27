import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppliedCutChange, ApplyCutReviewResponse, AuditLogFilters, AuditLogResponse, CutChange, ScoreCutReviewResponse } from "@bingo/shared";
import { useDebouncedValue } from "../headless/useDebouncedValue";
import { api } from "./client";
import { auditLogQueryString, queryKeys } from "./queries";
import * as adminApi from "./adminApi";

export const adminQueryKeys = {
  mods: (slug: string) => ["adminMods", slug] as const,
  lines: (slug: string) => ["adminLines", slug] as const,
  questions: (slug: string) => ["adminQuestions", slug] as const,
  userSearch: (scope: string, q: string) => ["adminUserSearch", scope, q] as const,
  captainCandidates: (slug: string) => ["adminCaptainCandidates", slug] as const,
  itemGroups: ["adminItemGroups"] as const,
  pastWomCompetitions: ["adminPastWomCompetitions"] as const,
  pieceValues: ["adminPieceValues"] as const,
  titleSettings: ["adminTitleSettings"] as const,
  bugReports: ["adminBugReports"] as const,
  siteAuditLog: (bingoScope: string | null | "all", filters: AuditLogFilters) => ["siteAuditLog", bingoScope, filters] as const,
  achievementSettings: (slug: string) => ["adminAchievements", slug] as const,
};

// The site-wide audit log — every bingo, or just site-level entries
// (bingoScope: null), or one specific bingo (bingoScope: its id).
export function useSiteAuditLog(bingoScope: string | null | "all", filters: AuditLogFilters = {}) {
  return useInfiniteQuery({
    queryKey: adminQueryKeys.siteAuditLog(bingoScope, filters),
    queryFn: ({ pageParam }) => {
      const qs = auditLogQueryString(filters, pageParam);
      if (bingoScope === "all") return api.get<AuditLogResponse>(`/api/admin/audit-log${qs}`);
      const bingoParam = `bingoId=${bingoScope === null ? "null" : bingoScope}`;
      return api.get<AuditLogResponse>(`/api/admin/audit-log${qs}${qs ? "&" : "?"}${bingoParam}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useItemGroups() {
  return useQuery({ queryKey: adminQueryKeys.itemGroups, queryFn: () => adminApi.getItemGroups() });
}

export function usePieceValues() {
  return useQuery({ queryKey: adminQueryKeys.pieceValues, queryFn: () => adminApi.getPieceValues() });
}

export function useTitleSettings() {
  return useQuery({ queryKey: adminQueryKeys.titleSettings, queryFn: () => adminApi.getTitleSettings() });
}

export function usePastWomCompetitions() {
  return useQuery({ queryKey: adminQueryKeys.pastWomCompetitions, queryFn: () => adminApi.getPastWomCompetitions() });
}

/** Every bug report (site admins only: pass `enabled: false` for anyone else, or the request is refused). */
export function useBugReports(enabled = true) {
  return useQuery({ queryKey: adminQueryKeys.bugReports, queryFn: () => adminApi.getBugReports(), enabled });
}

export function useMods(slug: string) {
  return useQuery({ queryKey: adminQueryKeys.mods(slug), queryFn: () => adminApi.getMods(slug) });
}

export function useLines(slug: string) {
  return useQuery({ queryKey: adminQueryKeys.lines(slug), queryFn: () => adminApi.getLines(slug) });
}

export function useQuestions(slug: string) {
  return useQuery({ queryKey: adminQueryKeys.questions(slug), queryFn: () => adminApi.getQuestions(slug) });
}

export function useCaptainCandidates(slug: string) {
  return useQuery({ queryKey: adminQueryKeys.captainCandidates(slug), queryFn: () => adminApi.getCaptainCandidates(slug) });
}

/** The Achievements settings section's per-catalogue-entry switch state (CONTEXT.md "Achievement"). */
export function useAchievementSettings(slug: string) {
  return useQuery({ queryKey: adminQueryKeys.achievementSettings(slug), queryFn: () => adminApi.getAchievementSettings(slug) });
}

// scope is either a bingo slug (search within that bingo's admin routes) or
// "site" (site-admin-level search, e.g. granting site admin).
export function useUserSearch(scope: string, q: string) {
  return useQuery({
    queryKey: adminQueryKeys.userSearch(scope, q),
    queryFn: () => (scope === "site" ? adminApi.searchAllUsers(q) : adminApi.searchBingoUsers(scope, q)),
    enabled: q.trim().length > 0,
  });
}

/**
 * How many players an edited Cut review plan leaves cut (POST /admin/cut-review/score), for the modal's live count.
 * Keyed by the change list and debounced, so a run of edits scores once; the last count stays up while the next
 * one loads. An invalid change comes back as the query's error.
 */
export function useCutReviewScore(slug: string, changes: CutChange[], enabled: boolean) {
  const latestJson = JSON.stringify(changes);
  const changesJson = useDebouncedValue(latestJson, 250);
  const query = useQuery({
    queryKey: queryKeys.cutReviewScore(slug, changesJson),
    queryFn: () => api.post<ScoreCutReviewResponse>(`/api/bingos/${slug}/admin/cut-review/score`, { changes: JSON.parse(changesJson) as CutChange[] }),
    // Only once the edits have settled: not for whatever list the debounce still holds from before.
    enabled: enabled && latestJson === changesJson,
    retry: false,
    placeholderData: keepPreviousData,
  });
  // `updating`: the count on show isn't for the latest edit yet (still debouncing, or its request is in flight).
  return { query, updating: enabled && (latestJson !== changesJson || query.isFetching || query.isPlaceholderData) };
}

/** Applies a Cut review (POST /admin/cut-review/apply): pairings, splits and a Team change, all at once. */
export function useApplyCutReview(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: AppliedCutChange[]) => api.post<ApplyCutReviewResponse>(`/api/bingos/${slug}/admin/cut-review/apply`, { changes }),
    // Settled, not just success: a rejected plan means the roster moved underneath it, so the plan is refetched either
    // way. The roster's key covers the cuts and the review itself; Teams live on the bingo shell. Scores of edited
    // plans are dropped rather than refetched: they're for the old roster, where they may no longer be valid changes.
    onSettled: () => {
      queryClient.removeQueries({ queryKey: [...queryKeys.cutReview(slug), "score"] });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug), predicate: (q) => q.queryKey[3] !== "score" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.unpairedSignups(slug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.partnerCandidates(slug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.myPairing(slug) }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.captainCandidates(slug) }),
      ]);
    },
  });
}
