import { Suspense } from "react";
import { AccountPage } from "@/features/account/account-page";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function CuentaPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const tab = resolvedParams.tab || "plan";
  const initialTab = (tab === "plan" || tab === "payments" || tab === "statement") ? tab : "plan";

  return (
    <Suspense fallback={
      <div className="space-y-8 max-w-6xl mx-auto p-4 sm:p-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-4 bg-muted rounded w-1/3" />
        </div>
        <div className="h-10 bg-muted rounded w-64" />
        <div className="h-64 bg-muted rounded-2xl w-full" />
      </div>
    }>
      <AccountPage initialTab={initialTab} />
    </Suspense>
  );
}


