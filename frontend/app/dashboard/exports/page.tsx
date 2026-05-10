import { Suspense } from "react";
import { ExportsPage } from "@/features/exports/exports-page";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ExportsRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-5 animate-spin" />
        </div>
      }
    >
      <ExportsPage />
    </Suspense>
  );
}
