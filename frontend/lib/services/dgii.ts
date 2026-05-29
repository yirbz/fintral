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

function validateCedula(cedula: string): boolean {
  const cleanCedula = cedula.replace(/[^0-9]/g, '');
  if (cleanCedula.length !== 11) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = parseInt(cleanCedula[i], 10);
    const weight = (i % 2 === 0) ? 2 : 1;
    const product = digit * weight;
    sum += (product > 9) ? (Math.floor(product / 10) + (product % 10)) : product;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return checksum === parseInt(cleanCedula[10], 10);
}

class DgiiService implements IDgiiService {
  isValidRNC(value: string): boolean {
    console.log("[isValidRNC] Input value:", value);
    if (!value) {
      console.log("[isValidRNC] Rejected: value is empty");
      return false;
    }
    try {
      const clean = this.cleanRNC(value);
      console.log("[isValidRNC] Clean value:", clean, "length:", clean.length);
      if (clean.length === 9) {
        const isValid = RNC.valid(clean);
        console.log("[isValidRNC] RNC.valid check result:", isValid);
        return isValid;
      }
      if (clean.length === 11) {
        const isValid = validateCedula(clean);
        console.log("[isValidRNC] validateCedula check result:", isValid);
        return isValid;
      }
      console.log("[isValidRNC] Rejected: length is neither 9 nor 11");
      return false;
    } catch (err) {
      console.error("[isValidRNC] Exception during validation:", err);
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
