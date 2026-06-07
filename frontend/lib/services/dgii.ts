import { RNC, NCF, ENCF } from "dgii-utils";

export interface TaxpayerDetails {
  rnc: string;
  name: string;
  tradeName?: string;
  status: string;
  economicActivity?: string;
  isElectronicBillingRegistered: boolean;
}

export interface NameSearchResult {
  rnc: string;
  name: string;
  tradeName?: string;
  status: string;
}

export interface IDgiiService {
  isValidRNC(value: string): boolean;
  formatRNC(value: string): string;
  cleanRNC(value: string): string;
  isValidNCF(value: string): boolean;
  isValidENCF(value: string): boolean;
  consultTaxpayer(rnc: string): Promise<TaxpayerDetails | null>;
  searchByName(name: string): Promise<NameSearchResult[]>;
}

async function lookupViaProxy(rnc: string) {
  const resp = await fetch(`/dgii-rnc/lookup?rnc=${encodeURIComponent(rnc)}`, { cache: "no-store" });
  if (!resp.ok) return null;
  return resp.json() as Promise<TaxpayerDetails>;
}

class DgiiService implements IDgiiService {
  isValidRNC(value: string): boolean {
    if (!value) return false;
    try {
      const clean = this.cleanRNC(value);
      if (clean.length === 9 || clean.length === 11) {
        return RNC.valid(clean);
      }
      return false;
    } catch {
      return false;
    }
  }

  formatRNC(value: string): string {
    if (!value) return "";
    return RNC.format(value);
  }

  cleanRNC(value: string): string {
    if (!value) return "";
    return RNC.clear(value);
  }

  isValidNCF(value: string): boolean {
    if (!value) return false;
    return NCF.valid(value);
  }

  isValidENCF(value: string): boolean {
    if (!value) return false;
    return ENCF.valid(value);
  }

  async consultTaxpayer(rnc: string): Promise<TaxpayerDetails | null> {
    const cleanRnc = this.cleanRNC(rnc);
    if (!this.isValidRNC(cleanRnc)) return null;
    try {
      const result = await lookupViaProxy(cleanRnc);
      if (!result) return null;
      return {
        rnc: result.rnc || cleanRnc,
        name: result.name,
        tradeName: result.tradeName || undefined,
        status: result.status || "INACTIVO",
        economicActivity: result.economicActivity || undefined,
        isElectronicBillingRegistered: result.isElectronicBillingRegistered,
      };
    } catch (error) {
      console.error("Error consulting taxpayer:", error);
      return null;
    }
  }

  async searchByName(name: string): Promise<NameSearchResult[]> {
    return [];
  }
}

export const dgiiService = new DgiiService();
