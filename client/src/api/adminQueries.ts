import { useQuery } from "@tanstack/react-query";
import * as adminApi from "./adminApi";

export const adminQueryKeys = {
  mods: (slug: string) => ["adminMods", slug] as const,
  lines: (slug: string) => ["adminLines", slug] as const,
  questions: (slug: string) => ["adminQuestions", slug] as const,
  userSearch: (scope: string, q: string) => ["adminUserSearch", scope, q] as const,
  captainCandidates: (slug: string) => ["adminCaptainCandidates", slug] as const,
  itemGroups: ["adminItemGroups"] as const,
};

export function useItemGroups() {
  return useQuery({ queryKey: adminQueryKeys.itemGroups, queryFn: () => adminApi.getItemGroups() });
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

// scope is either a bingo slug (search within that bingo's admin routes) or
// "site" (site-admin-level search, e.g. granting site admin).
export function useUserSearch(scope: string, q: string) {
  return useQuery({
    queryKey: adminQueryKeys.userSearch(scope, q),
    queryFn: () => (scope === "site" ? adminApi.searchAllUsers(q) : adminApi.searchBingoUsers(scope, q)),
    enabled: q.trim().length > 0,
  });
}
