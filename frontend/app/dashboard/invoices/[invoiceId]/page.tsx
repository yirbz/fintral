import { use } from "react"
import { InvoiceDetailPage } from "@/features/invoices/invoice-detail-page";

export default function InvoiceDetailRoutePage(props: {
  params: Promise<{ invoiceId: string }>
}) {
  const { invoiceId } = use(props.params)
  return <InvoiceDetailPage key={invoiceId} invoiceId={invoiceId} />;
}
