import Dexie, { type Table } from "dexie";

export interface OfflineInvoiceDraft {
  localId?: number;
  tenantId: string;
  orgId: string;
  ecfType: string; // E31, E32, E33, E34, etc.
  formData: Record<string, any>;
  syncStatus: "draft" | "pending_sync" | "syncing" | "synced" | "error";
  provisionalEncf?: string;
  serverInvoiceId?: string;
  serverEncf?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  syncedAt?: Date;
}

export interface CachedProduct {
  id: string;
  tenantId: string;
  name: string;
  internalCode?: string;
  description?: string;
  price: number;
  taxRate: number;
  isActive: boolean;
  cachedAt: Date;
}

export interface CachedClient {
  id: string;
  tenantId: string;
  name: string;
  taxId?: string; // RNC
  email?: string;
  phone?: string;
  address?: string;
  cachedAt: Date;
}

export interface CachedSequence {
  id: string;
  tenantId: string;
  ecfType: string;
  prefix: string;
  currentNumber: number;
  endNumber: number;
  expiryDate: string;
  isActive: boolean;
  cachedAt: Date;
}

export interface SyncLogEntry {
  id?: number;
  localId: number;
  action: "emit" | "sync" | "retry";
  timestamp: Date;
  status: "success" | "error";
  serverResponse?: Record<string, any>;
  errorMessage?: string;
}

export class FintralOfflineDB extends Dexie {
  invoiceDrafts!: Table<OfflineInvoiceDraft>;
  products!: Table<CachedProduct>;
  clients!: Table<CachedClient>;
  sequences!: Table<CachedSequence>;
  syncLog!: Table<SyncLogEntry>;

  constructor() {
    super("FintralOffline");
    this.version(1).stores({
      invoiceDrafts: "++localId, [tenantId+orgId], syncStatus, ecfType, createdAt",
      products: "id, [tenantId+isActive], name",
      clients: "id, tenantId, taxId, name",
      sequences: "id, [tenantId+ecfType]",
      syncLog: "++id, localId, timestamp, status"
    });
  }
}

export const offlineDb = new FintralOfflineDB();
