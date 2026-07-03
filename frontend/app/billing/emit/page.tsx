import EmitInvoicePage from "./page.client";

export const metadata = {
  title: "Nueva Factura Electrónica",
  description: "Emita comprobantes fiscales electrónicos (e-CF) con timbrado DGII en tiempo real",
};

export default function EmitPage() {
  return <EmitInvoicePage />;
}
