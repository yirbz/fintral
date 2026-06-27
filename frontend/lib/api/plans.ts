import { apiFetch } from "./client";

export interface PlanSummary {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  price_monthly: number;
  price_usd?: number | null;
  limits: Record<string, any>;
  features: Record<string, boolean>;
  is_enterprise: boolean;
  sort_order: number;
  soft_limit_enabled: boolean;
  addon_ecf_block_size: number;
  addon_ecf_block_price: number;
  addon_ai_block_size: number;
  addon_ai_block_price: number;
  addon_storage_block_mb: number;
  addon_storage_block_price: number;
  entity_slot_price: number;
  user_slot_price: number;
}

export interface AddonsSummary {
  ecf_blocks: number;
  ai_blocks: number;
  storage_blocks: number;
  extra_entities: number;
  billing_entities: number;
  ecf_block_size: number;
  ecf_block_price: number;
  ai_block_size: number;
  ai_block_price: number;
  storage_block_mb: number;
  storage_block_price: number;
  extra_entity_price: number;
  extra_billing_entity_price: number;
}

export interface SubscriptionSummary {
  id: string;
  organization_id: string;
  plan_id: string;
  plan_name: string | null;
  status: string;
  trial_remaining_days: number;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  limits: Record<string, any>;
  addons: AddonsSummary;
  auto_renew_addons: boolean;
}

export interface UsageSummary {
  cycle: number;
  ecf: { used: number; limit: number };
  ai_queries: { used: number; limit: number };
  ocr_docs: { used: number; limit: number };
  storage_mb: { used: number; limit: number };
  api_calls: { used: number; limit: number };
}

export interface FullUsageResponse {
  plan: PlanSummary | null;
  subscription: SubscriptionSummary | null;
  usage: UsageSummary | null;
  trial_remaining_days: number;
}

export interface PaymentProof {
  id: string;
  amount: number;
  currency: string;
  exchange_rate?: number | null;
  usd_amount?: number | null;
  plan_name: string;
  addons: Record<string, number> | null;
  status: "pending" | "verified" | "rejected";
  file_url: string;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
}

export interface DailyUsageBreakdown {
  date: string;
  ecf_count: number;
  ai_query_count: number;
  ocr_doc_count: number;
}

export interface StorageBreakdownItem {
  file_type: string;
  count: number;
  total_bytes: number;
}

export interface StorageItem {
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface UsageDailyResponse {
  cycle: number;
  daily: DailyUsageBreakdown[];
  storage_by_type: StorageBreakdownItem[];
  storage_items: StorageItem[];
  total_storage_bytes: number;
  total_storage_mb: number;
}

export async function getUsageDaily() {
  return apiFetch<UsageDailyResponse>("/api/plans/usage-daily");
}
export interface ExchangeRateResponse {
  rate: number;
  currency: string;
}

export async function getExchangeRate() {
  return apiFetch<ExchangeRateResponse>("/api/plans/exchange-rate");
}

export async function getPublicPlans() {
  return apiFetch<PlanSummary[]>("/api/plans/");
}

export async function getMyPlan() {
  return apiFetch<FullUsageResponse>("/api/plans/my");
}

export async function changePlan(planName: string) {
  return apiFetch<{ message: string; subscription_id: string }>("/api/plans/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_name: planName }),
  });
}

export async function purchaseAddon(addonType: string, quantity: number = 1) {
  return apiFetch<{ message: string; subscription_id: string }>("/api/plans/addon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addon_type: addonType, quantity }),
  });
}

export async function toggleAutoRenew(enabled: boolean) {
  return apiFetch<{ auto_renew_addons: boolean }>(`/api/plans/auto-renew-addons?enabled=${enabled}`, {
    method: "POST",
  });
}

export async function uploadPaymentProof(formData: FormData) {
  return apiFetch<PaymentProof>("/api/plans/payment-proof", {
    method: "POST",
    body: formData,
  });
}

export async function getPaymentProofs() {
  return apiFetch<PaymentProof[]>("/api/plans/payment-proofs");
}

// ── Cart types & API ──────────────────────────────────────

export interface CartItem {
  type: "plan_change" | "addon" | "renewal" | "overage" | "ecf_blocks" | "entity_slot" | "user_slot";
  plan_name?: string;
  addon_type?: string;
  quantity?: number;
  months?: number;
  price_cents: number;
  label?: string;
  organization_id?: string;
}

export interface CartBreakdownItem {
  type: string;
  label: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface CalculateCartResponse {
  items: CartBreakdownItem[];
  total: number;
  currency: string;
  item_count: number;
  months: number;
  discount: number;
  monthly_total: number;
}

export async function calculateCart(items: CartItem[]) {
  return apiFetch<CalculateCartResponse>("/api/plans/calculate-cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export interface PaymentProofWithItems extends PaymentProof {
  items: CartItem[] | null;
}

export interface BankDetails {
  bank_name: string;
  account_holder: string;
  account_number: string;
}

export async function getBankDetails() {
  return apiFetch<BankDetails>("/api/plans/bank-details");
}

export interface EcfBalanceResponse {
  organization_id: string;
  balance: number;
}

export async function getEcfBalance(orgId: string) {
  return apiFetch<EcfBalanceResponse>(`/api/organizations/${orgId}/ecf-balance`);
}

// ── Addon direct (post-pay, added to monthly statement) ──────

export interface AddonDirectResponse {
  success: boolean;
  charge_id: string;
  total_price_cents: number;
}

export async function purchaseAddonDirect(addonType: string, quantity: number = 1, label: string = "") {
  const formData = new FormData();
  formData.append("addon_type", addonType);
  formData.append("quantity", String(quantity));
  if (label) formData.append("label", label);
  return apiFetch<AddonDirectResponse>("/api/plans/addon-direct", {
    method: "POST",
    body: formData,
  });
}

export interface StatementCharge {
  id: string | null;
  charge_type: string;
  label: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  paid: boolean;
  created_at: string | null;
  is_recurring: boolean;
}

export interface StatementResponse {
  cycle: number;
  plan_name: string;
  plan_price_cents: number;
  charges: StatementCharge[];
  total_cents: number;
}

export async function getStatement(cycle?: number) {
  const params = cycle ? `?cycle=${cycle}` : "";
  return apiFetch<StatementResponse>(`/api/plans/statement${params}`);
}

export async function payStatement(cycle: number, paymentProofId: string) {
  const formData = new FormData();
  formData.append("cycle", String(cycle));
  formData.append("payment_proof_id", paymentProofId);
  return apiFetch<{ message: string; count: number }>("/api/plans/pay-statement", {
    method: "POST",
    body: formData,
  });
}

export async function getUnpaidPrevious() {
  return apiFetch<{ unpaid: boolean }>("/api/plans/unpaid-previous");
}
