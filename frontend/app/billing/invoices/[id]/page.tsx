import type { Metadata } from "next";
import InvoiceDetailPageClient from "./page.client";

export const metadata: Metadata = {
  title: "Detalle de Factura",
  description: "Detalle de factura y comprobante fiscal",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  return <InvoiceDetailPageClient id={resolvedParams.id} />;
}
