import type { Metadata } from "next";
import InvoicesPageClient from "./page.client";

export const metadata: Metadata = {
  title: "Facturas",
  description: "Gestión de facturas y comprobantes fiscales",
};

export default function InvoicesPage() {
  return <InvoicesPageClient />;
}
