import { apiFetch } from "@/lib/api/client";

export interface MioTokenResult {
  status: "success" | "error";
  token_type?: string;
  access_token?: string;
  expires_in?: number;
  cached?: boolean;
  message?: string;
  detail?: string;
}

export interface MioOrderItem {
  id?: number;
  name: string;
  amount: number;
  quantity?: number;
}

export interface MioCreateOrderRequest {
  amount: number;
  currency?: string;
  invoice_id?: string;
  items?: MioOrderItem[];
  redirect_urls?: {
    success?: string;
    failed?: string;
  };
  webhook_url?: string;
  expire_minutes?: number;
}

export interface MioCreateOrderResult {
  status: "success" | "error";
  payment?: {
    id: string;
    tenant_id: string;
    organization_id: string;
    invoice_id: string | null;
    mio_order_uuid: string;
    checkout_url: string;
    status: string;
    currency: string;
    amount: number;
    items: any;
    created_at: string;
    updated_at: string;
  };
  checkout_url?: string;
  order_uuid?: string;
  message?: string;
}

export interface MioOrderStatusResult {
  status: "success" | "error";
  mio_status?: string;
  payment_info?: {
    id?: number;
    authorization_code?: string;
    reference_number?: string;
    status?: string;
  };
  data?: any;
  message?: string;
}

export async function getMioToken() {
  return apiFetch<MioTokenResult>("/api/mio/token", { method: "POST" });
}

export async function refreshMioToken() {
  return apiFetch<MioTokenResult>("/api/mio/token/refresh", { method: "POST" });
}

export async function createMioOrder(request: MioCreateOrderRequest) {
  return apiFetch<MioCreateOrderResult>("/api/mio/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function getMioOrderStatus(orderUuid: string) {
  return apiFetch<MioOrderStatusResult>(`/api/mio/order-status/${orderUuid}`);
}
