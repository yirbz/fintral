import type { Metadata } from "next"
import TermsClient from "./page.client"

export const metadata: Metadata = {
  title: "Términos y Condiciones — Fintral",
}

export default function Page() {
  return <TermsClient />
}
