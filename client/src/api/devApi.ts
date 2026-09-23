import { useQuery } from "@tanstack/react-query";
import type { TestDataBingo, TestDataJob, TestDataOptions } from "@bingo/shared";
import { api } from "./client";

// The dev-only test data routes (server/src/routes/dev.ts): mounted only while the server is in dev mode (local
// servers and staging, never production), site admins only. See docs/generate-bingo.md.

export const devQueryKeys = {
  generateJob: ["devGenerateJob"] as const,
  testBingos: ["devTestBingos"] as const,
};

/** Starts a generator run on the server. `from` is the bingo whose board to copy. */
export function startGenerate(payload: Partial<TestDataOptions> & { from: string }) {
  return api.post<{ job: TestDataJob }>("/api/dev/generate", payload);
}
export function getGenerateJob() {
  return api.get<{ job: TestDataJob | null }>("/api/dev/generate");
}
export function listTestBingos() {
  return api.get<{ bingos: TestDataBingo[] }>("/api/dev/bingos");
}
export function tearDownTestBingo(slug: string) {
  return api.delete<{ deleted: { users: number; files: number } }>(`/api/dev/bingos/${slug}`);
}

/** The current (or last) run. Polls every second while one is running. */
export function useGenerateJob(enabled: boolean) {
  return useQuery({
    queryKey: devQueryKeys.generateJob,
    queryFn: getGenerateJob,
    enabled,
    refetchInterval: (query) => (query.state.data?.job?.status === "running" ? 1000 : false),
  });
}

export function useTestBingos(enabled: boolean) {
  return useQuery({ queryKey: devQueryKeys.testBingos, queryFn: listTestBingos, enabled });
}
