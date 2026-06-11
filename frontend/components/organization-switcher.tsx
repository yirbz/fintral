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
  const { activeOrgId, userOrgs, isLoading, switchOrg } = useOrg();
  const [open, setOpen] = useState(false);

  const currentOrg = userOrgs.find((o) => o.id === activeOrgId);
  const show = userOrgs.length > 0;

  // Show loading/skeleton while session is resolving active org
  if (!show) return null;
  if (isLoading || !activeOrgId) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground opacity-60"
        disabled
      >
        <Building2 className="size-3.5 shrink-0 animate-pulse text-primary/40" />
        <span className="max-w-[80px] truncate text-transparent bg-muted-foreground/20 rounded animate-pulse">
          Cargando
        </span>
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1.5 rounded-lg px-2 text-xs font-medium",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-muted/60 active:scale-[0.97]",
            "transition-all duration-150"
          )}
        >
          <Building2 className="size-3.5 shrink-0 text-primary/70" />
          <span className="max-w-[120px] truncate">
            {currentOrg?.name ?? "Seleccionar organización"}
          </span>
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
            const isCurrent = org.id === activeOrgId;
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
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
                  <Building2 className="size-3.5 text-muted-foreground" />
                </div>
                <div className="flex flex-1 flex-col min-w-0">
                  <span
                    className={cn(
                      "text-xs font-medium truncate",
                      isCurrent && "text-foreground"
                    )}
                  >
                    {org.name}
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
