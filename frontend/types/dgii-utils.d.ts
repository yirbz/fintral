declare module "dgii-utils" {
  export const RNC: {
    valid(rnc: string): boolean;
    format(rnc: string): string;
    clear(rnc: string): string;
  };
  export const NCF: {
    valid(ncf: string): boolean;
  };
  export const ENCF: {
    valid(encf: string): boolean;
  };
  export function consultRNC(rnc: string): Promise<{
    RNC?: string;
    nombre?: string;
    nombre_comercial?: string;
    estado?: string;
    actividad_economica?: string;
    facturacion_electronica?: string;
  } | null>;
  export function consultCuidadanos(rnc: string): Promise<{
    nombre?: string;
    estado?: string;
    tipo?: string;
    RNC?: string;
    marca?: string;
  } | null>;
}
