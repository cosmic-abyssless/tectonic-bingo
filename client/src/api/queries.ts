import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BingoListResponse, BingoModerator, BingoShellResponse, BoardResponse, CreatePointAdjustmentResponse, CreateSubmissionResponse, DraftState,
  ModSubmissionsResponse, MyPairingResponse, MySignupResponse, MyTectonicRsnsResponse, PartnerCandidatesResponse, PendingCountResponse,
  ReviewSubmissionResponse, RosterResponse, ScreenshotAnalysis, Signup, SignupAnswerInput, SignupPairing, SignupQuestion, Stage,
  StatsResponse, Team, TeamProgressSummary, TeamSubmissionsResponse,
} from "@bingo/shared";
import { api } from "./client";

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
  stats: (slug: string) => ["stats", slug] as const,
};

export function useBingos() {
  return useQuery({
    queryKey: queryKeys.bingos(),
    queryFn: () => api.get<BingoListResponse>("/api/bingos"),
  });
}

export function useBingo(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bingo(slug ?? ""),
    queryFn: () => api.get<BingoShellResponse>(`/api/bingos/${slug}`),
    enabled: !!slug,
  });
}

export function useBoard(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.board(slug ?? ""),
    queryFn: () => api.get<BoardResponse>(`/api/bingos/${slug}/board`),
    enabled: !!slug,
  });
}

export function useTeamProgress(slug: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teamProgress(slug ?? "", teamId ?? ""),
    queryFn: () => api.get<TeamProgressSummary>(`/api/bingos/${slug}/teams/${teamId}/progress`),
    enabled: !!slug && !!teamId,
  });
}

export function useTeamSubmissions(slug: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teamSubmissions(slug ?? "", teamId ?? ""),
    queryFn: () => api.get<TeamSubmissionsResponse>(`/api/bingos/${slug}/teams/${teamId}/submissions`),
    enabled: !!slug && !!teamId,
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
    mutationFn: (params: { submissionId: string; action: "approve" | "reject"; reviewerNotes?: string }) =>
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

export function useStartDraft(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ teams: Team[] }>(`/api/bingos/${slug}/mod/draft/start`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) }),
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
