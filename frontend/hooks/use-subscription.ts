"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyPlan, FullUsageResponse } from "@/lib/api/plans";

export function useSubscription() {
  const queryClient = useQueryClient();

  const query = useQuery<FullUsageResponse>({
    queryKey: ["subscription-my"],
    queryFn: getMyPlan,
    staleTime: 30_000, // Cache for 30s
    refetchOnWindowFocus: true,
  });

  const refetch = async () => {
    await queryClient.invalidateQueries({ queryKey: ["subscription-my"] });
  };

  return {
    ...query,
    plan: query.data?.plan ?? null,
    subscription: query.data?.subscription ?? null,
    usage: query.data?.usage ?? null,
    trialRemainingDays: query.data?.trial_remaining_days ?? 0,
    refetch,
  };
}
