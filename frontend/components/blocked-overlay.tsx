"use client";

import { useEffect, useState } from "react";
import {
  Lock,
  Building2,
  Users,
  LogOut,
  ArrowRight,
  RefreshCw,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listUserOrganizations, switchOrganization, UserOrg } from "@/lib/api/organizations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function BlockedOverlay() {
  const [blockedType, setBlockedType] = useState<"entity" | "user" | null>(null);
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // Listen to block events dispatched by the api client interceptor
  useEffect(() => {
    const handleEntityBlocked = () => {
      setBlockedType("entity");
      fetchOrgs();
    };

    const handleUserBlocked = () => {
      setBlockedType("user");
      fetchOrgs();
    };

    window.addEventListener("billing:entity-blocked", handleEntityBlocked);
    window.addEventListener("billing:user-blocked", handleUserBlocked);

    return () => {
      window.removeEventListener("billing:entity-blocked", handleEntityBlocked);
      window.removeEventListener("billing:user-blocked", handleUserBlocked);
    };
  }, []);

  const fetchOrgs = async () => {
    setLoadingOrgs(true);
    try {
      const list = await listUserOrganizations();
      setOrgs(list || []);
    } catch {
      // Silently fail or log
    } finally {
      setLoadingOrgs(false);
    }
  };

  const handleSwitch = async (orgId: string) => {
    setSwitchingId(orgId);
    try {
      await switchOrganization(orgId);
      toast.success("Cambiando de empresa...");
      window.location.href = "/dashboard/cuenta";
    } catch (err: any) {
      toast.error("No se pudo cambiar de empresa", { description: err.message });
      setSwitchingId(null);
    }
  };

  if (!blockedType) return null;

  const isEntity = blockedType === "entity";
  const Icon = isEntity ? Building2 : Users;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-200">
        
        {/* Lock / Warning Illustration */}
        <div className="relative mx-auto size-16 bg-red-500/10 dark:bg-red-500/5 rounded-2xl flex items-center justify-center">
          <Icon className="size-8 text-red-650 dark:text-red-400" />
          <div className="absolute -bottom-1 -right-1 bg-red-600 rounded-full p-1 border-2 border-white dark:border-slate-900">
            <Lock className="size-3.5 text-white" />
          </div>
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-brand-ink dark:text-white leading-tight">
            {isEntity ? "Empresa Bloqueada" : "Acceso de Usuario Inaccesible"}
          </h2>
          <p className="text-sm text-brand-ink-mute dark:text-slate-400 leading-relaxed">
            {isEntity ? (
              <>
                Esta empresa ha quedado bloqueada porque has superado el límite de entidades contratadas en tu plan. Elige otra empresa para seguir trabajando, o dirígete a la configuración de tu cuenta para ampliar tus límites.
              </>
            ) : (
              <>
                Tu usuario no puede acceder a esta organización en este momento porque se ha superado el límite de usuarios de este plan. Comunícate con el propietario de la organización o ingresa con una cuenta autorizada.
              </>
            )}
          </p>
        </div>

        {/* Switch organization list */}
        <div className="space-y-3 text-left">
          <p className="text-[10px] font-semibold text-brand-ink-mute dark:text-slate-500 uppercase tracking-wider pl-1">
            Cambiar a otra empresa activa
          </p>
          <div className="max-h-[160px] overflow-y-auto border border-brand-hairline dark:border-slate-800 rounded-xl divide-y divide-brand-hairline dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            {loadingOrgs ? (
              <div className="p-4 flex items-center justify-center text-xs text-brand-ink-mute dark:text-slate-500 gap-2">
                <RefreshCw className="size-3 animate-spin" /> Cargando empresas...
              </div>
            ) : orgs.length <= 1 ? (
              <div className="p-4 text-center text-xs text-brand-ink-mute dark:text-slate-500">
                No tienes otras empresas disponibles para cambiar.
              </div>
            ) : (
              orgs
                .filter((o) => !o.is_current)
                .map((org) => (
                  <button
                    key={org.id}
                    disabled={!!switchingId}
                    onClick={() => handleSwitch(org.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold hover:bg-slate-100/50 dark:hover:bg-slate-800/40 text-brand-ink dark:text-slate-300 transition-colors disabled:opacity-50"
                  >
                    <div className="min-w-0 text-left">
                      <p className="truncate font-medium">{org.name}</p>
                      {org.tax_id && <p className="text-[10px] text-brand-ink-mute dark:text-slate-500 font-normal">RNC {org.tax_id}</p>}
                    </div>
                    {switchingId === org.id ? (
                      <RefreshCw className="size-3.5 animate-spin text-brand-primary" />
                    ) : (
                      <ArrowRight className="size-3.5 text-brand-ink-mute group-hover:text-brand-primary transition-colors" />
                    )}
                  </button>
                ))
            )}
          </div>
        </div>

        {/* Buttons / Actions */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <Button
            onClick={() => {
              window.location.href = "/dashboard/cuenta?tab=statement";
            }}
            className="flex-1 h-11 text-xs font-bold gap-1.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-deep shadow-xs active:scale-[0.98] transition-all"
          >
            <CreditCard className="size-3.5" />
            Gestionar en Mi Cuenta
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/logout";
            }}
            className="h-11 text-xs font-semibold gap-1.5 rounded-xl border-brand-hairline text-brand-ink dark:text-slate-300 active:scale-[0.98] transition-all"
          >
            <LogOut className="size-3.5" />
            Cerrar Sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
