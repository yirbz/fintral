import type { Metadata } from "next"
import PageClient from "./page.client"

export const metadata: Metadata = {
  title: "Infraestructura Fiscal para RD",
}

export default function Page() {
  return <PageClient />
}
