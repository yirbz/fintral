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
  TrendingDownIcon,
  TrendingUpIcon,
  Building2Icon,
  CoinsIcon,
  Users as UsersIcon,
  Package as PackageIcon,
  Grid as GridIcon,
  PlusCircle as PlusCircleIcon,
  ArrowLeftRight as ArrowLeftRightIcon,
  Edit3 as Edit3Icon,
} from "lucide-react"

const data = {
  user: {
    name: "Ana Martínez",
    email: "ana@fintral.com",
    avatar: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>",
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
      title: "Fintral Factura",
      url: "/billing",
      icon: <PlusCircleIcon />,
    },
    {
      title: "Papelera",
      url: "/dashboard/invoices/trash",
      icon: <Trash2Icon />,
    },
    // Notas de crédito/débito unificadas en facturas
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
      url: "/dashboard/help",
      icon: <CircleHelpIcon />,
    },
    {
      title: "Buscar",
      url: "/dashboard/search",
      icon: <SearchIcon />,
    },
  ],
  documents: [
    { name: "Exportaciones", url: "/dashboard/exports", icon: <DatabaseIcon /> },
    {
      name: "Contabilidad",
      icon: <CoinsIcon />,
      children: [
        { name: "Cuentas Bancarias", url: "/dashboard/accounts", icon: <Building2Icon /> },
        { name: "Cuentas por Cobrar (CXC)", url: "/dashboard/cxc", icon: <TrendingUpIcon /> },
        { name: "Cuentas por Pagar (CXP)", url: "/dashboard/cxp", icon: <TrendingDownIcon /> },
      ],
    },
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
  const [isBillingSubdomain, setIsBillingSubdomain] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsBillingSubdomain(
        window.location.hostname.startsWith("factura.") ||
        window.location.pathname.startsWith("/billing")
      )
    }
  }, [])

  const getLink = (path: string) => {
    if (typeof window === "undefined") {
      return `/billing${path === "/" ? "" : path}`
    }
    const isSub = window.location.hostname.startsWith("factura.")
    if (isSub) {
      return path
    }
    return `/billing${path === "/" ? "" : path}`
  }

  const getHubUrl = () => {
    if (typeof window !== "undefined") {
      const host = window.location.host
      if (host.startsWith("factura.localhost")) {
        return `http://${host.replace("factura.localhost", "localhost")}/dashboard`
      }
      if (host.startsWith("factura.")) {
        return `https://${host.replace("factura.", "")}/dashboard`
      }
    }
    return "/dashboard"
  }

  const pendingQuery = useQuery({
    queryKey: ["pending-upload-count"],
    queryFn: getPendingUploadCount,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    enabled: !isBillingSubdomain, // disable for billing
  })

  // Dynamic nav items
  const billingNavMain = [
    {
      title: "Panel Facturación",
      url: getLink("/"),
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Nueva Factura",
      url: getLink("/quick"),
      icon: <PlusCircleIcon />,
    },
    {
      title: "Corregir Facturas",
      url: getLink("/emit"),
      icon: <Edit3Icon />,
    },
    {
      title: "Clientes",
      url: getLink("/clients"),
      icon: <UsersIcon />,
    },
    {
      title: "Productos/Servicios",
      url: getLink("/products"),
      icon: <PackageIcon />,
    },
    {
      title: "Rangos NCF",
      url: getLink("/sequences"),
      icon: <GridIcon />,
    },
    {
      title: "Ajustes",
      url: getLink("/settings"),
      icon: <Settings2Icon />,
    },
  ]

  const billingDocuments = [
    {
      name: "Volver a Fintral Hub",
      url: getHubUrl(),
      icon: <ArrowLeftRightIcon />,
    }
  ]

  const navMain = isBillingSubdomain
    ? billingNavMain
    : data.navMain.map((item) =>
        item.url === "/dashboard/upload"
          ? { ...item, badge: pendingQuery.data?.count ?? undefined }
          : item
      )

  const documents = isBillingSubdomain ? billingDocuments : data.documents
  const navSecondary = isBillingSubdomain ? [] : data.navSecondary

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
              <a href={getLink("/")} className="flex items-center gap-3">
                <LogoMark className="max-md:size-5 md:!size-9" />
                <span className="text-base font-semibold tracking-tight">
                  {isBillingSubdomain ? "Fintral Factura" : "Fintral"}
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavDocuments items={documents} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} isBilling={isBillingSubdomain} />
      </SidebarFooter>
    </Sidebar>
  )
}
