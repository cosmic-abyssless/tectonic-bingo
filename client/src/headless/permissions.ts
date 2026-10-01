import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { can, siteRoles, type Action, type BingoPermissionsResponse } from "@bingo/shared";
import { onRefused } from "../api/client";
import { queryKeys, useBingo, usePermissions } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { toast } from "../core/ui/Toast";
import { lostAccessMessage, permissionCheck, type CanCheck, type CanResult } from "./permissionCheck";

// What the client shows and hides by (CONTEXT.md "Action"; docs/adr/0001-permissions.md): the viewer's Actions as the
// server resolved them (GET /api/bingos/:slug/permissions), never its own reading of who is a Moderator, an Admin or a
// Captain. They're asked again when the viewer's roles or the stage change (WebSocketContext) and after a 403
// (useAccessWatch), and the hooks here follow along: a lost page sends the viewer on, a lost Action disables its
// control with the reason and closes its dialog, and a gained one just appears.

export { lostAccessMessage, permissionCheck, type CanCheck, type CanResult };

/** can() for every Action in the bingo, for a component that asks about several. */
export function useBingoCan(slug: string | undefined): CanCheck {
  return permissionCheck(usePermissions(slug).data);
}

/** can() for one Action in the bingo: `slug`, or the one the page is under. */
export function useCan(action: Action, slug?: string): CanResult {
  const params = useParams<{ slug: string }>();
  return useBingoCan(slug ?? params.slug)(action);
}

/** can() for an Action outside any Bingo (the Site admin pages), from the viewer's own Admin flag. */
export function useSiteCan(action: Action): CanResult {
  const { user } = useAuth();
  return { allowed: !!user && can(siteRoles(user), null, action).ok, reason: null };
}

/**
 * Keeps the viewer on a page of the bingo only while `mayStay` says so (undefined: not known yet, as when it needs the
 * shell). Never allowed, they're sent on quietly, as a link to a page they can't open would be; losing it while here
 * (a role taken away, the stage moved on), they're sent to the closest page they can still see, the bingo's home or
 * else the list of Bingos, with a toast saying why. `action` is the one the page is for, which the toast names the
 * lost role by. Returns whether they may stay, false until it's known.
 */
export function usePageAccess(slug: string | undefined, mayStay: (can: CanCheck) => boolean | undefined, action: Action, bingoName: string | undefined): boolean {
  const navigate = useNavigate();
  const { data: permissions, dataUpdatedAt } = usePermissions(slug);
  const stage = useBingo(slug).data?.bingo.stage;
  const verdict = permissions ? mayStay(permissionCheck(permissions)) : undefined;
  // A copy from storage (dataUpdatedAt 0) may be out of date: it may keep them here until the server answers, but not
  // send them away.
  const allowed = verdict === false && dataUpdatedAt === 0 ? undefined : verdict;
  const lastAllowed = useRef<BingoPermissionsResponse | null>(null);
  useEffect(() => {
    if (!slug || allowed === undefined || !permissions) return;
    if (allowed) {
      lastAllowed.current = permissions;
      return;
    }
    const before = lastAllowed.current;
    lastAllowed.current = null;
    // The home shows everyone at least the bingo's landing (its signup form, or why they aren't part of it), except a
    // Planning bingo, which doesn't exist for anyone who can't see it.
    const homeVisible = permissions.allowed.includes("view_bingo") || (!!stage && stage !== "planning");
    navigate(homeVisible ? `/b/${slug}` : "/bingos", { replace: true });
    if (before) toast({ title: lostAccessMessage(before, permissions, action, bingoName ?? "this bingo"), tone: "warning" });
  }, [slug, allowed, permissions, stage, action, bingoName, navigate]);
  return allowed === true;
}

/**
 * usePageAccess for a page outside any Bingo (the Site admin pages), by the viewer's own Admin flag: losing it while
 * here sends them to the list of Bingos with a toast. Returns whether they may stay.
 */
export function useSitePageAccess(action: Action): boolean {
  const { allowed } = useSiteCan(action);
  const navigate = useNavigate();
  const had = useRef(allowed);
  useEffect(() => {
    if (allowed) {
      had.current = true;
      return;
    }
    if (!had.current) return;
    had.current = false;
    navigate("/bingos", { replace: true });
    toast({ title: "You're no longer an Admin", tone: "warning" });
  }, [allowed, navigate]);
  return allowed;
}

/**
 * Closes a dialog for `action` when the viewer loses it while the dialog is open, and says why in the same words its
 * disabled control now shows (or which role went, when there's no reason because the role did).
 */
export function useCloseOnLoss(action: Action, isOpen: boolean, close: () => void, slug?: string): void {
  const params = useParams<{ slug: string }>();
  const { data: permissions } = usePermissions(slug ?? params.slug);
  const allowed = permissionCheck(permissions)(action).allowed;
  const before = useRef<BingoPermissionsResponse | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!permissions) return;
    if (allowed || !isOpen) {
      before.current = allowed ? permissions : null;
      return;
    }
    const had = before.current;
    before.current = null;
    if (!had) return;
    closeRef.current();
    toast({ title: lostAccessMessage(had, permissions, action, "this bingo"), tone: "warning" });
  }, [permissions, allowed, isOpen, action]);
}

/**
 * Mounted once, app-wide: a 403 means the page may be stale, so the viewer's permissions (or, on the Site admin pages,
 * their own record) are asked again, and a refused write says why in a toast, in the server's words.
 */
export function useAccessWatch(): void {
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(
    () =>
      onRefused((path, method, error) => {
        const slug = /^\/api\/bingos\/([^/]+)/.exec(path)?.[1];
        if (slug) {
          const decoded = decodeURIComponent(slug);
          void queryClient.invalidateQueries({ queryKey: queryKeys.permissions(decoded) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.bingo(decoded) });
        } else if (path.startsWith("/api/admin")) {
          void refreshRef.current();
        }
        if (method !== "GET") toast({ title: error.message, tone: "warning" });
      }),
    [queryClient],
  );
}
