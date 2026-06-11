import type { Metadata } from "next"
import PlansClient from "./page.client"

export const metadata: Metadata = {
  title: "Planes y Precios — Fintral",
}

export default function Page() {
  return <PlansClient />
}
