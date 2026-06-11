"use client"

import { useEffect, useState } from "react"
import { useSession, clearCachedSession } from "@/hooks/use-session"

import {
  Avatar, AvatarFallback, AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"
import { EllipsisVerticalIcon, CircleUserRoundIcon, BellIcon, LogOutIcon, Settings2 } from "lucide-react"
import Link from "next/link"

export function NavUser({ user }: { user: { name: string; email: string; avatar: string } }) {
  const { isMobile } = useSidebar()
  const { data: session, isLoading } = useSession()
  const [displayName, setDisplayName] = useState(user.name)
  const [displayEmail, setDisplayEmail] = useState(user.email)

  useEffect(() => {
    if (session?.user?.full_name) setDisplayName(session.user.full_name)
    if (session?.user?.email) setDisplayEmail(session.user.email)
  }, [session])

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user.avatar} alt={displayName} />
                <AvatarFallback className="rounded-lg">{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
              </div>
              <EllipsisVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={displayName} />
                  <AvatarFallback className="rounded-lg">{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="flex items-center gap-2">
                  <CircleUserRoundIcon className="size-4" />
                  Perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="flex items-center gap-2">
                  <Settings2 className="size-4" />
                  Ajustes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="flex items-center gap-2">
                  <BellIcon className="size-4" />
                  Notificaciones
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { clearCachedSession(); window.location.href = "/logout"; }}>
              <LogOutIcon className="size-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
