import { Suspense } from "react";
import { ExportsPage } from "@/features/exports/exports-page";
import { DashboardRouteSkeleton } from "@/components/dashboard-route-skeleton";

export const dynamic = "force-dynamic";

export default function ExportsRoutePage() {
  return (
    <Suspense fallback={<DashboardRouteSkeleton />}>
      <ExportsPage />
    </Suspense>
  );
}
