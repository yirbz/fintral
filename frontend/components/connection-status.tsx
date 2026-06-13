"use client";

import React, { useEffect, useState } from "react";
import { useOffline } from "@/components/offline-provider";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function ConnectionStatus() {
  const { isOnline, pendingCount, isSyncing } = useOffline();
  const [showStatus, setShowStatus] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [statusType, setStatusType] = useState<"offline" | "online" | "syncing">("online");

  useEffect(() => {
    if (!isOnline) {
      setStatusType("offline");
      setMessage("Sin conexión — Las facturas se guardarán localmente");
      setShowStatus(true);
    } else if (isOnline && statusType === "offline") {
      setStatusType("online");
      setMessage("Conexión restaurada — Sincronizando datos");
      setShowStatus(true);

      const timer = setTimeout(() => {
        setShowStatus(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  useEffect(() => {
    if (isSyncing) {
      setStatusType("syncing");
      setMessage(`Sincronizando ${pendingCount} factura${pendingCount > 1 ? "s" : ""}...`);
      setShowStatus(true);
    } else if (!isSyncing && statusType === "syncing") {
      if (isOnline) {
        setStatusType("online");
        setMessage("¡Sincronización completada!");
        const timer = setTimeout(() => {
          setShowStatus(false);
        }, 3000);
        return () => clearTimeout(timer);
      } else {
        setStatusType("offline");
        setMessage("Sin conexión — Las facturas se guardarán localmente");
      }
    }
  }, [isSyncing, pendingCount, isOnline]);

  if (!showStatus) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 px-4 text-xs font-semibold text-white shadow-md transition-all duration-300 animate-status-enter ${
        statusType === "offline"
          ? "bg-amber-600 border-b border-amber-700"
          : statusType === "syncing"
          ? "bg-sky-600 border-b border-sky-700"
          : "bg-emerald-600 border-b border-emerald-700"
      }`}
      style={{
        paddingTop: "calc(0.5rem + var(--safe-area-top, 0px))",
      }}
    >
      <div className="flex items-center gap-2 max-w-screen-md">
        {statusType === "offline" ? (
          <WifiOff className="h-4 w-4 animate-bounce" />
        ) : statusType === "syncing" ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Wifi className="h-4 w-4 animate-pulse" />
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}
