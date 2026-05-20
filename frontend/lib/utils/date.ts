/**
 * Centralized date formatting utilities.
 * All dates are stored as UTC in the backend.
 * Display is converted to the user's configured timezone.
 */

const DEFAULT_TZ = "America/Santo_Domingo";
const DEFAULT_LOCALE = "es-DO";

export function getUserTimezone(): string {
  if (typeof window === "undefined") return DEFAULT_TZ;
  try {
    const stored = localStorage.getItem("user_timezone");
    if (stored) return stored;
  } catch {}
  return DEFAULT_TZ;
}

export function saveUserTimezone(tz: string) {
  try {
    localStorage.setItem("user_timezone", tz);
  } catch {}
}

/**
 * Format a date string (ISO) or Date for display in the user's timezone.
 */
export function formatDate(
  value: string | Date | null | undefined,
  options?: { format?: Intl.DateTimeFormatOptions; tz?: string }
): string {
  if (!value) return "—";
  const tz = options?.tz || getUserTimezone();
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(DEFAULT_LOCALE, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options?.format,
  });
}

/**
 * Format a date for display with time.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  options?: { tz?: string }
): string {
  if (!value) return "—";
  const tz = options?.tz || getUserTimezone();
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(DEFAULT_LOCALE, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a month period label like "Mayo 2026".
 */
export function formatPeriod(period: string): string {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const y = period.slice(0, 4);
  const m = parseInt(period.slice(4, 6), 10) - 1;
  return `${months[m] || "?"} ${y}`;
}

/**
 * Current period in YYYYMM format.
 */
export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Format a currency amount in DOP.
 */
export function formatCurrency(
  n: number | null | undefined,
  currency = "DOP"
): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n ?? 0);
}
