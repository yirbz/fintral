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

export function getUserDateFormat(): string {
  if (typeof window === "undefined") return "DD/MM/YYYY";
  try {
    const stored = localStorage.getItem("user_date_format");
    if (stored) return stored;
  } catch {}
  return "DD/MM/YYYY";
}

export function getUserCurrency(): string {
  if (typeof window === "undefined") return "DOP";
  try {
    const stored = localStorage.getItem("user_currency");
    if (stored) return stored;
  } catch {}
  return "DOP";
}

function formatDateWithPattern(
  date: Date,
  pattern: string,
  tz: string
): string {
  const day = date.toLocaleDateString("en-US", { timeZone: tz, day: "2-digit" });
  const month = date.toLocaleDateString("en-US", { timeZone: tz, month: "2-digit" });
  const year = date.toLocaleDateString("en-US", { timeZone: tz, year: "numeric" });
  const monthShort = date.toLocaleDateString(DEFAULT_LOCALE, { timeZone: tz, month: "short" });

  const monthNames = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  const mIdx = parseInt(month, 10) - 1;
  const mmm = monthShort.length <= 3
    ? monthShort.charAt(0).toUpperCase() + monthShort.slice(1, 3)
    : monthNames[mIdx] || monthShort;

  return pattern
    .replace("DD", day)
    .replace("MM", month)
    .replace("YYYY", year)
    .replace("MMM", mmm);
}

export function formatDate(
  value: string | Date | null | undefined,
  options?: { format?: Intl.DateTimeFormatOptions; tz?: string }
): string {
  if (!value) return "—";
  const tz = options?.tz || getUserTimezone();
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "—";

  const dateFormat = getUserDateFormat();

  // If custom format requested, use it
  if (!options?.format) {
    return formatDateWithPattern(date, dateFormat, tz);
  }

  return date.toLocaleDateString(DEFAULT_LOCALE, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options?.format,
  });
}

export function formatDateTime(
  value: string | Date | null | undefined,
  options?: { tz?: string }
): string {
  if (!value) return "—";
  const tz = options?.tz || getUserTimezone();
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "—";

  const dateFormat = getUserDateFormat();
  const timeFormat = localStorage.getItem("user_time_format") === "12h" ? "12h" : "24h";

  const datePart = formatDateWithPattern(date, dateFormat, tz);
  const timePart = date.toLocaleTimeString(DEFAULT_LOCALE, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: timeFormat === "12h",
  });

  return `${datePart} ${timePart}`;
}

export function formatPeriod(period: string): string {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const y = period.slice(0, 4);
  const m = parseInt(period.slice(4, 6), 10) - 1;
  return `${months[m] || "?"} ${y}`;
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatCurrency(
  n: number | null | undefined,
  currency?: string
): string {
  const cur = currency || getUserCurrency();
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 2,
  }).format(n ?? 0);
}
