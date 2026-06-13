"use client";

import { useEffect, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNetworkStatus } from "./use-network-status";
import { offlineDb } from "@/lib/offline/db";
import { syncManager, type SyncResult } from "@/lib/offline/sync-manager";
import { toast } from "sonner";

export function useOfflineSync() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult[] | null>(null);

  // Reactive counts using Dexie LiveQuery
  const pendingCount = useLiveQuery(
    () => offlineDb.invoiceDrafts.where("syncStatus").equals("pending_sync").count(),
    [],
    0
  );

  const errorCount = useLiveQuery(
    () => offlineDb.invoiceDrafts.where("syncStatus").equals("error").count(),
    [],
    0
  );

  const hasOfflineData = useLiveQuery(
    async () => {
      const p = await offlineDb.products.count();
      const c = await offlineDb.clients.count();
      const s = await offlineDb.sequences.count();
      return p > 0 && c > 0 && s > 0;
    },
    [],
    false
  );

  const syncNow = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    const toastId = toast.loading("Sincronizando facturas pendientes...");

    try {
      const results = await syncManager.syncPendingInvoices();
      setLastSyncResult(results);

      if (results.length > 0) {
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        if (failed === 0) {
          toast.success(`¡Sincronización completada! ${successful} facturas procesadas.`, {
            id: toastId,
          });
        } else {
          toast.warning(
            `Sincronización parcial: ${successful} enviadas, ${failed} con error. Revise el panel de control.`,
            { id: toastId }
          );
        }
      } else {
        toast.dismiss(toastId);
      }
    } catch (error: any) {
      console.error("Sync failed:", error);
      toast.error("Error de conexión al sincronizar. Se reintentará automáticamente.", {
        id: toastId,
      });
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Trigger sync automatically when network returns and there are pending items
  useEffect(() => {
    if (isOnline && wasOffline && pendingCount > 0) {
      console.log("Network restored and pending invoices detected. Auto-syncing...");
      syncNow();
    }
  }, [isOnline, wasOffline, pendingCount, syncNow]);

  // Listen to custom trigger events from service worker messages
  useEffect(() => {
    const handleSWTrigger = () => {
      if (isOnline && pendingCount > 0) {
        console.log("Service worker triggered sync event");
        syncNow();
      }
    };

    window.addEventListener("sync-invoices-trigger", handleSWTrigger);
    return () => {
      window.removeEventListener("sync-invoices-trigger", handleSWTrigger);
    };
  }, [isOnline, pendingCount, syncNow]);

  const retryFailed = useCallback(async () => {
    setIsSyncing(true);
    const toastId = toast.loading("Reintentando facturas fallidas...");
    try {
      const results = await syncManager.retryFailed();
      if (results.length > 0) {
        const successful = results.filter(r => r.success).length;
        toast.success(`¡Reintento completado! ${successful} facturas sincronizadas.`, { id: toastId });
      } else {
        toast.info("No hay facturas aptas para reintento.", { id: toastId });
      }
    } catch (error) {
      toast.error("Fallo al reintentar la sincronización.", { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    isOnline,
    pendingCount,
    errorCount,
    isSyncing,
    lastSyncResult,
    syncNow,
    retryFailed,
    hasOfflineData,
  };
}
