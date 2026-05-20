"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPublicReferenceData, type ReferenceDataItem } from "@/lib/api/reference-data";

const LOCALSTORAGE_PREFIX = "refdata:";

function loadFromLocalStorage(domain: string): ReferenceDataItem[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(`${LOCALSTORAGE_PREFIX}${domain}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function saveToLocalStorage(domain: string, items: ReferenceDataItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${LOCALSTORAGE_PREFIX}${domain}`, JSON.stringify(items));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function useReferenceData(domain: string) {
  return useQuery({
    queryKey: ["reference-data", domain],
    queryFn: async () => {
      const res = await getPublicReferenceData(domain);
      saveToLocalStorage(domain, res.items);
      return res.items;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: () => loadFromLocalStorage(domain),
  });
}

export function usePrefetchReferenceData() {
  const queryClient = useQueryClient();

  return async (domain: string) => {
    const cached = loadFromLocalStorage(domain);
    if (cached) {
      queryClient.setQueryData(["reference-data", domain], cached);
      return;
    }
    await queryClient.prefetchQuery({
      queryKey: ["reference-data", domain],
      queryFn: async () => {
        const res = await getPublicReferenceData(domain);
        saveToLocalStorage(domain, res.items);
        return res.items;
      },
      staleTime: Infinity,
    });
  };
}

export function prefetchReferenceDataSync(domain: string) {
  if (typeof window === "undefined") return undefined;
  const cached = loadFromLocalStorage(domain);
  if (cached) return cached;

  void getPublicReferenceData(domain).then((res) => {
    saveToLocalStorage(domain, res.items);
  });

  return undefined;
}

export function getCachedReferenceData(domain: string): ReferenceDataItem[] | undefined {
  return loadFromLocalStorage(domain);
}
