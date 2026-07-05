"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/hooks/use-org";
import { preloadOfflineData } from "@/lib/offline/preloader";
import { useOfflineSync } from "@/hooks/use-offline-sync";

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
  errorCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
  retryFailed: () => Promise<void>;
  hasOfflineData: boolean;
}

const OfflineContext = createContext<OfflineContextType | null>(null);

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOffline must be used within an OfflineProvider");
  }
  return context;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { activeOrgId } = useOrg();
  const syncState = useOfflineSync();

  const { isOnline, hasOfflineData } = syncState;

  // Preload products/clients/sequences for offline emission when online and authenticated
  useEffect(() => {
    if (isOnline && session?.tenant?.id) {
      preloadOfflineData(session.tenant.id, activeOrgId);
    }
  }, [isOnline, session?.tenant?.id, activeOrgId]);

  return (
    <OfflineContext.Provider value={syncState}>
      {children}
    </OfflineContext.Provider>
  );
}
