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
  addon_ocr_block_size: number;
  addon_ocr_block_price: number;
  entity_slot_price: number;
  user_slot_price: number;
}

export interface AddonsSummary {
  ecf_blocks: number;
  ai_blocks: number;
  ocr_blocks: number;
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
  payment_method?: string | null;
  lago_subscription_id?: string | null;
  lago_customer_id?: string | null;
  lago_plan_code?: string | null;
  mio_customer_token?: string | null;
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
  items?: CartItem[] | null;
  status: "pending" | "verified" | "rejected";
  file_url: string;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  organization_id?: string;
  organization_name?: string | null;
  scope?: "user" | "org";
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

export interface UserSubscriptionResponse {
  in_grace_period?: boolean;
  subscription: {
    id: string;
    status: string;
    plan_code: string | null;
    plan_name: string | null;
    payment_method: string | null;
    auto_renew: boolean;
    trial_ends_at: string | null;
    trial_remaining_days: number;
    billing_cycle_start: string | null;
    billing_cycle_end: string | null;
    canceled_at: string | null;
    lago_subscription_id: string | null;
    lago_customer_id: string | null;
    card_info?: {
      brand: string;
      last4: string;
      expiry_month?: number | null;
      expiry_year?: number | null;
    } | null;
    grace_hours?: number | null;
  } | null;
  plan: {
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
  } | null;
  has_active_subscription: boolean;
}

export async function getMyUserSubscription() {
  return apiFetch<UserSubscriptionResponse>("/api/me/subscription");
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
  type: "plan_change" | "addon" | "renewal" | "overage" | "ecf_blocks" | "ocr_blocks" | "entity_slot" | "user_slot";
  plan_name?: string;
  addon_type?: string;
  quantity?: number;
  months?: number;
  price_cents: number;
  label?: string;
  organization_id?: string;
  target_org_id?: string;
}

export interface CartBreakdownItem {
  type: string;
  label: string;
  quantity: number;
  unit_price: number;
  total: number;
  prorated?: boolean;
  days_remaining?: number;
  cycle_days?: number;
  original_unit_price?: number;
}

export interface CalculateCartResponse {
  items: CartBreakdownItem[];
  total: number;
  currency: string;
  item_count: number;
  months: number;
  discount: number;
  monthly_total: number;
  has_prorated_items?: boolean;
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

export interface ProcessCartResponse {
  subscription_id?: string;
  payment_method: string;
  checkout_url?: string;
  order_uuid?: string;
  total_cents?: number;
  fee_cents?: number;
  total_with_fee?: number;
  status?: string;
}

/** Process a complete mixed cart (plan + addons + ecf) through Lago v2 */
export async function processCart(
  items: CartItem[],
  paymentMethod: "card" | "transfer",
  idempotencyKey?: string
): Promise<ProcessCartResponse> {
  return apiFetch<ProcessCartResponse>("/api/plans/checkout/process-cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      payment_method: paymentMethod,
      idempotency_key: idempotencyKey || crypto.randomUUID(),
    }),
  });
}

export interface PreviewPlanChangeResponse {
  is_new: boolean;
  current_plan?: string;
  new_plan?: string;
  price_cents?: number;
  price_dop?: number;
  preview?: any;
  note?: string;
}

/** Preview a plan change with Lago proration */
export async function previewPlanChange(
  planName: string,
  commitmentMonths?: number
): Promise<PreviewPlanChangeResponse> {
  return apiFetch<PreviewPlanChangeResponse>("/api/plans/preview-change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_name: planName,
      commitment_months: commitmentMonths || 1,
    }),
  });
}

export interface NextBillingInfoResponse {
  has_subscription: boolean;
  next_billing_date?: string;
  estimated_amount_cents?: number;
  plan_name?: string;
}

/** Get next billing info */
export async function getNextBillingInfo(): Promise<NextBillingInfoResponse> {
  return apiFetch<NextBillingInfoResponse>("/api/plans/next-billing");
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
  paid_at: string | null;
  created_at: string | null;
  is_recurring: boolean;
}

export interface StatementResponse {
  cycle: number;
  plan_name: string;
  plan_price_cents: number;
  pending_plan_name?: string | null;
  pending_plan_price_cents?: number | null;
  next_billing_date?: string | null;
  in_grace_period?: boolean;
  recurring?: {
    items: {
      type: string;
      label: string;
      price_cents: number;
      quantity: number;
      pending_cancel?: number;
      original_quantity?: number;
    }[];
    total_cents: number;
  };
  charges: StatementCharge[];
  total_cents: number;
  paid_total_cents: number;
  billing_org_id?: string;
  addon_detail?: {
    entity_slot: {
      total: number;
      user_level_slots: number;
      orgs: { org_id: string; org_name: string; tax_id: string | null; role: string; slots: number }[];
      pending_cancel?: number;
    };
    user_slot: {
      total: number;
      orgs: { org_id: string; org_name: string; tax_id: string | null; role: string; slots: number }[];
      pending_cancel?: number;
    };
    ai: { total_blocks: number; org_id: string | null; pending_cancel?: number };
    ocr: { total_blocks: number; org_id: string | null; pending_cancel?: number };
    storage: { total_blocks: number; org_id: string | null; pending_cancel?: number };
  };
}

export async function getStatement(cycle?: number) {
  const params = cycle ? `?cycle=${cycle}` : "";
  return apiFetch<StatementResponse>(`/api/plans/statement${params}`);
}

export async function payStatement(cycle: number, paymentProofId: string, months: number = 1) {
  const formData = new FormData();
  formData.append("cycle", String(cycle));
  formData.append("payment_proof_id", paymentProofId);
  formData.append("months", String(months));
  return apiFetch<{ message: string; count: number }>("/api/plans/pay-statement", {
    method: "POST",
    body: formData,
  });
}

export async function payStatementCard(cycle: number, months: number = 1) {
  return apiFetch<{ payment_method: string; checkout_url: string; order_uuid: string }>("/api/plans/pay-statement/card", {
    method: "POST",
    body: JSON.stringify({ cycle, months }),
  });
}

export async function setStatementPlanChange(planName: string | null, cycle?: number) {
  return apiFetch<StatementResponse>("/api/plans/statement/plan-change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_name: planName, cycle }),
  });
}

export async function cancelAddon(
  addonType: "entity_slot" | "user_slot" | "ai" | "ocr" | "storage",
  quantity: number = 1,
) {
  return apiFetch<{ addon_type: string; cancelled: number; remaining: number }>(
    `/api/plans/addon?addon_type=${addonType}&quantity=${quantity}`,
    { method: "DELETE" },
  );
}

export async function reactivateAddon(
  addonType: "entity_slot" | "user_slot" | "ai" | "ocr" | "storage",
  quantity: number = 1,
) {
  return apiFetch<{ addon_type: string; reactivated: number; pending_cancel: number }>(
    `/api/plans/addon/reactivate?addon_type=${addonType}&quantity=${quantity}`,
    { method: "POST" },
  );
}

export async function getUnpaidPrevious() {
  return apiFetch<{ unpaid: boolean }>("/api/plans/unpaid-previous");
}

// ── User subscription management & Refunds ──────────────────────────

export async function toggleSubscriptionAutoRenew(enabled: boolean) {
  return apiFetch<{ enabled: boolean; message: string }>("/api/plans/subscription/auto-renew", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export async function cancelUserSubscription() {
  return apiFetch<{ message: string }>("/api/plans/subscription/cancel", {
    method: "POST",
  });
}

export async function requestSubscriptionRefund(paymentOrderId: number, reason: string, notes?: string) {
  return apiFetch<{ message: string; refund_request_id: string }>("/api/plans/subscription/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payment_order_id: paymentOrderId, reason, notes }),
  });
}

export interface TransactionItem {
  id: string;
  db_id?: number | null;
  type: "card" | "transfer";
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string | null;
  receipt_url?: string | null;
  refund_requested?: boolean;
  items?: CartItem[] | null;
  paid_by?: string | null;
}

export async function getTransactions(scope?: "user" | "org" | any, orgId?: string) {
  const actualScope = typeof scope === "string" ? scope : "user";
  let url = `/api/plans/transactions?scope=${actualScope}`;
  if (orgId) {
    url += `&org_id=${orgId}`;
  }
  return apiFetch<TransactionItem[]>(url);
}
