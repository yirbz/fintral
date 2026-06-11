import { Suspense } from "react";
import { SearchPage } from "@/features/search/search-page";
import { DashboardRouteSkeleton } from "@/components/dashboard-route-skeleton";

export const dynamic = "force-dynamic";

export default function SearchRoutePage() {
  return (
    <Suspense fallback={<DashboardRouteSkeleton />}>
      <SearchPage />
    </Suspense>
  );
}
