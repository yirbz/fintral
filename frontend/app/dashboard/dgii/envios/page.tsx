import { Suspense } from "react"
import { DgiiSubmissionsPage } from "@/features/dgii/dgii-submissions-page"
import { DashboardRouteSkeleton } from "@/components/dashboard-route-skeleton"

export const dynamic = "force-dynamic"

export default function DgiiSubmissionsRoute() {
  return (
    <Suspense fallback={<DashboardRouteSkeleton />}>
      <DgiiSubmissionsPage />
    </Suspense>
  )
}
