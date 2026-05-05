"use client";

import { useQuery } from "@tanstack/react-query";

import { getMe } from "@/lib/api/session";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: getMe,
    staleTime: 60_000
  });
}
