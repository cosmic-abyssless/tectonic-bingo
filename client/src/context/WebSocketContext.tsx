import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BroadcastEvent } from "@bingo/shared";

type Listener = (event: BroadcastEvent) => void;

const WebSocketContext = createContext<{
  subscribe: (fn: Listener) => () => void;
  statsRefreshingSignupIds: ReadonlySet<string>;
  statsRefreshingUserIds: ReadonlySet<string>;
  markStatsRefreshing: (signupId: string, refreshing: boolean) => void;
} | null>(null);

function invalidateForEvent(queryClient: QueryClient, event: BroadcastEvent) {
  switch (event.type) {
    case "submission_created":
    case "submission_reviewed":
      queryClient.invalidateQueries({ queryKey: ["teamProgress"] });
      queryClient.invalidateQueries({ queryKey: ["teamSubmissions"] });
      queryClient.invalidateQueries({ queryKey: ["modSubmissions"] });
      queryClient.invalidateQueries({ queryKey: ["pendingCount"] });
      break;
    case "stage_changed":
      queryClient.invalidateQueries({ queryKey: ["bingo"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      break;
    case "team_updated":
      queryClient.invalidateQueries({ queryKey: ["bingo"] });
      // The scouting/draft room lists teams from draft state.
      queryClient.invalidateQueries({ queryKey: ["draftState"] });
      break;
    case "bingo_changed":
      queryClient.invalidateQueries({ queryKey: ["bingo"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      // A board edit made while live re-scores every team, so everyone's progress moves too.
      queryClient.invalidateQueries({ queryKey: ["teamProgress"] });
      queryClient.invalidateQueries({ queryKey: ["teamSubmissions"] });
      queryClient.invalidateQueries({ queryKey: ["adminLines"] });
      queryClient.invalidateQueries({ queryKey: ["adminQuestions"] });
      queryClient.invalidateQueries({ queryKey: ["adminMods"] });
      queryClient.invalidateQueries({ queryKey: ["bingoMods"] });
      queryClient.invalidateQueries({ queryKey: ["adminCaptainCandidates"] });
      // Team count and leftover settings decide who is at risk of being cut.
      queryClient.invalidateQueries({ queryKey: ["mySignup"] });
      queryClient.invalidateQueries({ queryKey: ["signupRoster"] });
      queryClient.invalidateQueries({ queryKey: ["draftState"] });
      break;
    case "draft_started":
    case "draft_order_shuffled":
    case "draft_order_set":
    case "draft_pick":
      queryClient.invalidateQueries({ queryKey: ["draftState"] });
      // A drafted player now has a team, so their bingo shell's myTeam changes.
      queryClient.invalidateQueries({ queryKey: ["bingo"] });
      break;
    case "draft_rating_changed":
      queryClient.invalidateQueries({ queryKey: ["draftState"] });
      break;
    case "tile_interest_changed":
      queryClient.invalidateQueries({ queryKey: ["teamProgress"] });
      break;
    case "signup_changed":
      // Signups, pairings, and who is eligible to captain all move together.
      queryClient.invalidateQueries({ queryKey: ["signupRoster"] });
      queryClient.invalidateQueries({ queryKey: ["mySignup"] });
      queryClient.invalidateQueries({ queryKey: ["myPairing"] });
      queryClient.invalidateQueries({ queryKey: ["partnerCandidates"] });
      queryClient.invalidateQueries({ queryKey: ["adminCaptainCandidates"] });
      // Leads scouting the pool see new/withdrawn signups and pairs live.
      queryClient.invalidateQueries({ queryKey: ["draftState"] });
      // CA / WOM snapshots land after the fire-and-forget fetch.
      queryClient.invalidateQueries({ queryKey: ["playerProfile"] });
      break;
    case "audit_appended":
      queryClient.invalidateQueries({ queryKey: ["auditLog"] });
      queryClient.invalidateQueries({ queryKey: ["teamActivity"] });
      break;
  }
}

// One WebSocket connection for the whole app (v1 opened a separate one per
// component that used it). Drives query-cache invalidation on every
// broadcast; useWebSocketEvent lets a component also react directly (e.g.
// the mod page's browser-notification prompt).
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const listenersRef = useRef<Set<Listener>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statsRefreshingSignupIds, setStatsRefreshingSignupIds] = useState<ReadonlySet<string>>(() => new Set());
  const [statsRefreshingUserIds, setStatsRefreshingUserIds] = useState<ReadonlySet<string>>(() => new Set());

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
    const { signupId, userId, statsRefreshing } = event.payload;
    if (statsRefreshing === undefined) return;
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
  }, []);

  useEffect(() => {
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
          invalidateForEvent(queryClient, msg);
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
  }, [queryClient, applyStatsRefreshing]);

  const subscribe = (fn: Listener) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  };

  return (
    <WebSocketContext.Provider value={{ subscribe, statsRefreshingSignupIds, statsRefreshingUserIds, markStatsRefreshing }}>{children}</WebSocketContext.Provider>
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
