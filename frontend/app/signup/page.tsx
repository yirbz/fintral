import type { Metadata } from "next"
import PageClient from "./page.client"

export const metadata: Metadata = {
  title: "Crear Cuenta",
}

export default function Page() {
  return <PageClient />
}
