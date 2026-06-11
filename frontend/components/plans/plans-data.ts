export type BillingPeriod = "1m" | "3m" | "12m";

export interface PlanFeature {
  text: string;
  included: boolean;
  subtext?: string;
}

export interface PlanTier {
  id: string;
  name: string;
  description: string;
  popular?: boolean;
  features: PlanFeature[];
  prices: Record<BillingPeriod, number>;
  highlightedFeature?: string;
}

export const BILLING_LABELS: Record<
  BillingPeriod,
  { label: string; suffix: string; discount: string }
> = {
  "1m": { label: "1 mes", suffix: "/mes", discount: "" },
  "3m": { label: "3 meses", suffix: "/mes", discount: "10% de ahorro" },
  "12m": { label: "12 meses", suffix: "/mes", discount: "20% de ahorro" },
};

export const BILLING_MULTIPLIER: Record<BillingPeriod, number> = {
  "1m": 1,
  "3m": 3,
  "12m": 12,
};

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "inicial",
    name: "Inicial",
    description:
      "Perfecto para independientes, contadores y pequeños negocios.",
    features: [
      {
        text: "100 facturas al mes",
        included: true,
        subtext: "Límite renovable mensualmente",
      },
      {
        text: "1 usuario",
        included: true,
        subtext: "Acceso individual seguro",
      },
      {
        text: "OCR básico",
        included: true,
        subtext: "Extracción digital de PDFs e imágenes",
      },
      {
        text: "Validación NCF contra DGII",
        included: true,
        subtext: "Consulta en línea con servidores DGII",
      },
      {
        text: "Reporte 606 manual",
        included: true,
        subtext: "Exportación a plantilla oficial de DGII",
      },
      {
        text: "Soporte por correo electrónico",
        included: true,
        subtext: "Atención técnica en menos de 24h",
      },
      {
        text: "WhatsApp Business Ingestion",
        included: false,
        subtext: "Subida de facturas vía chat",
      },
      {
        text: "API y Webhooks",
        included: false,
        subtext: "Integración con otros sistemas",
      },
      {
        text: "Integración con ERP",
        included: false,
        subtext: "QuickBooks, SAP y Dynamics",
      },
    ],
    prices: { "1m": 1500, "3m": 4050, "12m": 14400 },
  },
  {
    id: "profesional",
    name: "Profesional",
    description:
      "Para equipos en crecimiento que necesitan automatización e inteligencia.",
    popular: true,
    features: [
      {
        text: "500 facturas al mes",
        included: true,
        subtext: "Perfecto para negocios estables",
      },
      {
        text: "3 usuarios",
        included: true,
        subtext: "Espacios de trabajo colaborativos",
      },
      {
        text: "OCR avanzado + IA",
        included: true,
        subtext: "Procesamiento inteligente con visión artificial",
      },
      {
        text: "Validación NCF contra DGII",
        included: true,
        subtext: "Consulta automática en tiempo real",
      },
      {
        text: "Reporte 606 automático",
        included: true,
        subtext: "Generación instantánea sin digitar",
      },
      {
        text: "Soporte prioritario",
        included: true,
        subtext: "Atención rápida por chat y email",
      },
      {
        text: "WhatsApp Business Ingestion",
        included: true,
        subtext: "Tus clientes suben facturas vía chat",
      },
      {
        text: "API y Webhooks",
        included: true,
        subtext: "Automatización e integración de datos",
      },
      {
        text: "Integración con ERP",
        included: false,
        subtext: "QuickBooks, SAP y Dynamics",
      },
    ],
    highlightedFeature: "Popular",
    prices: { "1m": 3500, "3m": 9450, "12m": 33600 },
  },
  {
    id: "empresarial",
    name: "Empresarial",
    description:
      "Para grandes empresas que requieren procesar un volumen masivo y soporte dedicado.",
    features: [
      {
        text: "Facturas ilimitadas",
        included: true,
        subtext: "Procesa sin límites de volumen",
      },
      {
        text: "Usuarios ilimitados",
        included: true,
        subtext: "Gestión avanzada de roles y permisos",
      },
      {
        text: "OCR + AI Vision completo",
        included: true,
        subtext: "XML de e-CF, recibos arrugados y más",
      },
      {
        text: "Validación NCF contra DGII",
        included: true,
        subtext: "Monitoreo continuo de validez fiscal",
      },
      {
        text: "Reportes DGII (606/607/608)",
        included: true,
        subtext: "Formatos listos para la oficina virtual",
      },
      {
        text: "Soporte dedicado 24/7",
        included: true,
        subtext: "Ejecutivo de cuenta exclusivo para tu empresa",
      },
      {
        text: "WhatsApp Business Ingestion",
        included: true,
        subtext: "Canal multi-agente y automatizado",
      },
      {
        text: "API y Webhooks",
        included: true,
        subtext: "Acceso dedicado de alta velocidad",
      },
      {
        text: "Integración con ERP",
        included: true,
        subtext: "Conexión bidireccional nativa con ERPs",
      },
    ],
    prices: { "1m": 8000, "3m": 21600, "12m": 76800 },
  },
];
