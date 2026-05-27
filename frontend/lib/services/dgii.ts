import { RNC, NCF, ENCF, consultRNC, consultCuidadanos } from "dgii-utils";

export interface TaxpayerDetails {
  rnc: string;
  name: string;
  tradeName?: string;
  status: string;
  economicActivity?: string;
  isElectronicBillingRegistered: boolean;
}

export interface IDgiiService {
  isValidRNC(value: string): boolean;
  formatRNC(value: string): string;
  cleanRNC(value: string): string;
  isValidNCF(value: string): boolean;
  isValidENCF(value: string): boolean;
  consultTaxpayer(rnc: string): Promise<TaxpayerDetails | null>;
}

class DgiiService implements IDgiiService {
  isValidRNC(value: string): boolean {
    if (!value) return false;
    const clean = this.cleanRNC(value);
    return RNC.valid(clean);
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
      if (cleanRnc.length === 9) {
        const res = await consultRNC(cleanRnc);
        if (!res || !res.nombre) return null;
        return {
          rnc: res.RNC || cleanRnc,
          name: res.nombre,
          tradeName: res.nombre_comercial || undefined,
          status: res.estado || "INACTIVO",
          economicActivity: res.actividad_economica || undefined,
          isElectronicBillingRegistered: res.facturacion_electronica === "SI",
        };
      }
      const res = await consultCuidadanos(cleanRnc);
      if (!res || !res.nombre) return null;
      return {
        rnc: res.RNC || cleanRnc,
        name: res.nombre,
        status: res.estado || "INACTIVO",
        isElectronicBillingRegistered: false,
      };
    } catch (error) {
      console.error("Error consulting taxpayer with DGII:", error);
      return null;
    }
  }
}

export const dgiiService = new DgiiService();
