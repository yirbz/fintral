import type { Metadata } from "next"
import PageClient from "./page.client"

export const metadata: Metadata = {
  title: "Nueva Factura",
}

export default function Page() {
  return <PageClient />
}
