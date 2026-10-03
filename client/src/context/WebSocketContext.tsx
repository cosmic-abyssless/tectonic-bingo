import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BroadcastEvent } from "@bingo/shared";
import { useAuth } from "./AuthContext";
import { keyMentions, otherBingoSlugs } from "../api/bingoScope";

type Listener = (event: BroadcastEvent) => void;

const WebSocketContext = createContext<{
  subscribe: (fn: Listener) => () => void;
  statsRefreshingSignupIds: ReadonlySet<string>;
  statsRefreshingUserIds: ReadonlySet<string>;
  markStatsRefreshing: (signupId: string, refreshing: boolean) => void;
  statsResults: ReadonlyMap<string, StatsResult>;
  markStatsResult: (signupId: string, result: StatsResult) => void;
} | null>(null);

/** How a signup's last stats refresh went: shown (a tick or a cross) for STATS_RESULT_MS after it finishes. */
export type StatsResult = "ok" | "failed";
const STATS_RESULT_MS = 3000;

function invalidateForEvent(queryClient: QueryClient, event: BroadcastEvent, viewerId: string | null) {
  // Only this event's bingo: a tab on another bingo would otherwise refetch its own board, progress and counts on
  // every write anywhere (e.g. a test data run next to it). An event for no bingo in particular is for every one.
  const others = "bingoId" in event && event.bingoId ? otherBingoSlugs(queryClient.getQueriesData({ queryKey: ["bingo"] }), event.bingoId) : new Set<string>();
  const invalidate = (queryKey: readonly unknown[]) => queryClient.invalidateQueries({ queryKey, predicate: (query) => !keyMentions(query.queryKey, others) });
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
      // Sealed Tiles end with the reveal's stage: which Tiles a search finds by their Tags changes with it.
      invalidate(["tileTagSearch"]);
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
      invalidate(["bingo"]);
      // The scouting/draft room lists teams from draft state.
      invalidate(["draftState"]);
      // Who can vote, and a removed Player's votes, change with the Team.
      invalidate(["superlatives"]);
      break;
    case "bingo_changed":
      invalidate(["bingo"]);
      invalidate(["board"]);
      // Tags (CONTEXT.md "Tag"): the board editor's, and which Tiles a search finds by them.
      invalidate(["adminBoardTags"]);
      invalidate(["tileTagSearch"]);
      // A board edit made while live re-scores every team, so everyone's progress moves too.
      invalidate(["teamProgress"]);
      invalidate(["teamSubmissions"]);
      invalidate(["adminLines"]);
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
      invalidate(["teamSubmissions"]);
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
// react directly (e.g. the mod page's browser-notification prompt).
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const listenersRef = useRef<Set<Listener>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (hasConnected) queryClient.invalidateQueries();
        hasConnected = true;
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as BroadcastEvent;
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
        if (!closed) reconnectTimer.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      closed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [queryClient, applyStatsRefreshing, socketUserId]);

  const subscribe = (fn: Listener) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  };

  return (
    <WebSocketContext.Provider value={{ subscribe, statsRefreshingSignupIds, statsRefreshingUserIds, markStatsRefreshing, statsResults, markStatsResult }}>
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
