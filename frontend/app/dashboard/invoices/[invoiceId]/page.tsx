import { InvoiceDetailPage } from "@/features/invoices/invoice-detail-page";

export default function InvoiceDetailRoutePage({
  params
}: {
  params: {
    invoiceId: string;
  };
}) {
  return <InvoiceDetailPage invoiceId={params.invoiceId} />;
}
