import type { Metadata } from "next"
import PageClient from "./page.client"

export const metadata: Metadata = {
  title: "Productos y Servicios",
}

export default function Page() {
  return <PageClient />
}
