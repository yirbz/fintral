import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/lib/api/settings";

export function useUserPreferences() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const getSettingValue = (category: string, key: string, defaultValue: string | number | boolean) => {
    if (!settings || !settings[category]) return defaultValue;
    const item = settings[category].find((s) => s.key === key);
    return item ? item.value : defaultValue;
  };

  const dateFormat = String(getSettingValue("preferences", "date_format", "DD/MM/YYYY"));
  const currency = String(getSettingValue("preferences", "currency", "DOP"));
  const timezone = String(getSettingValue("preferences", "timezone", "America/Santo_Domingo"));

  // Helper to format date strings/objects to preferred display format (default DD/MM/YYYY)
  const formatDate = (dateInput: string | Date | null | undefined): string => {
    if (!dateInput) return "";
    try {
      const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
      if (isNaN(d.getTime())) return "";

      const pad = (n: number) => String(n).padStart(2, "0");
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();

      // Simple mapping matching backend & preferences page formats (without time)
      if (dateFormat.startsWith("MM/DD")) {
        return `${month}/${day}/${year}`;
      } else if (dateFormat.startsWith("YYYY-MM")) {
        return `${year}-${month}-${day}`;
      } else {
        // Fallback or explicit DD/MM/YYYY
        return `${day}/${month}/${year}`;
      }
    } catch {
      return "";
    }
  };

  // Helper to format currency values
  const formatCurrency = (amount: number | null | undefined, customCurrency?: string): string => {
    const value = amount ?? 0;
    const curr = customCurrency || currency;
    try {
      return new Intl.NumberFormat("es-DO", {
        style: "currency",
        currency: curr,
      }).format(value);
    } catch {
      return `${curr} ${value.toFixed(2)}`;
    }
  };

  return {
    dateFormat,
    currency,
    timezone,
    formatDate,
    formatCurrency,
  };
}
