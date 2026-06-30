"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { billingApi, BillingInvoice } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, PlusCircle, FileText, Users, Package, Hash, CheckCircle2, Clock, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { BillingMetrics } from "@/features/billing/billing-metrics";
import { InvoiceList } from "@/features/billing/billing-invoice-list";
import { EcfBanner } from "@/features/billing/ecf-banner";
import { CorrectionSection } from "@/features/billing/correction-section";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(amount);
}

function getStatusBadge(status: string) {
  switch (status) {
    case "verified":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
          <CheckCircle2 className="size-3" /> Aprobado DGII
        </Badge>
      );
    case "draft":
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
          <Clock className="size-3" /> Borrador
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
          <Loader2 className="size-3 animate-spin" /> Procesando
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
          <AlertCircle className="size-3" /> Rechazado
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function BillingDashboard() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEcfAuthorized, setIsEcfAuthorized] = useState<boolean>(false);
  const [certificationStatus, setCertificationStatus] = useState("none");
  const [isCertificationCompleted, setIsCertificationCompleted] =
    useState(false);
  const [isBillingSubdomain, setIsBillingSubdomain] = useState(false);

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
    if (typeof window !== "undefined") {
      setIsBillingSubdomain(window.location.hostname.startsWith("factura."));
    }
    fetchInvoices();
    fetchVerificationStatus();
  }, []);

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
          <Link href={isBillingSubdomain ? "/quick" : "/billing/quick"} passHref>
            <Button variant="outline" className="h-8 rounded-md text-xs gap-1.5 px-3">
              <Zap className="size-3.5 text-emerald-600" />
              Factura Rápida (POS)
            </Button>
          </Link>
          <Link href={isBillingSubdomain ? "/emit" : "/billing/emit"} passHref>
            <Button className="h-8 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 px-3">
              <FileText className="size-3.5" />
              Factura Detallada (A4)
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
            <Users className="size-5 text-muted-foreground" />
            <span className="text-xs font-medium">Clientes</span>
          </Button>
        </Link>
        <Link href="/billing/products" passHref>
          <Button
            variant="outline"
            className="w-full h-20 flex-col gap-1 border-border/40 hover:bg-muted/50"
          >
            <Package className="size-5 text-muted-foreground" />
            <span className="text-xs font-medium">Productos / Servicios</span>
          </Button>
        </Link>
        <Link href="/billing/sequences" passHref>
          <Button
            variant="outline"
            className="w-full h-20 flex-col gap-1 border-border/40 hover:bg-muted/50"
          >
            <Hash className="size-5 text-muted-foreground" />
            <span className="text-xs font-medium">Secuencias NCF</span>
          </Button>
        </Link>
      </div>

      {/* ── Invoice List ── */}
      <InvoiceList
        invoices={invoices}
        loading={loading}
        isEcfAuthorized={isEcfAuthorized}
      />

      {/* ── Correction Section ── */}
      <CorrectionSection
        invoices={invoices}
        isEcfAuthorized={isEcfAuthorized}
      />
    </div>
  );
}
