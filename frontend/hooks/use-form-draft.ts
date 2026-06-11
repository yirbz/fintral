"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

const DRAFT_PARAM = "draft";

export function useFormDraft<T>(key: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const hasDraft = searchParams.get(DRAFT_PARAM) === key;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraft = useCallback(
    (data: T) => {
      try {
        sessionStorage.setItem(key, JSON.stringify(data));
      } catch {
        // sessionStorage full or unavailable — silently ignore
        return;
      }

      if (!hasDraft) {
        const params = new URLSearchParams(searchParams.toString());
        params.set(DRAFT_PARAM, key);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [key, hasDraft, searchParams, router, pathname],
  );

  /** Debounced version for use in onChange handlers */
  const saveDraftDebounced = useCallback(
    (data: T, delay = 400) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveDraft(data), delay);
    },
    [saveDraft],
  );

  const loadDraft = useCallback((): T | null => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }, [key]);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(key);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(DRAFT_PARAM);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [key, searchParams, router, pathname]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { hasDraft, saveDraft, saveDraftDebounced, loadDraft, clearDraft };
}
