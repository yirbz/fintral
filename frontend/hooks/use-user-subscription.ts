"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyUserSubscription, UserSubscriptionResponse } from "@/lib/api/plans";

export function useUserSubscription() {
  const queryClient = useQueryClient();

  const query = useQuery<UserSubscriptionResponse>({
    queryKey: ["user-subscription"],
    queryFn: getMyUserSubscription,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const refetch = async () => {
    await queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
  };

  return {
    ...query,
    subscription: query.data?.subscription ?? null,
    plan: query.data?.plan ?? null,
    hasActiveSubscription: query.data?.has_active_subscription ?? false,
    trialRemainingDays: query.data?.subscription?.trial_remaining_days ?? 0,
    isTrialing: query.data?.subscription?.status === "trialing",
    isActive: query.data?.subscription?.status === "active",
    refetch,
  };
}
