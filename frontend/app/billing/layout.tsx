import { Suspense } from "react";
import { BillingShell } from "./shell";
import { LogoLoader } from "@/components/logo-loader";

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<LogoLoader />}>
      <BillingShell>{children}</BillingShell>
    </Suspense>
  );
}
