import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BroadcastEvent } from "@bingo/shared";

type Listener = (event: BroadcastEvent) => void;

const WebSocketContext = createContext<{ subscribe: (fn: Listener) => () => void } | null>(null);

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
      break;
    case "draft_started":
    case "draft_pick":
      // Wired up in Phase 7 once draft state has a query key of its own.
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

  useEffect(() => {
    let closed = false;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as BroadcastEvent;
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
  }, [queryClient]);

  const subscribe = (fn: Listener) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  };

  return <WebSocketContext.Provider value={{ subscribe }}>{children}</WebSocketContext.Provider>;
}

export function useWebSocketEvent(listener: Listener): void {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocketEvent must be used within WebSocketProvider");
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(() => ctx.subscribe((e) => listenerRef.current(e)), [ctx]);
}
