import { redirect } from "next/navigation";

export const metadata = {
  title: "Notas de Crédito",
  description: "Notas de crédito y débito — ahora unificadas con facturas",
};

export default function CreditNotesRedirect() {
  redirect("/dashboard/invoices");
}
