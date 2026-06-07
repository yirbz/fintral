"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import {
  listUserOrganizations,
  switchOrganization,
  type UserOrg,
} from "@/lib/api/organizations";
import { toast } from "sonner";

const ORG_STORAGE_KEY = "fintral_active_org";

interface OrgContextValue {
  /** Currently selected org ID */
  activeOrgId: string | null;
  /** All orgs the user belongs to */
  userOrgs: UserOrg[];
  /** Whether org list is loading */
  isLoading: boolean;
  /** Switch to a different organization */
  switchOrg: (orgId: string) => Promise<void>;
  /** Refresh the org list */
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
  } catch {
    /* storage unavailable */
  }
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading: sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => {
    // On init, try stored value; fallback to session org
    const stored = loadStoredOrg();
    return stored || null;
  });

  // Once session loads, ensure we have an active org
  useEffect(() => {
    if (sessionLoading || !session) return;
    const sessionOrgId = session.organization?.id;
    if (!activeOrgId && sessionOrgId) {
      setActiveOrgId(sessionOrgId);
      saveStoredOrg(sessionOrgId);
    }
  }, [session, sessionLoading, activeOrgId]);

  // Fetch user's org list (always refetch when session changes)
  const orgsQuery = useQuery({
    queryKey: ["user-organizations"],
    queryFn: listUserOrganizations,
    enabled: !!session,
    staleTime: 30_000,
  });

  const userOrgs = orgsQuery.data ?? [];

  const switchOrg = useCallback(
    async (orgId: string) => {
      if (orgId === activeOrgId) return;
      try {
        const newSession = await switchOrganization(orgId);
        // Update stored org
        setActiveOrgId(orgId);
        saveStoredOrg(orgId);
        // Update session cache so the whole app re-renders with new org data
        queryClient.setQueryData(["session"], newSession);
        // Invalidate org-specific queries
        queryClient.invalidateQueries({
          queryKey: ["user-organizations"],
        });
        queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
        queryClient.invalidateQueries({ queryKey: ["pending-uploads"] });
        queryClient.invalidateQueries({ queryKey: ["pending-upload-count"] });
        toast.success(`Cambiaste a ${newSession.organization.name}`);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Error al cambiar de organización";
        toast.error(msg);
      }
    },
    [activeOrgId, queryClient]
  );

  const refreshOrgs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["user-organizations"] });
  }, [queryClient]);

  return (
    <OrgContext.Provider
      value={{
        activeOrgId,
        userOrgs,
        isLoading: orgsQuery.isLoading || sessionLoading,
        switchOrg,
        refreshOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}
