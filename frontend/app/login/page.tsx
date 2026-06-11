import type { Metadata } from "next"
import PageClient from "./page.client"

export const metadata: Metadata = {
  title: "Iniciar Sesión",
}

export default function Page() {
  return <PageClient />
}
