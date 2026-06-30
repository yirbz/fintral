import { offlineDb } from "./db";
import { billingApi } from "@/lib/api/billing";

export async function preloadOfflineData(tenantId: string, orgId: string) {
  try {
    console.log("Preloading offline data for tenant:", tenantId, "org:", orgId);

    // 1. Fetch from server in parallel
    const [productRes, clients, sequences] = await Promise.all([
      billingApi.getProducts().catch(() => ({ products: [], total: 0, page: 1, page_size: 50 })),
      billingApi.getClients().catch(() => []),
      billingApi.getSequences().catch(() => []),
    ]);
    const products = productRes.products;

    const cachedAt = new Date();

    // 2. Clear previous cached entries for this tenant in IndexedDB
    // For products/clients/sequences, we can bulkPut or delete and put.
    // Let's delete and re-insert to prevent stale records.
    await offlineDb.transaction("rw", [offlineDb.products, offlineDb.clients, offlineDb.sequences], async () => {
      // Clear
      await offlineDb.products.where("tenantId").equals(tenantId).delete();
      await offlineDb.clients.where("tenantId").equals(tenantId).delete();
      await offlineDb.sequences.where("tenantId").equals(tenantId).delete();

      // Write Products
      if (products.length > 0) {
        await offlineDb.products.bulkPut(
          products.map(p => ({
            id: p.id,
            tenantId,
            name: p.name,
            internalCode: p.internal_code,
            description: p.description,
            price: p.price,
            taxRate: p.tax_rate,
            isActive: p.is_active,
            cachedAt,
          }))
        );
      }

      // Write Clients
      if (clients.length > 0) {
        await offlineDb.clients.bulkPut(
          clients.map(c => ({
            id: c.id,
            tenantId,
            name: c.name,
            taxId: c.tax_id,
            email: c.email,
            phone: c.phone,
            address: c.address,
            cachedAt,
          }))
        );
      }

      // Write Sequences
      const activeSequences = sequences.filter(s => s.is_active);
      if (activeSequences.length > 0) {
        await offlineDb.sequences.bulkPut(
          activeSequences.map(s => ({
            id: s.id,
            tenantId,
            ecfType: `E${s.ecf_type}`,
            prefix: s.prefix,
            currentNumber: s.current_number,
            endNumber: s.end_number,
            expiryDate: s.expiry_date || "",
            isActive: s.is_active,
            cachedAt,
          }))
        );
      }
    });

    console.log("Offline data preloaded successfully:", {
      products: products.length,
      clients: clients.length,
      sequences: sequences.length,
    });

    return {
      products: products.length,
      clients: clients.length,
      sequences: sequences.length,
    };
  } catch (error) {
    console.error("Failed to preload offline data:", error);
    return { products: 0, clients: 0, sequences: 0, error: String(error) };
  }
}
