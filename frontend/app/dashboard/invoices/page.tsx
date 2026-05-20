import { Suspense } from "react";
import { InvoicesPage } from "@/features/invoices/invoices-page";
import { DashboardRouteSkeleton } from "@/components/dashboard-route-skeleton";

export const dynamic = "force-dynamic";

export default function InvoicesRoutePage() {
  return (
    <Suspense fallback={<DashboardRouteSkeleton />}>
      <InvoicesPage />
    </Suspense>
  );
}
