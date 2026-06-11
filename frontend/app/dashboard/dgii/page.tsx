import { Suspense } from "react";
import { DgiiPage } from "@/features/dgii/dgii-page";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function DgiiRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-5 animate-spin" />
        </div>
      }
    >
      <DgiiPage />
    </Suspense>
  );
}
