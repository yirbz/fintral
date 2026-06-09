"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { billingApi, BillingInvoice } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Zap, PlusCircle, FileText, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

import { BillingMetrics } from "@/features/billing/billing-metrics";
import { InvoiceList } from "@/features/billing/billing-invoice-list";
import { EcfBanner } from "@/features/billing/ecf-banner";
import { CorrectionSection } from "@/features/billing/correction-section";

export default function BillingDashboard() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [transmittingId, setTransmittingId] = useState<string | null>(null);
  const [isEcfAuthorized, setIsEcfAuthorized] = useState<boolean>(false);
  const [certificationStatus, setCertificationStatus] = useState("none");
  const [isCertificationCompleted, setIsCertificationCompleted] =
    useState(false);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const data = await billingApi.getInvoices();
      setInvoices(data);
    } catch (err: any) {
      toast.error(
        "Error al cargar facturas: " + (err.message || "Error desconocido")
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchVerificationStatus = async () => {
    try {
      const status = await billingApi.getVerificationStatus();
      setIsEcfAuthorized(status.is_ecf_authorized);
      setCertificationStatus(status.certification_status || "none");
      setIsCertificationCompleted(
        status.is_certification_completed || false
      );
    } catch (err) {
      console.error("Error checking verification status:", err);
      setIsEcfAuthorized(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchVerificationStatus();
  }, []);

  const handleTransmit = async (id: string) => {
    try {
      setTransmittingId(id);
      toast.info(
        isEcfAuthorized
          ? "Timbrando factura ante la DGII..."
          : "Emitiendo factura..."
      );
      const result = await billingApi.transmitInvoice(id);

      if (isEcfAuthorized) {
        toast.success(
          `Factura timbrada con éxito. NCF: ${result.invoice.invoice_number}`
        );
      } else {
        toast.success(
          `Factura emitida con éxito. NCF: ${result.invoice.invoice_number}`
        );
      }
      fetchInvoices();
    } catch (err: any) {
      toast.error(
        "Error: " + (err.message || "Error desconocido")
      );
    } finally {
      setTransmittingId(null);
    }
  };

  // Metrics derived data
  const totalInvoiced = invoices
    .filter((inv) => inv.status === "verified")
    .reduce((sum, inv) => sum + inv.total_amount, 0);
  const totalTax = invoices
    .filter((inv) => inv.status === "verified")
    .reduce((sum, inv) => sum + inv.tax_amount, 0);
  const draftCount = invoices.filter((inv) => inv.status === "draft").length;
  const verifiedCount = invoices.filter(
    (inv) => inv.status === "verified"
  ).length;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {isEcfAuthorized ? "Panel de Facturación Electrónica" : "Facturación"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEcfAuthorized
              ? "Emite y timbra comprobantes fiscales electrónicos ante la DGII"
              : "Emisión de facturas y comprobantes fiscales"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isEcfAuthorized ? (
            <Link href="/billing/emit" passHref>
              <Button className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 px-3">
                <Zap className="size-3.5" />
                Nueva e-CF
              </Button>
            </Link>
          ) : (
            <Link href="/billing/quick" passHref>
              <Button className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 px-3">
                <PlusCircle className="size-3.5" />
                Nueva factura
              </Button>
            </Link>
          )}
          <Link href="/billing/quick" passHref>
            <Button
              variant="outline"
              className="h-8 rounded-md border-border text-foreground hover:bg-muted text-xs gap-1.5 px-3"
            >
              <FileText className="size-3.5" />
              {isEcfAuthorized ? "Rápida (clásico)" : "Rápida"}
            </Button>
          </Link>
        </div>
      </div>

      {/* ── e-CF / No Electrónico Banner ── */}
      <EcfBanner
        isEcfAuthorized={isEcfAuthorized}
        certificationStatus={certificationStatus}
        isCertificationCompleted={isCertificationCompleted}
      />

      {/* ── Metrics ── */}
      <BillingMetrics
        data={{
          totalInvoiced,
          totalTax,
          verifiedCount,
          draftCount,
          loading,
          isEcfAuthorized,
        }}
      />

      {/* ── Quick Actions Row ── */}
      <div className="grid gap-3 md:grid-cols-3">
        <Link href="/billing/clients" passHref>
          <Button
            variant="outline"
            className="w-full h-20 flex-col gap-1 border-border/40 hover:bg-muted/50"
          >
            <span className="text-lg">👤</span>
            <span className="text-xs font-medium">Clientes</span>
          </Button>
        </Link>
        <Link href="/billing/products" passHref>
          <Button
            variant="outline"
            className="w-full h-20 flex-col gap-1 border-border/40 hover:bg-muted/50"
          >
            <span className="text-lg">📦</span>
            <span className="text-xs font-medium">Productos / Servicios</span>
          </Button>
        </Link>
        <Link href="/billing/sequences" passHref>
          <Button
            variant="outline"
            className="w-full h-20 flex-col gap-1 border-border/40 hover:bg-muted/50"
          >
            <span className="text-lg">🔢</span>
            <span className="text-xs font-medium">Secuencias NCF</span>
          </Button>
        </Link>
      </div>

      {/* ── Invoice List ── */}
      <InvoiceList
        invoices={invoices}
        loading={loading}
        isEcfAuthorized={isEcfAuthorized}
        transmittingId={transmittingId}
        onTransmit={handleTransmit}
      />

      {/* ── Correction Section ── */}
      <CorrectionSection
        invoices={invoices}
        isEcfAuthorized={isEcfAuthorized}
      />
    </div>
  );
}
