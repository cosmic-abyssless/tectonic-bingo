import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BingoListResponse, BingoShellResponse, BoardResponse, CreateSubmissionResponse,
  ModSubmissionsResponse, PendingCountResponse, ReviewSubmissionResponse,
  ScreenshotAnalysis, Stage, TeamProgressSummary, TeamSubmissionsResponse,
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
