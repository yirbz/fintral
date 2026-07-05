/**
 * ──────────────────────────────────────────────
 *  Plan tiers & billing configuration
 * ──────────────────────────────────────────────
 *
 * Business model (as of Q2 2026):
 *   Plans cover platform features only (AI, OCR, storage, DGII reports).
 *   Each plan includes a number of free entities (1 / 5 / 20).
 *   Additional entities beyond the limit cost RD$ 600/mo each.
 *   e-CF documents are NOT included in any plan — each entity purchases
 *   its own document blocks independently (100 e-CF per block, RD$ 950).
 *   The entity (facturador) manages and pays for its own e-CF; the
 *   accountant (contable) pays only for the plan subscription + extra entities + extra users.
 *
 * Discount tiers for multi-month commitments:
 *   1 mes — 0%    3 meses — 3%    6 meses — 5%    12 meses — 10%
 *
 * Prices shown below are total amounts after discount for the
 * selected billing period (e.g. "12m" = total for 12 months at 10% off).
 */

export type BillingPeriod = "1m" | "3m" | "6m" | "12m";

export interface PlanFeature {
  /** Feature display text */
  text: string;
  /** Whether this feature is available on the plan */
  included: boolean;
  /** Optional supplementary detail (pricing, limitations, etc.) */
  subtext?: string;
}

export interface PlanTier {
  /** Unique identifier matching the backend plan name */
  id: string;
  /** Short display name */
  name: string;
  /** Marketing description */
  description: string;
  /** Whether the card should be visually highlighted as "most popular" */
  popular?: boolean;
  /** List of features shown in the card */
  features: PlanFeature[];
  /**
   * Total prices per billing period (after discount).
   * Keyed by BillingPeriod. Example: prices["12m"] = total for 12 months.
   */
  prices: Record<BillingPeriod, number>;
  /** Badge label displayed above the card (e.g. "Recomendado") */
  highlightedFeature?: string;
}

/** Labels, suffixes and discount badges for each billing period toggle */
export const BILLING_LABELS: Record<BillingPeriod, { label: string; suffix: string; discount: string }> = {
  "1m": { label: "1 mes",      suffix: "/mes",            discount: "" },
  "3m": { label: "3 meses",    suffix: "/mes",            discount: "3% ahorro" },
  "6m": { label: "6 meses",    suffix: "/mes",            discount: "5% ahorro" },
  "12m":{ label: "12 meses",   suffix: "/mes",            discount: "10% ahorro" },
};

/** Multiplier to convert monthly price to total for each billing period */
export const BILLING_MULTIPLIER: Record<BillingPeriod, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

/**
 * Plan definitions.
 *
 * @note Each plan includes N free entities (1 / 5 / 20) and N free users (3 / 10 / unlimited). Beyond that,
 *       additional entities cost RD$ 600/mo each and additional users cost RD$ 300/mo each.
 *       e-CF documents are NOT included in any plan — each entity purchases
 *       its own document blocks from the store independently.
 *       The entity (facturador) pays for its own e-CF; the accountant
 *       (contable) pays for the plan subscription + extra entity slots + extra user slots.
 */
export const PLAN_TIERS: PlanTier[] = [
  {
    id: "inicial",
    name: "Inicial",
    description:
      "Para profesionales independientes y freelancers que buscan automatizar su contabilidad con herramientas de IA.",
    features: [
      {
        text: "Contabilidad y reportes DGII",
        included: true,
        subtext: "Reportes 606 automáticos desde compras",
      },
      {
        text: "50 documentos OCR al mes",
        included: true,
        subtext: "Extracción digital de facturas de compra con IA",
      },
      {
        text: "150 consultas de IA al mes",
        included: true,
        subtext: "Consultas inteligentes para procesamiento y análisis",
      },
      {
        text: "500 MB de almacenamiento",
        included: true,
      },
      {
        text: "Validación NCF contra DGII",
        included: true,
        subtext: "Consulta en línea con servidores de la DGII",
      },
      {
        text: "e-CF mediante bloques",
        included: true,
        subtext: "Compra separada — desde RD$ 950 / 100 documentos",
      },
      {
        text: "Hasta 3 usuarios incluidos",
        included: true,
        subtext: "Usuarios adicionales a RD$ 300/mes c/u",
      },
      {
        text: "1 entidad gratis incluida",
        included: true,
        subtext: "Entidades adicionales a RD$ 600/mes c/u. Cada entidad paga sus propios e-CF.",
      },
      {
        text: "Soporte por correo electrónico",
        included: true,
        subtext: "Atención técnica en menos de 24h",
      },
      {
        text: "API y Webhooks",
        included: false,
      },
    ],
    prices: { "1m": 999, "3m": 2907, "6m": 5694, "12m": 10789 },
  },
  {
    id: "profesional",
    name: "Profesional",
    description:
      "Para PyMEs en crecimiento que necesitan emitir facturas electrónicas (e-CF) válidas ante la DGII con automatización fiscal completa.",
    popular: true,
    features: [
      {
        text: "Emisión e-CF DGII",
        included: true,
        subtext: "Certificación e integración completa con la DGII",
      },
      {
        text: "100% documentos e-CF vía bloques",
        included: true,
        subtext: "Compra separada — desde RD$ 950 / 100 documentos (RD$ 9.50 c/u)",
      },
      {
        text: "500 documentos OCR al mes",
        included: true,
        subtext: "Procesamiento automático inteligente con IA",
      },
      {
        text: "1,000 consultas de IA al mes",
        included: true,
        subtext: "Consultas avanzadas de IA para análisis fiscal",
      },
      {
        text: "5 GB de almacenamiento",
        included: true,
      },
      {
        text: "Reportes DGII (606/607/608)",
        included: true,
        subtext: "Generación instantánea sin digitar",
      },
      {
        text: "WhatsApp Ingestion",
        included: true,
        subtext: "Envía facturas por chat y se procesan automáticamente",
      },
      {
        text: "Hasta 10 usuarios incluidos",
        included: true,
        subtext: "Usuarios adicionales a RD$ 300/mes c/u",
      },
      {
        text: "5 entidades gratis incluidas",
        included: true,
        subtext: "Entidades adicionales a RD$ 600/mes c/u. Cada entidad paga sus propios e-CF.",
      },
      {
        text: "API y Webhooks",
        included: true,
        subtext: "Integración con sistemas externos",
      },
    ],
    highlightedFeature: "Recomendado",
    prices: { "1m": 2999, "3m": 8727, "6m": 17094, "12m": 32389 },
  },
  {
    id: "despacho",
    name: "Despacho Contable",
    description:
      "Para firmas de contabilidad, auditores y profesionales que gestionan múltiples clientes de forma centralizada.",
    features: [
      {
        text: "Dashboard multi-entidad",
        included: true,
        subtext: "Monitorea toda tu cartera en un solo lugar",
      },
      {
        text: "Usuarios ilimitados incluidos",
        included: true,
        subtext: "Sin límite de usuarios",
      },
      {
        text: "1,000 documentos OCR al mes",
        included: true,
        subtext: "Pool de procesamiento compartido entre entidades",
      },
      {
        text: "10,000 consultas de IA al mes",
        included: true,
        subtext: "Consultas ilimitadas de IA para toda la firma",
      },
      {
        text: "25 GB de almacenamiento",
        included: true,
      },
      {
        text: "API y Webhooks",
        included: true,
        subtext: "Integración completa con sistemas externos",
      },
      {
        text: "Historial multi-empresa",
        included: true,
        subtext: "Consulta cruzada entre todas tus entidades",
      },
      {
        text: "Generación batch de e-CF",
        included: true,
        subtext: "Emisión masiva de comprobantes electrónicos",
      },
      {
        text: "SLA",
        included: true,
        subtext: "Acuerdo de nivel de servicio garantizado",
      },
      {
        text: "e-CF por bloques — cada entidad con su saldo",
        included: true,
        subtext: "Compra independiente desde el store, cada entidad gestiona su presupuesto",
      },
      {
        text: "Reportes DGII (606/607/608)",
        included: true,
        subtext: "Formatos automáticos listos para enviar",
      },
      {
        text: "20 entidades gratis incluidas",
        included: true,
        subtext: "Entidades adicionales a RD$ 600/mes c/u. Cada entidad paga sus propios e-CF con saldo independiente.",
      },
      {
        text: "Soporte prioritario por WhatsApp",
        included: true,
        subtext: "Respuesta garantizada en menos de 4h",
      },
      {
        text: "Integración con ERPs",
        included: true,
        subtext: "QuickBooks, SAP y Odoo",
      },
    ],
    prices: { "1m": 7999, "3m": 23277, "6m": 45594, "12m": 86389 },
  },
];
