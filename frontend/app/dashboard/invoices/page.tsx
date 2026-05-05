import { Suspense } from "react";
import { InvoicesPage } from "@/features/invoices/invoices-page";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function InvoicesRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <InvoicesPage />
    </Suspense>
  );
}
