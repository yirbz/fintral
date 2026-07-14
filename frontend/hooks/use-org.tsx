"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, saveSession } from "@/hooks/use-session";
import {
  listUserOrganizations,
  switchOrganization,
  type UserOrg,
} from "@/lib/api/organizations";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

const ORG_STORAGE_KEY = "fintral_active_org";

interface OrgContextValue {
  activeOrgId: string;
  userOrgs: UserOrg[];
  isLoading: boolean;
  currentOrg: UserOrg | undefined;
  switchOrg: (orgId: string) => Promise<void>;
  refreshOrgs: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error("useOrg must be used within an OrgProvider");
  }
  return ctx;
}

function loadStoredOrg(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveStoredOrg(orgId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ORG_STORAGE_KEY, orgId);
    document.cookie = `fintral_active_org=${orgId}; path=/; max-age=86400; SameSite=Lax`;
  } catch {
    /* storage unavailable */
  }
}

function OrgLoadingFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Building2 className="size-8 animate-pulse text-primary/40" />
        <span className="text-sm text-muted-foreground animate-pulse">
          Cargando...
        </span>
      </div>
    </div>
  );
}

function isOnPublicPage(): boolean {
  if (typeof window === "undefined") return true;
  const path = window.location.pathname;
  return (
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/logout") ||
    path.startsWith("/signup") ||
    path.startsWith("/plans") ||
    path.startsWith("/upload/public") ||
    path.startsWith("/forgot") ||
    path.startsWith("/docs") ||
    path.startsWith("/verify") ||
    path.startsWith("/accept-invite")
  );
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  // ── All hooks first (unconditional, per Rules of Hooks) ──
  const [mounted, setMounted] = useState(false);
  const { data: session, isLoading: sessionLoading } = useSession();
  const queryClient = useQueryClient();

  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => {
    return loadStoredOrg();
  });

  const { data: orgsQuery_data, isLoading: orgsQuery_isLoading } = useQuery<UserOrg[]>({
    queryKey: ["user-organizations"],
    queryFn: () => listUserOrganizations(),
    enabled: !!session && mounted,
    staleTime: 30_000,
  });

  const userOrgs = useMemo(() => orgsQuery_data ?? [], [orgsQuery_data]);

  // Resolve active org: validate stored against actual orgs → session → first org → never null
  useEffect(() => {
    if (sessionLoading || !session || orgsQuery_isLoading) return;

    // Only trust stored ID if it actually exists in the user's org list
    const storedIsValid = activeOrgId && userOrgs.some((o) => o.id === activeOrgId);

    const resolvedId =
      (storedIsValid ? activeOrgId : null)
      ?? session.organization?.id
      ?? userOrgs[0]?.id;

    if (resolvedId && resolvedId !== activeOrgId) {
      setActiveOrgId(resolvedId);
      saveStoredOrg(resolvedId);
    }
  }, [session, sessionLoading, activeOrgId, userOrgs, orgsQuery_isLoading]);

  // After hydration, enable client-side data fetching
  useEffect(() => {
    setMounted(true);
  }, []);

  const currentOrg = useMemo(
    () => userOrgs.find((o) => o.id === activeOrgId),
    [userOrgs, activeOrgId]
  );

  const switchOrg = useCallback(
    async (orgId: string) => {
      if (orgId === activeOrgId) return;
      try {
        const session = await switchOrganization(orgId);
        saveSession(session);
        saveStoredOrg(orgId);
        window.location.reload();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Error al cambiar de organización";
        toast.error(msg);
      }
    },
    [activeOrgId]
  );

  const refreshOrgs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["user-organizations"] });
  }, [queryClient]);

  const value = useMemo<OrgContextValue>(
    () => ({
      activeOrgId: activeOrgId!,
      userOrgs,
      isLoading: false,
      currentOrg,
      switchOrg,
      refreshOrgs,
    }),
    [activeOrgId, userOrgs, currentOrg, switchOrg, refreshOrgs]
  );

  // ── Early returns (after all hooks) ──

  // SSR safety: always render fallback during SSR and hydration
  if (!mounted) {
    return <OrgLoadingFallback />;
  }

  // Loading session
  if (!isOnPublicPage() && (sessionLoading || !session)) {
    return <OrgLoadingFallback />;
  }

  const isReady = !!activeOrgId;

  // No orgs at all
  if (!isOnPublicPage() && !isReady && userOrgs.length === 0) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <Building2 className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No tienes acceso a ninguna organización.
          </p>
        </div>
      </div>
    );
  }

  // Still resolving org
  if (!isOnPublicPage() && !isReady && orgsQuery_isLoading) {
    return <OrgLoadingFallback />;
  }

  // Final guard: auto-select first org if somehow still null
  if (!isOnPublicPage() && !isReady && userOrgs.length > 0) {
    const fallbackId = userOrgs[0].id;
    setActiveOrgId(fallbackId);
    saveStoredOrg(fallbackId);
    return <OrgLoadingFallback />;
  }

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  );
}
