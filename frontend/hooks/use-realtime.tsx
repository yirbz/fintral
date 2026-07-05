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
  const connected = false;
  const events: RealtimeEvent[] = [];

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
