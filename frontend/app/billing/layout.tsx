import { ShellLoader } from "../dashboard/shell-loader";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <ShellLoader>{children}</ShellLoader>;
}
