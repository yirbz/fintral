import { redirect } from "next/navigation";

export default function StatementRedirect() {
  redirect("/dashboard/cuenta?tab=statement");
}

