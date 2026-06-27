"use client"

import { useEffect, useState } from "react"
import { useSession, clearCachedSession } from "@/hooks/use-session"
import { Button } from "@/components/ui/button"
import {
  Avatar, AvatarFallback, AvatarImage,
} from "@/components/ui/avatar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"
import {
  EllipsisVerticalIcon,
  LogOutIcon,
  Settings2,
  Store,
  Receipt,
  CircleHelp,
  Search,
  ArrowLeftRight
} from "lucide-react"
import Link from "next/link"

export function NavUser({ user, isBilling }: { user: { name: string; email: string; avatar: string }; isBilling?: boolean }) {
  const { isMobile } = useSidebar()
  const { data: session, isLoading } = useSession()
  const [displayName, setDisplayName] = useState(user.name)
  const [displayEmail, setDisplayEmail] = useState(user.email)
  const [displayAvatar, setDisplayAvatar] = useState(user.avatar)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (session?.user?.full_name) setDisplayName(session.user.full_name)
    if (session?.user?.email) setDisplayEmail(session.user.email)
    if (session?.user?.avatar_url) setDisplayAvatar(session.user.avatar_url)
  }, [session])

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

  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            <div className="flex h-8 w-8 animate-pulse rounded-lg bg-sidebar-accent" />
            <div className="grid flex-1 gap-1.5 text-left text-sm leading-tight">
              <div className="h-3 w-24 animate-pulse rounded bg-sidebar-accent" />
              <div className="h-2.5 w-32 animate-pulse rounded bg-sidebar-accent" />
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4 text-sidebar-accent" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground select-none">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={displayAvatar || undefined} alt={displayName} />
                <AvatarFallback className="rounded-lg">{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
              </div>
              <EllipsisVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="motion-popover w-[calc(var(--radix-popover-trigger-width)-8px)] max-w-sm ml-1 bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl shadow-brand-lg p-3.5 flex flex-col gap-3 outline-none"
          >
            {/* Popover Header Profile Box */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-brand-hairline/80 dark:border-slate-800/80 bg-brand-canvas-soft/30 dark:bg-slate-900/30">
              <Avatar className="h-10 w-10 rounded-lg border border-brand-primary/10 shadow-xs">
                <AvatarImage src={displayAvatar || undefined} alt={displayName} />
                <AvatarFallback className="rounded-lg bg-brand-primary/10 text-brand-primary font-bold text-sm">
                  {displayName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-xs leading-tight">
                <span className="truncate font-semibold text-brand-ink dark:text-white text-sm">{displayName}</span>
                <span className="truncate text-brand-ink-mute dark:text-slate-400 mt-0.5">{displayEmail}</span>
              </div>
            </div>

            {/* Compacted secondary layout elements */}
            {!isBilling ? (
              <div className="flex flex-col gap-1">
                <Link
                  href="/dashboard/tienda"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-brand-ink-secondary dark:text-slate-200 hover:bg-brand-canvas-soft/60 dark:hover:bg-slate-800/60 transition-all duration-150 active:scale-[0.98] group select-none"
                >
                  <Store className="size-4 text-brand-primary dark:text-sky-400 group-hover:scale-110 transition-transform duration-200" />
                  <span>Tienda</span>
                </Link>

                <Link
                  href="/dashboard/cuenta"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-brand-ink-secondary dark:text-slate-200 hover:bg-brand-canvas-soft/60 dark:hover:bg-slate-800/60 transition-all duration-150 active:scale-[0.98] group select-none"
                >
                  <Receipt className="size-4 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform duration-200" />
                  <span>Mi Cuenta</span>
                </Link>

                <Link
                  href="/dashboard/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-brand-ink-secondary dark:text-slate-200 hover:bg-brand-canvas-soft/60 dark:hover:bg-slate-800/60 transition-all duration-150 active:scale-[0.98] group select-none"
                >
                  <Settings2 className="size-4 text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-200" />
                  <span>Ajustes</span>
                </Link>

                <Link
                  href="/dashboard/help"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-brand-ink-secondary dark:text-slate-200 hover:bg-brand-canvas-soft/60 dark:hover:bg-slate-800/60 transition-all duration-150 active:scale-[0.98] group select-none"
                >
                  <CircleHelp className="size-4 text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform duration-200" />
                  <span>Ayuda</span>
                </Link>

                <Link
                  href="/dashboard/search"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold text-brand-ink-secondary dark:text-slate-200 hover:bg-brand-canvas-soft/60 dark:hover:bg-slate-800/60 transition-all duration-150 active:scale-[0.98] group select-none"
                >
                  <div className="flex items-center gap-3">
                    <Search className="size-4 text-brand-primary dark:text-sky-400 group-hover:scale-110 transition-transform duration-200" />
                    <span>Buscar</span>
                  </div>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[9px] font-medium text-muted-foreground opacity-100 dark:border-slate-800">
                    <span className="text-[10px]">⌘</span>K
                  </kbd>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <Link
                  href={getHubUrl()}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-brand-ink-secondary dark:text-slate-200 hover:bg-brand-canvas-soft/60 dark:hover:bg-slate-800/60 transition-all duration-150 active:scale-[0.98] group select-none"
                >
                  <ArrowLeftRight className="size-4 text-brand-primary dark:text-sky-400 group-hover:scale-110 transition-transform duration-200" />
                  <span>Volver a Fintral Hub</span>
                </Link>

                <Link
                  href={getLink("/settings")}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-brand-ink-secondary dark:text-slate-205 hover:bg-brand-canvas-soft/60 dark:hover:bg-slate-800/60 transition-all duration-150 active:scale-[0.98] group select-none"
                >
                  <Settings2 className="size-4 text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-200" />
                  <span>Ajustes Facturación</span>
                </Link>
              </div>
            )}

            {/* Logout footer */}
            <div className="border-t border-brand-hairline dark:border-slate-800/65 pt-2">
              <Button
                variant="ghost"
                className="w-full h-10 py-2.5 px-4 rounded-xl text-sm font-semibold hover:bg-red-500/10 text-red-500 active:scale-[0.98] transition-all duration-100 flex items-center justify-center gap-2"
                onClick={() => {
                  setOpen(false)
                  clearCachedSession()
                  window.location.href = "/logout"
                }}
              >
                <LogOutIcon className="size-4" />
                <span>Cerrar sesión</span>
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
