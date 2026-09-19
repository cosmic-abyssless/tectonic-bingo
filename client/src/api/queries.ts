import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AuditLogFilters, AuditLogResponse, BingoListResponse, BingoModerator, BingoShellResponse, BoardResponse, CreatePointAdjustmentResponse, CreateSubmissionResponse, DraftState,
  MinimalUser, ModSubmissionsResponse, MyPairingResponse, MySignupResponse, MyTectonicRsnsResponse, PartnerCandidatesResponse, PendingCountResponse,
  ReviewSubmissionResponse, RosterResponse, ScreenshotAnalysis, Signup, SignupAnswerInput, SignupPairing, SignupQuestion, Stage,
  PickRating, PlayerProfile, StatsResponse, Team, TeamProgressSummary, TeamSubmissionsResponse,
} from "@bingo/shared";
import { useAuth } from "../context/AuthContext";
import { api } from "./client";
import { readBoardCache, writeBoardCache } from "./boardCache";
import { optimisticUpdate } from "./optimistic";

// Centralized so WebSocketProvider can invalidate the same keys queries use.
export const queryKeys = {
  bingos: () => ["bingos"] as const,
  bingo: (slug: string) => ["bingo", slug] as const,
  board: (slug: string) => ["board", slug] as const,
  teamProgress: (slug: string, teamId: string) => ["teamProgress", slug, teamId] as const,
  teamSubmissions: (slug: string, teamId: string) => ["teamSubmissions", slug, teamId] as const,
  modSubmissions: (slug: string) => ["modSubmissions", slug] as const,
  pendingCount: (slug: string) => ["pendingCount", slug] as const,
  signupRoster: (slug: string) => ["signupRoster", slug] as const,
  bingoMods: (slug: string) => ["bingoMods", slug] as const,
  signupQuestions: (slug: string) => ["signupQuestions", slug] as const,
  mySignup: (slug: string) => ["mySignup", slug] as const,
  myTectonicRsns: (slug: string) => ["myTectonicRsns", slug] as const,
  myPairing: (slug: string) => ["myPairing", slug] as const,
  partnerCandidates: (slug: string) => ["partnerCandidates", slug] as const,
  draftState: (slug: string) => ["draftState", slug] as const,
  playerProfile: (slug: string, userId: string) => ["playerProfile", slug, userId] as const,
  stats: (slug: string) => ["stats", slug] as const,
  auditLog: (slug: string, filters: AuditLogFilters) => ["auditLog", slug, filters] as const,
  teamActivity: (slug: string, teamId: string) => ["teamActivity", slug, teamId] as const,
};

export function useBingos() {
  return useQuery({
    queryKey: queryKeys.bingos(),
    queryFn: () => api.get<BingoListResponse>("/api/bingos"),
  });
}

// The page-load queries — the bingo shell, and the viewed team's progress and
// submissions — are persisted per user alongside the board (same store, keyed by
// `<slug>:<part>`), so a reload paints the whole page from storage and revalidates
// behind it instead of showing "Loading…", then a board with nothing done. As with
// the board, stored data is marked stale (initialDataUpdatedAt: 0), so it always
// refetches, and every fresh response is stored again.
function persistedPart<T>(userId: string | undefined, slug: string | undefined, part: string) {
  const key = slug ? `${slug}:${part}` : undefined;
  return {
    initialData: () => (userId && key ? readBoardCache<T>(userId, key, __BUILD_ID__) : undefined),
    initialDataUpdatedAt: 0,
    save: (data: T) => {
      if (userId && key) writeBoardCache(userId, key, __BUILD_ID__, data);
      return data;
    },
  };
}

export function useBingo(slug: string | undefined) {
  const persisted = persistedPart<BingoShellResponse>(useAuth().user?.id, slug, "shell");
  return useQuery({
    queryKey: queryKeys.bingo(slug ?? ""),
    queryFn: async () => persisted.save(await api.get<BingoShellResponse>(`/api/bingos/${slug}`)),
    enabled: !!slug,
    initialData: persisted.initialData,
    initialDataUpdatedAt: persisted.initialDataUpdatedAt,
  });
}

// The board structure is persisted per user (see boardCache.ts): a stored copy
// is the query's initial data, so the grid paints immediately on load, but it is
// marked stale (initialDataUpdatedAt: 0) so it always revalidates — a cheap 304
// when nothing changed — and every fresh response is stored again.
export function useBoard(slug: string | undefined) {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: queryKeys.board(slug ?? ""),
    queryFn: async () => {
      const board = await api.get<BoardResponse>(`/api/bingos/${slug}/board`);
      if (userId && slug) writeBoardCache(userId, slug, __BUILD_ID__, board);
      return board;
    },
    enabled: !!slug,
    initialData: () => (userId && slug ? readBoardCache<BoardResponse>(userId, slug, __BUILD_ID__) : undefined),
    initialDataUpdatedAt: 0,
  });
}

export function useTeamProgress(slug: string | undefined, teamId: string | undefined) {
  const persisted = persistedPart<TeamProgressSummary>(useAuth().user?.id, teamId ? slug : undefined, `progress:${teamId}`);
  return useQuery({
    queryKey: queryKeys.teamProgress(slug ?? "", teamId ?? ""),
    queryFn: async () => persisted.save(await api.get<TeamProgressSummary>(`/api/bingos/${slug}/teams/${teamId}/progress`)),
    enabled: !!slug && !!teamId,
    initialData: persisted.initialData,
    initialDataUpdatedAt: persisted.initialDataUpdatedAt,
  });
}

// Raising a hand should feel instant, so the viewer's own interest lands in the
// cached team progress before the server confirms it. Only the acting user's
// team is ever affected, so the caller passes that team id. Interest is per
// task (a tile "part"), so the same user can be on several parts of one tile.
export function useSetTileInterest(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, tileId, taskId, user, interested }: { teamId: string; tileId: string; taskId: string; user: MinimalUser; interested: boolean }) =>
      optimisticUpdate<TeamProgressSummary>(
        queryClient,
        queryKeys.teamProgress(slug, teamId),
        (prev) => ({
          ...prev,
          interests: [...prev.interests.filter((i) => !(i.taskId === taskId && i.user.id === user.id)), ...(interested ? [{ tileId, taskId, user, createdAt: new Date().toISOString() }] : [])],
        }),
        () => api.put<TeamProgressSummary>(`/api/bingos/${slug}/tiles/${tileId}/tasks/${taskId}/interest`, { interested }),
      ),
  });
}

export function useTeamSubmissions(slug: string | undefined, teamId: string | undefined) {
  const persisted = persistedPart<TeamSubmissionsResponse>(useAuth().user?.id, teamId ? slug : undefined, `submissions:${teamId}`);
  return useQuery({
    queryKey: queryKeys.teamSubmissions(slug ?? "", teamId ?? ""),
    queryFn: async () => persisted.save(await api.get<TeamSubmissionsResponse>(`/api/bingos/${slug}/teams/${teamId}/submissions`)),
    enabled: !!slug && !!teamId,
    initialData: persisted.initialData,
    initialDataUpdatedAt: persisted.initialDataUpdatedAt,
  });
}

export function useModSubmissions(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.modSubmissions(slug ?? ""),
    queryFn: () => api.get<ModSubmissionsResponse>(`/api/bingos/${slug}/mod/submissions`),
    enabled: !!slug,
  });
}

export function usePendingCount(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.pendingCount(slug ?? ""),
    queryFn: () => api.get<PendingCountResponse>(`/api/bingos/${slug}/mod/pending-count`),
    enabled: !!slug && enabled,
  });
}

export function useCreateSubmission(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.postForm<CreateSubmissionResponse>(`/api/bingos/${slug}/submissions`, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamProgress", slug] });
      queryClient.invalidateQueries({ queryKey: ["teamSubmissions", slug] });
    },
  });
}

export function useAnalyzeScreenshot(slug: string) {
  return useMutation({
    mutationFn: (formData: FormData) => api.postForm<ScreenshotAnalysis>(`/api/bingos/${slug}/submissions/analyze`, formData),
  });
}

export function useReviewSubmission(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { submissionId: string; action: "approve" | "reject" | "undo"; reviewerNotes?: string }) =>
      api.patch<ReviewSubmissionResponse>(`/api/bingos/${slug}/mod/submissions/${params.submissionId}`, {
        action: params.action,
        reviewerNotes: params.reviewerNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.modSubmissions(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingCount(slug) });
      queryClient.invalidateQueries({ queryKey: ["teamProgress", slug] });
      queryClient.invalidateQueries({ queryKey: ["teamSubmissions", slug] });
    },
  });
}

// The only way to hand out points outside the node graph now that approval
// no longer takes a per-submission points override — e.g. correcting a
// mistake, or a bonus/penalty with no node behind it.
export function useCreatePointAdjustment(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { teamId: string; amount: number; reason: string }) =>
      api.post<CreatePointAdjustmentResponse>(`/api/bingos/${slug}/mod/teams/${params.teamId}/adjustments`, { amount: params.amount, reason: params.reason }),
    onSuccess: (_data, params) => queryClient.invalidateQueries({ queryKey: queryKeys.teamProgress(slug, params.teamId) }),
  });
}

export function useSignupRoster(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.signupRoster(slug ?? ""),
    queryFn: () => api.get<RosterResponse>(`/api/bingos/${slug}/mod/signups`),
    enabled: !!slug,
  });
}

export function useBingoMods(slug: string) {
  return useQuery({
    queryKey: queryKeys.bingoMods(slug),
    queryFn: () => api.get<{ mods: BingoModerator[] }>(`/api/bingos/${slug}/mod/moderators`),
  });
}

export function useMarkBuyin(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { signupId: string; received: boolean; collectedByUserId?: string | null }) =>
      api.patch<{ signup: Signup }>(`/api/bingos/${slug}/mod/signups/${params.signupId}/buyin`, {
        received: params.received,
        collectedByUserId: params.collectedByUserId,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
  });
}

export function useModWithdrawSignup(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signupId: string) => api.delete<{ signup: Signup }>(`/api/bingos/${slug}/mod/signups/${signupId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
  });
}

// Dev-only — the server route only exists at all outside production with
// DEV_LOGIN_ENABLED set, matching AuthContext's devMode flag.
export interface SeedTestSignupsResponse {
  signups: Signup[];
  // Whether the seeded rows were drawn from the real clan roster, made up,
  // or both (roster ran out part-way).
  source: "tectonic" | "synthetic" | "mixed";
  tectonicConfigured: boolean;
}

export function useSeedTestSignups(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (count: number) => api.post<SeedTestSignupsResponse>(`/api/bingos/${slug}/mod/dev/seed-signups`, { count }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
  });
}

export function useDeleteAllSignups(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ deleted: number }>(`/api/bingos/${slug}/mod/dev/signups`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
  });
}

export function useSignupQuestions(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.signupQuestions(slug ?? ""),
    queryFn: () => api.get<{ questions: SignupQuestion[] }>(`/api/bingos/${slug}/signup/questions`),
    enabled: !!slug,
  });
}

export function useMySignup(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mySignup(slug ?? ""),
    queryFn: () => api.get<MySignupResponse>(`/api/bingos/${slug}/signup`),
    enabled: !!slug,
  });
}

// Empty array when the tectonic-api integration is off or the signer isn't
// a registered clan member there — the signup form falls back to free text.
export function useMyTectonicRsns(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.myTectonicRsns(slug ?? ""),
    queryFn: () => api.get<MyTectonicRsnsResponse>(`/api/bingos/${slug}/signup/rsns`),
    enabled: !!slug,
  });
}

export function useCreateSignup(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { rsn: string; answers: SignupAnswerInput[] }) => api.post<{ signup: Signup }>(`/api/bingos/${slug}/signup`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.mySignup(slug) }),
  });
}

export function useUpdateSignup(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { rsn?: string; answers?: SignupAnswerInput[] }) => api.patch<{ signup: Signup }>(`/api/bingos/${slug}/signup`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.mySignup(slug) }),
  });
}

export function useWithdrawSignup(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ signup: Signup }>(`/api/bingos/${slug}/signup`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mySignup(slug) });
      // Withdrawing dissolves any duo pairing.
      queryClient.invalidateQueries({ queryKey: queryKeys.myPairing(slug) });
    },
  });
}

// Duo mode only. Both queries stay disabled in solo mode so the extra
// requests never fire.
export function useMyPairing(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.myPairing(slug ?? ""),
    queryFn: () => api.get<MyPairingResponse>(`/api/bingos/${slug}/signup/pairing`),
    enabled: !!slug && enabled,
  });
}

export function usePartnerCandidates(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.partnerCandidates(slug ?? ""),
    queryFn: () => api.get<PartnerCandidatesResponse>(`/api/bingos/${slug}/signup/partners`),
    enabled: !!slug && enabled,
  });
}

function usePairingMutation<TVars>(slug: string, mutationFn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.myPairing(slug) }),
  });
}

export function useRequestPairing(slug: string) {
  return usePairingMutation(slug, (targetDiscordId: string) => api.post<{ pairing: SignupPairing }>(`/api/bingos/${slug}/signup/pairing`, { targetDiscordId }));
}

export function useCancelPairingRequest(slug: string) {
  return usePairingMutation(slug, (pairingId: string) => api.delete<void>(`/api/bingos/${slug}/signup/pairing/${pairingId}`));
}

export function useRespondToPairing(slug: string) {
  return usePairingMutation(slug, (params: { pairingId: string; accept: boolean }) =>
    api.post<{ pairing: SignupPairing }>(`/api/bingos/${slug}/signup/pairing/${params.pairingId}/respond`, { accept: params.accept }),
  );
}

export function useModPair(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { userIdA: string; userIdB: string }) => api.post<{ pairing: SignupPairing }>(`/api/bingos/${slug}/mod/pairings`, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
  });
}

export function useModUnpair(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pairingId: string) => api.delete<void>(`/api/bingos/${slug}/mod/pairings/${pairingId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
  });
}

export function useDraftState(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.draftState(slug ?? ""),
    queryFn: () => api.get<DraftState>(`/api/bingos/${slug}/draft`),
    enabled: !!slug,
  });
}

export function useShuffleDraftOrder(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ teams: Team[]; lockedUntil: string }>(`/api/bingos/${slug}/mod/draft/shuffle`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) }),
  });
}

export function useSetDraftOrder(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamIds: string[]) => api.put<{ teams: Team[] }>(`/api/bingos/${slug}/mod/draft/order`, { teamIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) }),
  });
}

export function useStartDraft(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ teams: Team[] }>(`/api/bingos/${slug}/mod/draft/start`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
    },
  });
}

export function useMakePick(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.post<{ picks: { id: string; pickNumber: number; teamId: string; userId: string }[] }>(`/api/bingos/${slug}/draft/pick`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) });
      // The pick also puts the player on a team, which the bingo shell carries.
      queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
    },
  });
}

// Star clicks should feel instant, so the rating lands in the cached draft
// state before the server confirms it.
export function useSetPickRating(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ signupId, rating }: { signupId: string; rating: PickRating }) =>
      optimisticUpdate<DraftState>(
        queryClient,
        queryKeys.draftState(slug),
        (prev) => ({ ...prev, ratings: { ...prev.ratings, [signupId]: rating } }),
        () => api.put<{ ratings: Record<string, PickRating> }>(`/api/bingos/${slug}/draft/ratings/${signupId}`, rating),
      ),
  });
}

export function useRenameTeam(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { teamId: string; name: string }) => api.patch<{ team: Team }>(`/api/bingos/${slug}/teams/${params.teamId}`, { name: params.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) });
    },
  });
}

export function useStats(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stats(slug ?? ""),
    queryFn: () => api.get<StatsResponse>(`/api/bingos/${slug}/stats`),
    enabled: !!slug,
  });
}

export function auditLogQueryString(filters: AuditLogFilters, cursor?: number): string {
  const params = new URLSearchParams();
  if (filters.action?.length) params.set("action", filters.action.join(","));
  if (filters.category?.length) params.set("category", filters.category.join(","));
  if (filters.actorUserId?.length) params.set("actorUserId", filters.actorUserId.join(","));
  if (filters.teamId?.length) params.set("teamId", filters.teamId.join(","));
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  if (filters.q) params.set("q", filters.q);
  if (cursor !== undefined) params.set("cursor", String(cursor));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// The full mod-panel audit log — paginated with useInfiniteQuery so "load
// more" just appends a page rather than refetching everything.
export function useAuditLog(slug: string | undefined, filters: AuditLogFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.auditLog(slug ?? "", filters),
    queryFn: ({ pageParam }) => api.get<AuditLogResponse>(`/api/bingos/${slug}/mod/audit-log${auditLogQueryString(filters, pageParam)}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!slug,
  });
}

// One page of a single team's activity feed — the TeamInfoDialog slot, so no
// pagination UI is needed there yet.
export function useTeamActivity(slug: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teamActivity(slug ?? "", teamId ?? ""),
    queryFn: () => api.get<AuditLogResponse>(`/api/bingos/${slug}/teams/${teamId}/activity`),
    enabled: !!slug && !!teamId,
  });
}

export function useAdvanceStage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (toStage: Stage) => api.post<{ bingo: BingoShellResponse["bingo"] }>(`/api/bingos/${slug}/mod/stage`, { toStage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });
    },
  });
}

// Clan standing is fetched live, so keep it short-lived; the server caches
// the upstream call for 60s anyway.
export function usePlayerProfile(slug: string, userId: string | null) {
  return useQuery({
    queryKey: queryKeys.playerProfile(slug, userId ?? ""),
    queryFn: () => api.get<{ player: PlayerProfile }>(`/api/bingos/${slug}/players/${userId}`),
    enabled: !!userId,
    staleTime: 60_000,
  });
}
