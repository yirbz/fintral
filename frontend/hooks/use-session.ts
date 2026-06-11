"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe } from "@/lib/api/session";
import type { SessionPayload } from "@/lib/types";

const SESSION_CACHE_KEY = "fintral_session";
const REMEMBER_FLAG_KEY = "fintral_remember";

function isPersistentSession(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(REMEMBER_FLAG_KEY) !== "false";
}

function getStorage(): Storage {
  return isPersistentSession() ? localStorage : sessionStorage;
}

function loadCachedSession(): SessionPayload | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    // Try sessionStorage first (non-remembered sessions), then localStorage
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY)
      || localStorage.getItem(SESSION_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionPayload) : undefined;
  } catch {
    return undefined;
  }
}

function saveSession(session: SessionPayload) {
  if (typeof window === "undefined") return;
  try {
    getStorage().setItem(SESSION_CACHE_KEY, JSON.stringify(session));
  } catch { /* storage full or unavailable */ }
}

function clearCachedSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    sessionStorage.removeItem(REMEMBER_FLAG_KEY);
  } catch { /* noop */ }
}

export { clearCachedSession };

export function setRememberPreference(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(REMEMBER_FLAG_KEY, remember ? "true" : "false");
  } catch { /* noop */ }
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const data = await getMe();
      saveSession(data);
      return data;
    },
    staleTime: 60_000,
    initialData: loadCachedSession,
  });
}

export function useLogout() {
  return async () => {
    clearCachedSession();
    window.location.href = "/logout";
  };
}
