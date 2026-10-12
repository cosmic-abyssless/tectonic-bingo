import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BingoShellResponse, BroadcastEvent, ClientSocketMessage, NotificationSocketMessage, ServerSocketMessage } from "@bingo/shared";
import { matchPath, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { keyMentions, otherBingoSlugs, unwatchedBingoSlugs, watchedBingoIds } from "../api/bingoScope";
import { reconnectDelayMs } from "./reconnectDelay";
import { noteServerBuild } from "../api/serverBuild";
import { applyReactionChanges } from "../api/reactionsCache";

type Listener = (event: BroadcastEvent) => void;
type NotificationListener = (msg: NotificationSocketMessage) => void;

/** What this tab tells the server of itself (ClientSocketMessage "presence"), minus the Bingo, which comes from the route. */
function notificationPermission(): Extract<ClientSocketMessage, { type: "presence" }>["notifications"] {
  return "Notification" in window ? Notification.permission : "unsupported";
}

/** How often a tab in view on a Bingo's page says so again, for the Catch-up's "last had it open". */
const PRESENCE_EVERY_MS = 60_000;

const WebSocketContext = createContext<{
  subscribe: (fn: Listener) => () => void;
  subscribeNotifications: (fn: NotificationListener) => () => void;
  /** Tells the server this tab's presence again now (after the browser's notification permission changed). */
  refreshPresence: () => void;
  statsRefreshingSignupIds: ReadonlySet<string>;
  statsRefreshingUserIds: ReadonlySet<string>;
  markStatsRefreshing: (signupId: string, refreshing: boolean) => void;
  statsResults: ReadonlyMap<string, StatsResult>;
  markStatsResult: (signupId: string, result: StatsResult) => void;
} | null>(null);

/** How a signup's last stats refresh went: shown (a tick or a cross) for STATS_RESULT_MS after it finishes. */
export type StatsResult = "ok" | "failed";
const STATS_RESULT_MS = 3000;

/**
 * Every query family a live event can change: those invalidateForEvent invalidates (its `invalidate` takes only these,
 * so one it starts invalidating has to be listed), plus "myAchievements" (AchievementPopupHost). After a reconnect
 * these are what the missed events may have left stale. The last three name no bingo.
 */
const REALTIME_QUERY_FAMILIES = [
  "bingo", "permissions", "board", "teamProgress", "teamSubmissions", "modSubmissions", "pendingCount", "stats", "wrapped",
  "superlatives", "feedback", "draftState", "signupRoster", "mySignup", "myPairing", "partnerCandidates", "unpairedSignups",
  "playerProfile", "accountTypes", "auditLog", "teamActivity", "rewind", "bingoMods", "signupQuestions", "myAchievements",
  "adminCaptainCandidates", "adminMods", "adminStaff", "adminQuestions", "adminSuperlatives", "adminWrappedArt",
  "adminBoardTags", "adminLines", "adminBoardDraft", "adminBoardDraftStatus",
  "adminSiteAdmins", "adminBugReports", "myBugReports",
] as const;
type RealtimeQueryFamily = (typeof REALTIME_QUERY_FAMILIES)[number];
const realtimeQueryFamilies: ReadonlySet<unknown> = new Set(REALTIME_QUERY_FAMILIES);

/** Up to this long after a reconnect before its refetch, at random: a deploy's open tabs reconnect together. */
const RECONNECT_REFETCH_SPREAD_MS = 2000;

/**
 * After a reconnect: refetch what the events missed while the socket was down may have changed, for the Bingos this tab
 * watches (and what names no bingo). The cached Bingos it doesn't watch heard no events before either, so their
 * queries are left alone. With nothing watched yet (no shell cached, e.g. the Bingo list) nothing is left out.
 */
function refetchAfterReconnect(queryClient: QueryClient) {
  const shells = queryClient.getQueryCache().findAll({ queryKey: ["bingo"] });
  const watched = new Set(watchedBingoIds(shells.map((q) => q.state)));
  const unwatched = unwatchedBingoSlugs(shells.map((q) => [q.queryKey, q.state.data] as const), watched);
  void queryClient.invalidateQueries({ predicate: (query) => realtimeQueryFamilies.has(query.queryKey[0]) && !keyMentions(query.queryKey, unwatched) });
}

function invalidateForEvent(queryClient: QueryClient, event: BroadcastEvent, viewerId: string | null) {
  // Only this event's bingo: a tab on another bingo would otherwise refetch its own board, progress and counts on
  // every write anywhere (e.g. a test data run next to it). An event for no bingo in particular is for every one.
  const others = "bingoId" in event && event.bingoId ? otherBingoSlugs(queryClient.getQueriesData({ queryKey: ["bingo"] }), event.bingoId) : new Set<string>();
  const invalidate = (queryKey: readonly [RealtimeQueryFamily]) => queryClient.invalidateQueries({ queryKey, predicate: (query) => !keyMentions(query.queryKey, others) });
  switch (event.type) {
    case "submission_created":
    case "submission_reviewed":
      invalidate(["teamProgress"]);
      invalidate(["teamSubmissions"]);
      invalidate(["modSubmissions"]);
      invalidate(["pendingCount"]);
      // Wrapped can't be published while anything is pending, and may publish itself as the last one is reviewed.
      invalidate(["wrapped"]);
      break;
    case "gp_values_updated":
      invalidate(["teamSubmissions"]);
      invalidate(["modSubmissions"]);
      invalidate(["stats"]);
      break;
    case "stage_changed":
      invalidate(["bingo"]);
      // Grants and rules go by the stage: everyone's Actions may have changed.
      invalidate(["permissions"]);
      invalidate(["board"]);
      // Finishing can publish Wrapped (its "Publish when the Bingo finishes" setting).
      invalidate(["wrapped"]);
      // Voting opens with Live and closes on Finishing.
      invalidate(["superlatives"]);
      // The Feedback form is open only while Finished.
      invalidate(["feedback"]);
      break;
    case "wrapped_published":
      invalidate(["wrapped"]);
      // The shell's wrappedPublished: the Board's "Your Bingo Wrapped" banner.
      invalidate(["bingo"]);
      break;
    case "team_updated":
      // Team names, colours and members: the board's header and team picker.
      invalidate(["bingo"]);
      // The scouting/draft room lists teams from draft state.
      invalidate(["draftState"]);
      // Who can vote, and a removed Player's votes, change with the Team.
      invalidate(["superlatives"]);
      // The mod roster shows each Player's Team, and who can still captain one changes with them.
      invalidate(["signupRoster"]);
      invalidate(["adminCaptainCandidates"]);
      break;
    case "mods_changed":
      invalidate(["adminMods"]);
      invalidate(["adminStaff"]);
      invalidate(["bingoMods"]);
      invalidate(["adminCaptainCandidates"]);
      break;
    case "questions_changed":
      invalidate(["adminQuestions"]);
      invalidate(["signupQuestions"]);
      // The Feedback form's questions are edited there too.
      invalidate(["feedback"]);
      // The roster's answer columns.
      invalidate(["signupRoster"]);
      break;
    case "superlative_categories_changed":
      invalidate(["adminSuperlatives"]);
      // Deleting a category drops its votes.
      invalidate(["superlatives"]);
      break;
    case "board_draft_changed":
      // The Draft board (CONTEXT.md): another Admin's edit or a Discard. Only the board editor and its "Unpublished
      // changes" bar read it. (An open Publish screen keeps its preview: a Publish made from it after the draft changed
      // is refused and the new one shown.)
      invalidate(["adminBoardDraft"]);
      invalidate(["adminBoardDraftStatus"]);
      invalidate(["adminBoardTags"]);
      invalidate(["adminLines"]);
      break;
    case "wrapped_art_changed":
      invalidate(["adminWrappedArt"]);
      // Published Wrapped shows the art as it is now.
      invalidate(["wrapped"]);
      break;
    case "bingo_changed":
      invalidate(["bingo"]);
      invalidate(["board"]);
      // Tags (CONTEXT.md "Tag"): the board editor's (the board above carries them for its search).
      invalidate(["adminBoardTags"]);
      // A board edit made while live re-scores every team, so everyone's progress moves too.
      invalidate(["teamProgress"]);
      invalidate(["teamSubmissions"]);
      invalidate(["adminLines"]);
      // The Draft board (CONTEXT.md): a Publish leaves none.
      invalidate(["adminBoardDraft"]);
      invalidate(["adminBoardDraftStatus"]);
      invalidate(["adminQuestions"]);
      // The Feedback form's questions are edited there too.
      invalidate(["feedback"]);
      invalidate(["adminMods"]);
      invalidate(["bingoMods"]);
      invalidate(["adminCaptainCandidates"]);
      // Team count and the draft cuts setting decide who is cut (the draft cuts preview is under signupRoster).
      invalidate(["mySignup"]);
      invalidate(["signupRoster"]);
      invalidate(["draftState"]);
      // Superlative categories added, renamed or deleted (deleting drops its votes), or a Player removed from a Team.
      invalidate(["superlatives"]);
      break;
    case "draft_started":
    case "draft_order_shuffled":
    case "draft_order_set":
    case "draft_pick":
    case "draft_pick_undone":
      invalidate(["draftState"]);
      // A drafted player now has a team, so their bingo shell's myTeam changes.
      invalidate(["bingo"]);
      break;
    case "draft_rating_changed":
      invalidate(["draftState"]);
      break;
    case "tile_interest_changed":
      invalidate(["teamProgress"]);
      break;
    case "submission_reactions_changed":
      // The reactions themselves, put straight into the Team's list (its id is its own, whichever Bingo): nothing refetches.
      applyReactionChanges(queryClient, event.payload.teamId, event.payload.changes);
      break;
    case "signup_changed":
      // Signups, pairings, and who is eligible to captain all move together.
      invalidate(["signupRoster"]);
      invalidate(["mySignup"]);
      invalidate(["myPairing"]);
      invalidate(["partnerCandidates"]);
      invalidate(["unpairedSignups"]);
      invalidate(["adminCaptainCandidates"]);
      // Leads scouting the pool see new/withdrawn signups and pairs live.
      invalidate(["draftState"]);
      // CA / WOM snapshots land after the fire-and-forget fetch (and with them, account types).
      invalidate(["playerProfile"]);
      invalidate(["accountTypes"]);
      break;
    case "player_renamed":
      // A Player is named by their Signup's RSN in everything that shows them (CONTEXT.md "Player"): the shell's Teams,
      // the roster and their own Signup, the draft, Submissions, stats, the audit log, Superlatives, Wrapped and Rewind.
      // Their account's details (its type, its CA) change with it.
      invalidate(["bingo"]);
      invalidate(["signupRoster"]);
      invalidate(["mySignup"]);
      invalidate(["adminCaptainCandidates"]);
      invalidate(["draftState"]);
      invalidate(["teamProgress"]);
      invalidate(["teamSubmissions"]);
      invalidate(["modSubmissions"]);
      invalidate(["stats"]);
      invalidate(["auditLog"]);
      invalidate(["teamActivity"]);
      invalidate(["superlatives"]);
      invalidate(["wrapped"]);
      invalidate(["rewind"]);
      invalidate(["playerProfile"]);
      invalidate(["accountTypes"]);
      break;
    case "audit_appended":
      invalidate(["auditLog"]);
      invalidate(["teamActivity"]);
      break;
    case "superlative_votes_changed":
      invalidate(["superlatives"]);
      break;
    case "bug_report_changed":
      invalidate(["adminBugReports"]);
      invalidate(["myBugReports"]);
      break;
    case "restrictions_changed":
      // The mod roster shows each player's Restrictions, and so does their player card's Permissions tab.
      invalidate(["signupRoster"]);
      invalidate(["playerProfile"]);
      break;
    case "access_changed":
      // Someone's Admin flag: the Site admin pages' list of site admins, for every Admin who has it open.
      if (event.bingoId === null) invalidate(["adminSiteAdmins"]);
      // Anyone's player card lists their roles (its Permissions tab).
      invalidate(["playerProfile"]);
      // Only the users named: their roles changed, and with them maybe their Actions and what the shell shows them.
      if (!viewerId || !event.payload.userIds.includes(viewerId)) break;
      invalidate(["permissions"]);
      invalidate(["bingo"]);
      break;
  }
}

// One WebSocket connection for the whole app (v1 opened a separate one per
// component that used it), while someone is logged in. Drives query-cache
// invalidation on every broadcast; useWebSocketEvent lets a component also
// react directly (e.g. a toast on a stage change).
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const listenersRef = useRef<Set<Listener>>(new Set());
  const notificationListenersRef = useRef<Set<NotificationListener>>(new Set());
  // The Bingo whose pages this tab is on (by the route's slug and its cached shell), for presence.
  const location = useLocation();
  const slug = matchPath("/b/:slug/*", location.pathname)?.params.slug ?? null;
  const slugRef = useRef<string | null>(slug);
  slugRef.current = slug;
  const sendPresenceRef = useRef<() => void>(() => {});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statsRefreshingSignupIds, setStatsRefreshingSignupIds] = useState<ReadonlySet<string>>(() => new Set());
  const [statsRefreshingUserIds, setStatsRefreshingUserIds] = useState<ReadonlySet<string>>(() => new Set());

  const [statsResults, setStatsResults] = useState<ReadonlyMap<string, StatsResult>>(() => new Map());
  const resultTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const markStatsResult = useCallback((signupId: string, result: StatsResult) => {
    setStatsResults((prev) => new Map(prev).set(signupId, result));
    clearTimeout(resultTimers.current.get(signupId));
    resultTimers.current.set(
      signupId,
      setTimeout(() => {
        resultTimers.current.delete(signupId);
        setStatsResults((prev) => {
          const next = new Map(prev);
          next.delete(signupId);
          return next;
        });
      }, STATS_RESULT_MS),
    );
  }, []);

  const markStatsRefreshing = useCallback((signupId: string, refreshing: boolean) => {
    setStatsRefreshingSignupIds((prev) => {
      const next = new Set(prev);
      if (refreshing) next.add(signupId);
      else next.delete(signupId);
      return next;
    });
  }, []);

  const applyStatsRefreshing = useCallback((event: BroadcastEvent) => {
    if (event.type !== "signup_changed") return;
    const { signupId, userId, statsRefreshing, statsFailed } = event.payload;
    if (statsRefreshing === undefined) return;
    // A finished lookup (older servers don't say how it went: no result then).
    if (signupId && !statsRefreshing && statsFailed !== undefined) markStatsResult(signupId, statsFailed ? "failed" : "ok");
    if (signupId) {
      setStatsRefreshingSignupIds((prev) => {
        const next = new Set(prev);
        if (statsRefreshing) next.add(signupId);
        else next.delete(signupId);
        return next;
      });
    }
    if (userId) {
      setStatsRefreshingUserIds((prev) => {
        const next = new Set(prev);
        if (statsRefreshing) next.add(userId);
        else next.delete(userId);
        return next;
      });
    }
  }, [markStatsResult]);

  const { user, refresh: refreshAuth } = useAuth();
  // A ref, so a new identity each render doesn't reconnect the socket.
  const refreshAuthRef = useRef(refreshAuth);
  refreshAuthRef.current = refreshAuth;
  // The server only lets a logged-in clan member open the socket, so nobody else tries: it connects on login and is
  // closed for good on logout.
  const socketUserId = user && (user.inGuild || user.isAdmin) ? user.id : null;

  useEffect(() => {
    if (!socketUserId) return;
    let closed = false;
    // True once a connection has been open. Events broadcast while the socket was
    // down are gone for good, so on every RE-connect the page's data is refetched;
    // the first connect needs nothing (the queries are loading anyway).
    let hasConnected = false;
    // Failed tries in a row, for the backoff; back to 0 once one opens.
    let attempt = 0;

    // The Bingos the server sends this client live events for: those it has a shell for (ClientSocketMessage), sent on
    // connecting and whenever a shell is cached or dropped. A Bingo's events start arriving once its shell has loaded,
    // about when its page's other queries do.
    let lastWatch: string | null = null;
    function sendWatch() {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const bingoIds = watchedBingoIds(queryClient.getQueryCache().findAll({ queryKey: ["bingo"] }).map((q) => q.state));
      const key = bingoIds.join(",");
      // Nothing to narrow to yet (no shell loaded): it keeps hearing everything rather than nothing.
      if (key === lastWatch || (lastWatch === null && bingoIds.length === 0)) return;
      lastWatch = key;
      const msg: ClientSocketMessage = { type: "watch", bingoIds };
      ws.send(JSON.stringify(msg));
    }
    const stopWatchingCache = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] !== "bingo") return;
      sendWatch();
      // The route's Bingo, once its shell has loaded: presence names it.
      if (event.query.queryKey[1] === slugRef.current) sendPresence();
    });

    // Whether this tab is in view, whether its browser allows notifications, and which Bingo it's on: how the server
    // picks a toast, a browser notification or a DM for a new Notification, and when it last had that Bingo open.
    let lastPresence: string | null = null;
    let lastPresenceAt = 0;
    function sendPresence(force = false) {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // The Bingo whose pages this tab is on, by the route's slug and its cached shell.
      const bingoId = (slugRef.current ? queryClient.getQueryData<BingoShellResponse>(["bingo", slugRef.current])?.bingo.id : null) ?? null;
      // In view: shown and focused. A browser calls a tab "visible" whenever its window isn't minimized, even behind other
      // windows or on another screen, where a toast goes unseen; a browser notification or a DM reaches them there.
      const visible = document.visibilityState === "visible" && document.hasFocus();
      const msg: ClientSocketMessage = { type: "presence", visible, notifications: notificationPermission(), bingoId };
      const key = JSON.stringify(msg);
      const now = Date.now();
      // Unchanged: only again once a minute, while a Bingo's page is in view (for the Catch-up).
      if (!force && key === lastPresence && !(msg.visible && msg.bingoId && now - lastPresenceAt >= PRESENCE_EVERY_MS)) return;
      lastPresence = key;
      lastPresenceAt = now;
      ws.send(key);
    }
    sendPresenceRef.current = () => sendPresence(true);
    const onVisibility = () => sendPresence();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("blur", onVisibility);
    const presenceTimer = setInterval(() => sendPresence(), PRESENCE_EVERY_MS);

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (hasConnected) {
          if (refetchTimer.current) clearTimeout(refetchTimer.current);
          refetchTimer.current = setTimeout(() => refetchAfterReconnect(queryClient), Math.random() * RECONNECT_REFETCH_SPREAD_MS);
        }
        hasConnected = true;
        attempt = 0;
        // A new connection hears every Bingo until told.
        lastWatch = null;
        sendWatch();
        sendPresence(true);
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as BroadcastEvent | ServerSocketMessage;
          // Not a broadcast: the build the server serves (core/ui/NewVersionNotice).
          if (msg.type === "hello") {
            noteServerBuild({ buildId: msg.buildId, forceReload: msg.forceReload });
            return;
          }
          // Not a broadcast: this user's Inbox changed (core/notifications/NotificationDelivery).
          if (msg.type === "notifications") {
            for (const listener of notificationListenersRef.current) listener(msg);
            return;
          }
          applyStatsRefreshing(msg);
          invalidateForEvent(queryClient, msg, socketUserId);
          // Their Admin flag: the Site admin pages and every bingo go by it.
          if (msg.type === "access_changed" && msg.bingoId === null && socketUserId && msg.payload.userIds.includes(socketUserId)) void refreshAuthRef.current();
          for (const listener of listenersRef.current) listener(msg);
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (!closed) reconnectTimer.current = setTimeout(connect, reconnectDelayMs(attempt++, Math.random));
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      closed = true;
      stopWatchingCache();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("blur", onVisibility);
      clearInterval(presenceTimer);
      sendPresenceRef.current = () => {};
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      wsRef.current?.close();
    };
  }, [queryClient, applyStatsRefreshing, socketUserId]);

  // A new route may be on another Bingo (or none): say so.
  useEffect(() => {
    sendPresenceRef.current();
  }, [slug]);

  const subscribe = (fn: Listener) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  };
  const subscribeNotifications = (fn: NotificationListener) => {
    notificationListenersRef.current.add(fn);
    return () => notificationListenersRef.current.delete(fn);
  };
  const refreshPresence = () => sendPresenceRef.current();

  return (
    <WebSocketContext.Provider value={{ subscribe, subscribeNotifications, refreshPresence, statsRefreshingSignupIds, statsRefreshingUserIds, markStatsRefreshing, statsResults, markStatsResult }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketEvent(listener: Listener): void {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocketEvent must be used within WebSocketProvider");
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(() => ctx.subscribe((e) => listenerRef.current(e)), [ctx]);
}

/** Hears this user's Inbox changing (the server's "notifications" message). */
export function useNotificationMessages(listener: NotificationListener): void {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useNotificationMessages must be used within WebSocketProvider");
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(() => ctx.subscribeNotifications((m) => listenerRef.current(m)), [ctx]);
}

/** Tells the server this tab's presence again, e.g. once the browser's notification permission has changed. */
export function useRefreshPresence(): () => void {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useRefreshPresence must be used within WebSocketProvider");
  return ctx.refreshPresence;
}

export function useStatsRefreshingSignupIds(): ReadonlySet<string> {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useStatsRefreshingSignupIds must be used within WebSocketProvider");
  return ctx.statsRefreshingSignupIds;
}

export function useStatsRefreshingUserIds(): ReadonlySet<string> {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useStatsRefreshingUserIds must be used within WebSocketProvider");
  return ctx.statsRefreshingUserIds;
}

export function useMarkStatsRefreshing(): (signupId: string, refreshing: boolean) => void {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useMarkStatsRefreshing must be used within WebSocketProvider");
  return ctx.markStatsRefreshing;
}

/** How each signup's last stats refresh went, for a few seconds after it finishes (see StatsResult). */
export function useStatsResults(): ReadonlyMap<string, StatsResult> {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useStatsResults must be used within WebSocketProvider");
  return ctx.statsResults;
}

export function useMarkStatsResult(): (signupId: string, result: StatsResult) => void {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useMarkStatsResult must be used within WebSocketProvider");
  return ctx.markStatsResult;
}
