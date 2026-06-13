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
      "Ideal para profesionales independientes y freelancers que buscan automatizar contabilidad. Permite facturar e-CF agregando organizaciones adicionales.",
    features: [
      {
        text: "Contabilidad, Reportes y e-CF",
        included: true,
        subtext:
          "Emisión de e-CF disponible mediante organizaciones adicionales",
      },
      {
        text: "50 documentos OCR al mes",
        included: true,
        subtext: "Extracción digital de facturas de compra",
      },
      {
        text: "Usuarios Ilimitados",
        included: true,
        subtext: "Invita a tu equipo sin costo extra",
      },
      {
        text: "Validación NCF contra DGII",
        included: true,
        subtext: "Consulta en línea con servidores DGII",
      },
      {
        text: "Reporte 606 automático",
        included: true,
        subtext: "Generación automática desde compras",
      },
      {
        text: "Soporte por correo electrónico",
        included: true,
        subtext: "Atención técnica en menos de 24h",
      },
      {
        text: "Agregar Org. Estándar",
        included: true,
        subtext: "+RD$ 600/mes por empresa extra",
      },
      {
        text: "Agregar Org. Emisora e-CF",
        included: true,
        subtext: "+RD$ 1,500/mes por empresa extra",
      },
      {
        text: "API y Webhooks",
        included: false,
      },
    ],
    prices: { "1m": 999, "3m": 2697, "12m": 9590 }, // $17 USD/mo (~999 RD$)
  },
  {
    id: "profesional",
    name: "Profesional",
    description:
      "Para PyMEs en crecimiento que necesitan emitir facturas electrónicas (e-CF) válidas ante la DGII.",
    popular: true,
    features: [
      {
        text: "Emisión e-CF DGII",
        included: true,
        subtext: "Certificación e integración completa",
      },
      {
        text: "500 facturas electrónicas/mes",
        included: true,
        subtext: "Excedente a solo RD$ 9.00 / e-CF",
      },
      {
        text: "500 documentos OCR al mes",
        included: true,
        subtext: "Procesamiento automático inteligente con IA",
      },
      {
        text: "Usuarios Ilimitados",
        included: true,
        subtext: "Acceso colaborativo compartido",
      },
      {
        text: "Reporte 606 automático",
        included: true,
        subtext: "Generación instantánea sin digitar",
      },
      {
        text: "WhatsApp Ingestion",
        included: true,
        subtext: "Envío de facturas por chat",
      },
      {
        text: "API y Webhooks",
        included: true,
        subtext: "Integración de sistemas externos",
      },
      {
        text: "Agregar Org. Estándar",
        included: true,
        subtext: "+RD$ 600/mes por empresa extra",
      },
      {
        text: "Agregar Org. Emisora e-CF",
        included: true,
        subtext: "+RD$ 1,500/mes por empresa extra",
      },
    ],
    highlightedFeature: "Recomendado",
    prices: { "1m": 2999, "3m": 8097, "12m": 28790 }, // $50 USD/mo (~2999 RD$)
  },
  {
    id: "despacho",
    name: "Despacho Contable",
    description:
      "Para contadores independientes y firmas que gestionan múltiples clientes de forma centralizada.",
    features: [
      {
        text: "Dashboard Multi-Entidad",
        included: true,
        subtext: "Monitorea toda tu cartera en un solo lugar",
      },
      {
        text: "Usuarios Ilimitados",
        included: true,
        subtext: "Para staff de la firma y clientes",
      },
      {
        text: "1,000 documentos OCR al mes",
        included: true,
        subtext: "Pool de procesamiento compartido",
      },
      {
        text: "500 e-CF en org. principal",
        included: true,
        subtext: "Para la facturación de tu firma",
      },
      {
        text: "Reportes DGII (606/607/608)",
        included: true,
        subtext: "Formatos automáticos listos para enviar",
      },
      {
        text: "Agregar Org. Estándar",
        included: true,
        subtext: "+RD$ 600/mes por empresa extra",
      },
      {
        text: "Agregar Org. Emisora e-CF",
        included: true,
        subtext: "+RD$ 1,500/mes por empresa extra",
      },
      {
        text: "Soporte prioritario por WhatsApp",
        included: true,
        subtext: "Respuesta garantizada",
      },
      {
        text: "Integración con ERPs",
        included: true,
        subtext: "QuickBooks, SAP y Odoo",
      },
    ],
    prices: { "1m": 7999, "3m": 21597, "12m": 76790 }, // $135 USD/mo (~7999 RD$)
  },
];
