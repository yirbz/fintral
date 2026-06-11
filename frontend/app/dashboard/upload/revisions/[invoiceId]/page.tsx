import { use } from "react";
import { RevisionDetailPage } from "@/features/upload/revision-detail-page";

export const dynamic = "force-dynamic";

export default function RevisionDetailRoutePage(props: {
  params: Promise<{ invoiceId: string }>
}) {
  const { invoiceId } = use(props.params);
  return <RevisionDetailPage invoiceId={invoiceId} />;
}
