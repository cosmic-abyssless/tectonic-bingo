import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Apply `update` to the cached query immediately, then run the request. If
 * the request fails the cache is restored to its previous value and the error
 * is rethrown so the caller can show it. Either way the query is invalidated
 * afterwards so the cache converges on the server's truth.
 */
export async function optimisticUpdate<T>(queryClient: QueryClient, queryKey: QueryKey, update: (previous: T) => T, request: () => Promise<unknown>): Promise<void> {
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<T>(queryKey);
  if (previous !== undefined) queryClient.setQueryData<T>(queryKey, update(previous));
  try {
    await request();
  } catch (e) {
    queryClient.setQueryData(queryKey, previous);
    throw e;
  } finally {
    queryClient.invalidateQueries({ queryKey });
  }
}
