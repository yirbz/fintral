import { Suspense } from "react";
import EmitInvoicePage from "./page.client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Nueva Factura Electrónica",
  description: "Emita comprobantes fiscales electrónicos (e-CF) con timbrado DGII en tiempo real",
};

function EmitPageFallback() {
  return (
    <div className="h-full w-full flex flex-col gap-6 p-6 lg:px-8 lg:py-8">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>
      <Skeleton className="h-[400px] w-full rounded-xl" />
    </div>
  );
}

export default function EmitPage() {
  return (
    <Suspense fallback={<EmitPageFallback />}>
      <EmitInvoicePage />
    </Suspense>
  );
}
