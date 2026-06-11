"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

export interface NavDocumentItem {
  name: string
  url?: string
  icon: React.ReactNode
  children?: {
    name: string
    url: string
    icon: React.ReactNode
  }[]
}

export function NavDocuments({
  items,
}: {
  items: NavDocumentItem[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Documentos</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          if (item.children) {
            return <NavDocumentCollapsible key={item.name} item={item} pathname={pathname} />
          }
          return (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton asChild>
                <Link href={item.url!}>
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavDocumentCollapsible({
  item,
  pathname,
}: {
  item: NavDocumentItem
  pathname: string
}) {
  const isActive = item.children?.some((c) => pathname.startsWith(c.url)) ?? false
  const [open, setOpen] = useState(isActive)

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.name} isActive={isActive}>
            {item.icon}
            <span>{item.name}</span>
            <ChevronRight className={`ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children!.map((child) => (
              <SidebarMenuSubItem key={child.name}>
                <SidebarMenuSubButton asChild isActive={pathname === child.url}>
                  <Link href={child.url}>
                    {child.icon}
                    <span>{child.name}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}
