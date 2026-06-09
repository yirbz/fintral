export type BillingPeriod = "1m" | "3m" | "12m"

export interface PlanFeature {
  text: string
  included: boolean
}

export interface PlanTier {
  id: string
  name: string
  description: string
  popular?: boolean
  features: PlanFeature[]
  prices: Record<BillingPeriod, number>
  highlightedFeature?: string
}

export const BILLING_LABELS: Record<BillingPeriod, { label: string; suffix: string; discount: string }> = {
  "1m": { label: "1 mes", suffix: "/mes", discount: "" },
  "3m": { label: "3 meses", suffix: "/mes", discount: "10% de ahorro" },
  "12m": { label: "12 meses", suffix: "/mes", discount: "20% de ahorro" },
}

export const BILLING_MULTIPLIER: Record<BillingPeriod, number> = {
  "1m": 1,
  "3m": 3,
  "12m": 12,
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "inicial",
    name: "Inicial",
    description: "Perfecto para freelancers y contadores independientes.",
    features: [
      { text: "100 facturas al mes", included: true },
      { text: "1 usuario", included: true },
      { text: "OCR básico", included: true },
      { text: "Validación NCF contra DGII", included: true },
      { text: "Reporte 606 manual", included: true },
      { text: "Soporte por correo electrónico", included: true },
      { text: "WhatsApp Business", included: false },
      { text: "API y Webhooks", included: false },
      { text: "Integración con ERP", included: false },
    ],
    prices: { "1m": 1500, "3m": 4050, "12m": 14400 },
  },
  {
    id: "profesional",
    name: "Profesional",
    description: "Para equipos en crecimiento que necesitan automatización real.",
    popular: true,
    features: [
      { text: "500 facturas al mes", included: true },
      { text: "3 usuarios", included: true },
      { text: "OCR avanzado + IA", included: true },
      { text: "Validación NCF contra DGII", included: true },
      { text: "Reporte 606 automático", included: true },
      { text: "Soporte prioritario", included: true },
      { text: "WhatsApp Business", included: true },
      { text: "API y Webhooks", included: true },
      { text: "Integración con ERP", included: false },
    ],
    highlightedFeature: "El plan más popular",
    prices: { "1m": 3500, "3m": 9450, "12m": 33600 },
  },
  {
    id: "empresarial",
    name: "Empresarial",
    description: "Para empresas que necesitan procesar alto volumen de facturas.",
    features: [
      { text: "Facturas ilimitadas", included: true },
      { text: "Usuarios ilimitados", included: true },
      { text: "OCR + AI Vision completo", included: true },
      { text: "Validación NCF contra DGII", included: true },
      { text: "Reportes DGII (606/607/608)", included: true },
      { text: "Soporte dedicado 24/7", included: true },
      { text: "WhatsApp Business", included: true },
      { text: "API y Webhooks", included: true },
      { text: "Integración con ERP", included: true },
    ],
    prices: { "1m": 8000, "3m": 21600, "12m": 76800 },
  },
]
