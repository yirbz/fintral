import { Suspense } from "react";
import { DgiiPage } from "@/features/dgii/dgii-page";
import { DashboardRouteSkeleton } from "@/components/dashboard-route-skeleton";

export const dynamic = "force-dynamic";

export default function DgiiRoutePage() {
  return (
    <Suspense fallback={<DashboardRouteSkeleton />}>
      <DgiiPage />
    </Suspense>
  );
}
