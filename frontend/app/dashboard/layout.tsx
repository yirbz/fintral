import { ShellLoader } from "./shell-loader";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <ShellLoader>{children}</ShellLoader>;
}
