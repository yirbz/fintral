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
  Trash2Icon,
  SendIcon,
} from "lucide-react"

const data = {
  user: {
    name: "Ana Martínez",
    email: "ana@fintral.com",
    avatar: "https://i.pravatar.cc/80?u=ana-martinez-fintral",
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
      title: "Papelera",
      url: "/dashboard/invoices/trash",
      icon: <Trash2Icon />,
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
    { name: "Exportaciones", url: "/dashboard/exports", icon: <DatabaseIcon /> },
    {
      name: "DGII",
      icon: <BarChart3Icon />,
      children: [
        { name: "Crear reportes", url: "/dashboard/dgii", icon: <BarChart3Icon /> },
        { name: "Envíos", url: "/dashboard/dgii/envios", icon: <SendIcon /> },
      ],
    },
    { name: "Historial", url: "/dashboard/history", icon: <FileSpreadsheetIcon /> },
  ],
}

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/hooks/use-session"
import { getPendingUploadCount } from "@/lib/api/invoices"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const session = useSession()
  const [user, setUser] = useState(data.user)

  const pendingQuery = useQuery({
    queryKey: ["pending-upload-count"],
    queryFn: getPendingUploadCount,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const navMain = data.navMain.map((item) =>
    item.url === "/dashboard/upload"
      ? { ...item, badge: pendingQuery.data?.count ?? undefined }
      : item
  )

  useEffect(() => {
    if (session.data?.user) {
      setUser({
        name: session.data.user.full_name,
        email: session.data.user.email,
        avatar: "",
      })
    }
  }, [session.data])

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
        <NavMain items={navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
