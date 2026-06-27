"use client";

import { useCallback, useState } from "react";

export function useCustomerPortal() {
  const [loading, setLoading] = useState(false);

  const openPortal = useCallback(async (orgId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/paddle/customer-portal?org_id=${orgId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to create portal session");

      const data = await res.json();
      window.open(data.general_url, "_blank");
    } finally {
      setLoading(false);
    }
  }, []);

  return { openPortal, loading };
}
