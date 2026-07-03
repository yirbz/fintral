"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { RealtimeEvent } from "@/lib/types";

interface RealtimeContextValue {
  connected: boolean;
  events: RealtimeEvent[];
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  events: []
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_WS_URL;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = configuredUrl || `${protocol}://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        setEvents((prev) => [payload, ...prev].slice(0, 80));
      } catch {
        // Ignore malformed events.
      }
    };

    const heartbeat = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 20_000);

    return () => {
      window.clearInterval(heartbeat);
      ws.close();
      socketRef.current = null;
    };
  }, []);

  const value = useMemo(
    () => ({
      connected,
      events
    }),
    [connected, events]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
