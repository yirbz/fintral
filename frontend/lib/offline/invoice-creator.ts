import { offlineDb, type OfflineInvoiceDraft } from "./db";

export async function createOfflineInvoice(
  tenantId: string,
  orgId: string,
  formData: any,
  ecfTypeStr: string // "E31", "E32", "E33", etc.
): Promise<OfflineInvoiceDraft> {
  // 1. Get sequence for this tenant and ecfType
  const sequence = await offlineDb.sequences
    .where("[tenantId+ecfType]")
    .equals([tenantId, ecfTypeStr])
    .first();

  if (!sequence) {
    throw new Error(
      `No hay secuencias NCF configuradas localmente para el tipo ${ecfTypeStr}. Conéctese a internet para sincronizar.`
    );
  }

  if (!sequence.isActive) {
    throw new Error(`La secuencia NCF para el tipo ${ecfTypeStr} está inactiva.`);
  }

  // 2. Validate expiry
  if (sequence.expiryDate) {
    const expiry = new Date(sequence.expiryDate);
    const now = new Date();
    if (expiry < now) {
      throw new Error(
        `La secuencia NCF para el tipo ${ecfTypeStr} ha expirado (${expiry.toLocaleDateString()}). Conéctese a internet para obtener secuencias válidas.`
      );
    }
  }

  // 3. Validate numbers remaining
  if (sequence.currentNumber > sequence.endNumber) {
    throw new Error(
      `Se han agotado los números de secuencia NCF para el tipo ${ecfTypeStr} (Límite: ${sequence.endNumber}).`
    );
  }

  // 4. Generate provisional NCF
  // Standard DGII e-CF sequence has a 10-digit number suffix (e.g., E310000000001)
  const paddedNumber = String(sequence.currentNumber).padStart(10, "0");
  const provisionalEncf = `${sequence.prefix}${paddedNumber}`;

  // 5. Increment local sequence counter
  await offlineDb.sequences.update(sequence.id, {
    currentNumber: sequence.currentNumber + 1,
  });

  // 6. Save draft
  const draft: OfflineInvoiceDraft = {
    tenantId,
    orgId,
    ecfType: ecfTypeStr,
    formData: {
      ...formData,
      // Inject provisional NCF and deferred delivery flag
      provisionalEncf,
      deferredDeliveryIndicator: 1, // 1 means deferred/offline delivery
    },
    syncStatus: "pending_sync",
    provisionalEncf,
    retryCount: 0,
    createdAt: new Date(),
  };

  const localId = await offlineDb.invoiceDrafts.add(draft);
  draft.localId = localId;

  // 7. Add sync log entry
  await offlineDb.syncLog.add({
    localId,
    action: "emit",
    timestamp: new Date(),
    status: "success",
  });

  return draft;
}
