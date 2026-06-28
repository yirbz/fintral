"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Building2, Plus } from "lucide-react";
import { useOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Admin",
  member: "Miembro",
  viewer: "Observador",
};

export function OrganizationSwitcher() {
  const { currentOrg, activeOrgId, userOrgs, switchOrg } = useOrg();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1.5 rounded-lg px-2 text-xs font-medium",
            currentOrg?.is_deleted
              ? "text-destructive hover:text-destructive hover:bg-destructive/5"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            "active:scale-[0.97] transition-all duration-150"
          )}
        >
          <Building2 className={cn("size-3.5 shrink-0", currentOrg?.is_deleted ? "text-destructive/70" : "text-primary/70")} />
          <span className="max-w-[120px] truncate">
            {currentOrg?.name ?? activeOrgId.slice(0, 8)}
          </span>
          {currentOrg?.is_deleted && (
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-1 py-0.5 text-[8px] font-semibold text-destructive leading-none border border-destructive/10 animate-pulse">
              Eliminada
            </span>
          )}
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground/50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[240px]"
        align="start"
        sideOffset={6}
      >
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
          Organizaciones
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {userOrgs.map((org) => {
            const isCurrent = org.id === currentOrg?.id;
            return (
              <DropdownMenuItem
                key={org.id}
                onClick={() => {
                  if (!isCurrent) {
                    switchOrg(org.id);
                  }
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2.5 py-2 px-2 cursor-pointer",
                  isCurrent && "bg-primary/5"
                )}
              >
                <div className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40",
                  org.is_deleted ? "border-destructive/20 text-destructive" : "border-border/60 text-muted-foreground"
                )}>
                  <Building2 className="size-3.5" />
                </div>
                <div className="flex flex-1 flex-col min-w-0">
                  <span
                    className={cn(
                      "text-xs font-medium truncate flex items-center gap-1.5",
                      isCurrent && "text-foreground",
                      org.is_deleted && "text-muted-foreground/75"
                    )}
                  >
                    {org.name}
                    {org.is_deleted && (
                      <span className="inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive leading-none border border-destructive/10">
                        Eliminada
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {ROLE_LABELS[org.role] ?? org.role}
                    {org.tax_id && ` · ${org.tax_id}`}
                  </span>
                </div>
                {isCurrent && (
                  <Check className="size-3.5 shrink-0 text-primary" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href="/dashboard/settings/organization"
            className="flex items-center gap-2 py-2 px-2 cursor-pointer text-xs"
          >
            <Plus className="size-3.5" />
            Gestionar organizaciones
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
