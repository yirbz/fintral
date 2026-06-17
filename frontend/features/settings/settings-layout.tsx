"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Settings2,
  User,
  Building2,
  CreditCard,
  Globe,
  KeyRound,
  Users,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type SectionDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const SECTIONS: SectionDef[] = [
  { id: "profile", label: "Perfil", icon: User },
  { id: "organization", label: "Organización", icon: Building2 },
  { id: "team", label: "Equipo", icon: Users },
  { id: "preferences", label: "Preferencias", icon: Settings2 },
  { id: "password", label: "Contraseña", icon: KeyRound },
  { id: "integraciones", label: "Integraciones", icon: Globe },
  { id: "billing", label: "Facturación", icon: CreditCard },
  { id: "certification", label: "Certificación", icon: ShieldCheck },
];

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname.split("/").pop() ?? "profile";
  const session = useSession();
  const u = session.data?.user;
  const initials = (u?.full_name || "U").substring(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      {/* Compact header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-heading font-semibold tracking-tight text-foreground">
            Ajustes
          </h1>
          <p className="text-xs text-muted-foreground">
            Perfil, organización y preferencias del sistema.
          </p>
        </div>
        {u && (
          <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5">
            <Avatar className="size-6 rounded-md">
              <AvatarImage src={u.avatar_url || undefined} alt={u.full_name} />
              <AvatarFallback className="rounded-md text-[10px] font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="leading-tight hidden sm:block">
              <p className="text-xs font-medium text-foreground truncate max-w-[140px]">
                {u.full_name}
              </p>
              <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                {u.email}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[196px_1fr]">
        {/* Sidebar nav */}
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-px p-1.5">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = active === section.id;
              return (
                <Link
                  key={section.id}
                  href={`/dashboard/settings/${section.id}`}
                  className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Icon
                    className={`size-3.5 shrink-0 transition-colors ${
                      isActive
                        ? "text-primary-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  <span className="flex-1">{section.label}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {/* Content */}
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
