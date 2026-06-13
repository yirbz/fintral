import { offlineDb, type OfflineInvoiceDraft } from "./db";
import { apiFetch } from "@/lib/api/client";
import { billingApi } from "@/lib/api/billing";

export interface SyncResult {
  localId: number;
  success: boolean;
  invoiceId?: string;
  encf?: string;
  error?: string;
}

export class SyncManager {
  async getPendingCount(): Promise<number> {
    return offlineDb.invoiceDrafts.where("syncStatus").equals("pending_sync").count();
  }

  async syncPendingInvoices(): Promise<SyncResult[]> {
    const pending = await offlineDb.invoiceDrafts
      .where("syncStatus")
      .equals("pending_sync")
      .toArray();

    if (pending.length === 0) {
      return [];
    }

    // Mark all as syncing
    const pendingIds = pending.map(p => p.localId!);
    await offlineDb.invoiceDrafts
      .where("localId")
      .anyOf(pendingIds)
      .modify({ syncStatus: "syncing" });

    try {
      // Try batch sync endpoint first
      const response = await apiFetch<{ results: SyncResult[] }>("/api/billing/sync/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoices: pending.map(p => ({
            localId: p.localId,
            provisionalEncf: p.provisionalEncf,
            formData: p.formData,
            createdAt: p.createdAt.toISOString(),
          })),
        }),
      }).catch(async (error: any) => {
        // If batch sync is not implemented on backend yet or 404, fall back to individual emissions
        if (error.status === 404) {
          console.warn("Batch sync endpoint not found (404). Falling back to individual invoice emission.");
          return this.syncIndividually(pending);
        }
        throw error;
      });

      // Update local IndexedDB based on results
      const results = response.results || [];
      for (const result of results) {
        const updateData: Partial<OfflineInvoiceDraft> = {
          syncStatus: result.success ? "synced" : "error",
          serverInvoiceId: result.invoiceId,
          serverEncf: result.encf,
          errorMessage: result.error,
          syncedAt: result.success ? new Date() : undefined,
        };

        if (!result.success) {
          // Increment retry count if it failed on backend
          const current = pending.find(p => p.localId === result.localId);
          if (current) {
            updateData.retryCount = (current.retryCount || 0) + 1;
          }
        }

        await offlineDb.invoiceDrafts.update(result.localId, updateData);

        // Log sync event
        await offlineDb.syncLog.add({
          localId: result.localId,
          action: "sync",
          timestamp: new Date(),
          status: result.success ? "success" : "error",
          serverResponse: result as any,
          errorMessage: result.error,
        });
      }

      return results;
    } catch (error: any) {
      console.error("Batch sync failed, reverting drafts to pending_sync:", error);
      // Revert status to pending_sync so it can be retried later
      await offlineDb.invoiceDrafts
        .where("localId")
        .anyOf(pendingIds)
        .modify({ syncStatus: "pending_sync" });

      throw error;
    }
  }

  // Fallback helper to emit invoices one-by-one using the standard endpoint
  private async syncIndividually(pending: OfflineInvoiceDraft[]): Promise<{ results: SyncResult[] }> {
    const results: SyncResult[] = [];

    for (const draft of pending) {
      try {
        // Map form items to format expected by emitInvoice if needed
        // Note: draft.formData is already structured for billingApi.emitInvoice
        const emitResponse = await billingApi.emitInvoice(draft.formData as any);

        const success = emitResponse.status === "verified" || emitResponse.status === "pending";

        results.push({
          localId: draft.localId!,
          success,
          invoiceId: emitResponse.invoice?.id,
          encf: emitResponse.invoice?.invoice_number || emitResponse.invoice?.ecf_type,
          error: success ? undefined : emitResponse.error_message || emitResponse.message,
        });
      } catch (err: any) {
        results.push({
          localId: draft.localId!,
          success: false,
          error: err.message || String(err),
        });
      }
    }

    return { results };
  }

  async retryFailed(): Promise<SyncResult[]> {
    const failed = await offlineDb.invoiceDrafts
      .where("syncStatus")
      .equals("error")
      .filter(p => (p.retryCount || 0) < 3)
      .toArray();

    if (failed.length === 0) return [];

    // Reset status to pending_sync and sync
    const failedIds = failed.map(p => p.localId!);
    await offlineDb.invoiceDrafts
      .where("localId")
      .anyOf(failedIds)
      .modify({ syncStatus: "pending_sync" });

    return this.syncPendingInvoices();
  }

  async clearSynced(olderThanDays = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const oldSynced = await offlineDb.invoiceDrafts
      .where("syncStatus")
      .equals("synced")
      .filter(p => p.syncedAt ? p.syncedAt < cutoff : false)
      .toArray();

    if (oldSynced.length === 0) return 0;

    const oldIds = oldSynced.map(p => p.localId!);
    await offlineDb.invoiceDrafts.where("localId").anyOf(oldIds).delete();

    // Clean logs too
    await offlineDb.syncLog.where("localId").anyOf(oldIds).delete();

    return oldIds.length;
  }
}

export const syncManager = new SyncManager();
