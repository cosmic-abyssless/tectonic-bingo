import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { removeBoardCacheForSlug } from "../api/boardCache";
import { bingoSlugOfPath } from "../api/bingoScope";
import { useAuth } from "../context/AuthContext";
import { toast } from "../core/ui/Toast";

// Sends the browser back to the bingo list when the bingo it's on is deleted (or never existed), instead of leaving
// the page up with every query on it 404ing. A 404 can also be about something inside a bingo (a Team, a
// Submission), so the first one on the page only prompts a check of the bingo itself; it leaves only if that 404s too.
export function useBingoGoneRedirect(): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const userId = useAuth().user?.id;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const checking = useRef<string | null>(null);

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "error") return;
        const error = event.action.error;
        if (!(error instanceof ApiError) || error.status !== 404) return;
        const slug = bingoSlugOfPath(pathRef.current);
        if (!slug || !event.query.queryKey.includes(slug) || checking.current === slug) return;
        checking.current = slug;
        api
          .get(`/api/bingos/${slug}`)
          .catch((err: unknown) => {
            if (!(err instanceof ApiError) || err.status !== 404 || bingoSlugOfPath(pathRef.current) !== slug) return;
            // Its stored copies would otherwise paint it again on a later visit to the same address.
            if (userId) removeBoardCacheForSlug(userId, slug);
            navigate("/", { replace: true });
            toast({ title: "That bingo no longer exists", tone: "warning" });
          })
          .finally(() => {
            checking.current = null;
          });
      }),
    [queryClient, navigate, userId],
  );
}
