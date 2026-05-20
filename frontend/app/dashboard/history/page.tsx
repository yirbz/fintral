import { Suspense } from "react";
import { HistoryPage } from "@/features/history/history-page";
import { DashboardRouteSkeleton } from "@/components/dashboard-route-skeleton";

export const dynamic = "force-dynamic";

export default function HistoryRoutePage() {
  return (
    <Suspense fallback={<DashboardRouteSkeleton />}>
      <HistoryPage />
    </Suspense>
  );
}
