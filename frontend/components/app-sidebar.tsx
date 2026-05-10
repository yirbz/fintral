"use client"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { LogoMark } from "@/components/ui/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  FileTextIcon,
  UploadIcon,
  MessageSquareIcon,
  Settings2Icon,
  CircleHelpIcon,
  SearchIcon,
  DatabaseIcon,
  BarChart3Icon,
  FileSpreadsheetIcon,
} from "lucide-react"

const data = {
  user: {
    name: "Ana Martínez",
    email: "ana@fintral.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Panel de control",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Facturas",
      url: "/dashboard/invoices",
      icon: <FileTextIcon />,
    },
    {
      title: "Captura",
      url: "/dashboard/upload",
      icon: <UploadIcon />,
    },
    {
      title: "Analítica",
      url: "/dashboard/reports",
      icon: <BarChart3Icon />,
    },
  ],
  navSecondary: [
    {
      title: "Ajustes",
      url: "/dashboard/settings",
      icon: <Settings2Icon />,
    },
    {
      title: "Ayuda",
      url: "/help",
      icon: <CircleHelpIcon />,
    },
    {
      title: "Buscar",
      url: "/search",
      icon: <SearchIcon />,
    },
  ],
  documents: [
    {
      name: "Exportaciones",
      url: "/dashboard/exports",
      icon: <DatabaseIcon />,
    },
    {
      name: "Reportes DGII",
      url: "/dashboard/dgii",
      icon: <BarChart3Icon />,
    },
    {
      name: "Historial",
      url: "/dashboard/history",
      icon: <FileSpreadsheetIcon />,
    },
  ],
}

import { useSession } from "@/hooks/use-session"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const session = useSession()

  const user = session.data?.user ? {
    name: session.data.user.full_name,
    email: session.data.user.email,
    avatar: "",
  } : data.user

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5! h-auto [&_svg]:w-auto [&_svg]:h-auto"
            >
              <a href="/dashboard" className="flex items-center gap-3">
                <LogoMark className="max-md:size-5 md:!size-9" />
                <span className="text-base font-semibold tracking-tight">Fintral</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
