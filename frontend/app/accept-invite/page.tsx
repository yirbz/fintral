import type { Metadata } from "next"
import AcceptInviteClient from "./page.client"

export const metadata: Metadata = {
  title: "Aceptar invitación",
}

export default function Page() {
  return <AcceptInviteClient />
}
