import { apiFetch } from "@/lib/api/client";
import type { StatisticsPayload } from "@/lib/types";

export async function getStatistics(period: "7d" | "30d" | "90d" = "30d") {
  return apiFetch<StatisticsPayload>(`/statistics?period=${period}`);
}
