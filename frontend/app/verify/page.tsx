import { Suspense } from "react"
import type { Metadata } from "next"
import PageClient from "./page.client"

export const metadata: Metadata = {
  title: "Verificar Cuenta",
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageClient />
    </Suspense>
  )
}
