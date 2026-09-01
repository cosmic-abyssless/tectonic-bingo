import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BingoListResponse, BingoShellResponse, BoardResponse, CreateSubmissionResponse, DraftState,
  ModSubmissionsResponse, MySignupResponse, PendingCountResponse, ReviewSubmissionResponse,
  RosterResponse, ScreenshotAnalysis, Signup, SignupAnswerInput, SignupQuestion, Stage,
  Team, TeamProgressSummary, TeamSubmissionsResponse,
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
  signupQuestions: (slug: string) => ["signupQuestions", slug] as const,
  mySignup: (slug: string) => ["mySignup", slug] as const,
  draftState: (slug: string) => ["draftState", slug] as const,
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
    mutationFn: (params: { submissionId: string; action: "approve" | "reject"; reviewerNotes?: string; pointsAwardedOverride?: number; taskCompleted?: boolean }) =>
      api.patch<ReviewSubmissionResponse>(`/api/bingos/${slug}/mod/submissions/${params.submissionId}`, {
        action: params.action,
        reviewerNotes: params.reviewerNotes,
        pointsAwardedOverride: params.pointsAwardedOverride,
        taskCompleted: params.taskCompleted,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.modSubmissions(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingCount(slug) });
      queryClient.invalidateQueries({ queryKey: ["teamProgress", slug] });
      queryClient.invalidateQueries({ queryKey: ["teamSubmissions", slug] });
    },
  });
}

export function useSignupRoster(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.signupRoster(slug ?? ""),
    queryFn: () => api.get<RosterResponse>(`/api/bingos/${slug}/mod/signups`),
    enabled: !!slug,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.mySignup(slug) }),
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
    mutationFn: (userId: string) => api.post<{ pick: { id: string; pickNumber: number; teamId: string; userId: string } }>(`/api/bingos/${slug}/draft/pick`, { userId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) }),
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
