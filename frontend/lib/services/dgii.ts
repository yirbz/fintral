import { RNC, NCF, ENCF } from "dgii-utils";

const DGII_BASE = "https://dgii.gov.do";
const RNC_URL = `${DGII_BASE}/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx`;
const CEDULA_URL = `${DGII_BASE}/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ciudadanos.aspx`;

const DGII_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

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

interface DgiiRawResult {
  RNC?: string;
  nombre?: string;
  nombre_comercial?: string;
  estado?: string;
  actividad_economica?: string;
  facturacion_electronica?: string;
}

async function dgiiGet(url: string): Promise<{ html: string; viewstate: string; viewstateGen: string; eventValidation: string }> {
  const resp = await fetch(url, {
    headers: { "User-Agent": DGII_USER_AGENT },
    cache: "no-store",
  });
  const html = await resp.text();
  const viewstate = html.match(/id="__VIEWSTATE" value="([^"]+)"/)?.[1] ?? "";
  const viewstateGen = html.match(/id="__VIEWSTATEGENERATOR" value="([^"]+)"/)?.[1] ?? "";
  const eventValidation = html.match(/id="__EVENTVALIDATION" value="([^"]+)"/)?.[1] ?? "";
  return { html, viewstate, viewstateGen, eventValidation };
}

async function dgiiPost(
  url: string,
  fields: Record<string, string>
): Promise<string> {
  const formBody = new URLSearchParams(fields).toString();
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DGII_USER_AGENT,
    },
    body: formBody,
    cache: "no-store",
  });
  return resp.text();
}

function parseAjaxResponse(response: string): string {
  const match = response.match(/updatePanel\|upMainMaster\|([\s\S]*?)(?=\|8\|hiddenField|$)/);
  return match ? match[1].trim() : "";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m: string, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&ntilde;/g, "\u00F1")
    .replace(/&Ntilde;/g, "\u00D1")
    .replace(/&aacute;/g, "\u00E1")
    .replace(/&eacute;/g, "\u00E9")
    .replace(/&iacute;/g, "\u00ED")
    .replace(/&oacute;/g, "\u00F3")
    .replace(/&uacute;/g, "\u00FA")
    .replace(/&Aacute;/g, "\u00C1")
    .replace(/&Eacute;/g, "\u00C9")
    .replace(/&Iacute;/g, "\u00CD")
    .replace(/&Oacute;/g, "\u00D3")
    .replace(/&Uacute;/g, "\u00DA");
}

function normalizeLabel(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseDetailsView(html: string): DgiiRawResult {
  const result: DgiiRawResult = {};

  const tableMatch = html.match(/<table[^>]*id="[^"]*dvDatosContribuyentes[^"]*"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return result;

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  if (!rows) return result;

  const RULES: [string, keyof DgiiRawResult][] = [
    ["nombre/razon social", "nombre"],
    ["nombre comercial", "nombre_comercial"],
    ["rnc/cedula", "RNC"],
    ["rnc", "RNC"],
    ["cedula", "RNC"],
    ["estado", "estado"],
    ["actividad economica", "actividad_economica"],
    ["facturador electronico", "facturacion_electronica"],
  ];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!cells || cells.length < 2) continue;

    const label = normalizeLabel(decodeEntities(cells[0].replace(/<[^>]*>/g, "").trim().toLowerCase()));
    const value = decodeEntities(cells[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");

    if (!value) continue;

    for (const [keyword, key] of RULES) {
      if (label.includes(keyword)) {
        (result as any)[key] = value;
        break;
      }
    }
  }

  return result;
}

function parseCedulaResult(html: string): DgiiRawResult {
  const result: DgiiRawResult = {};

  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return result;

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  if (!rows) return result;

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!cells || cells.length < 2) continue;

    const label = normalizeLabel(decodeEntities(cells[0].replace(/<[^>]*>/g, "").trim().toLowerCase()));
    const value = decodeEntities(cells[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");

    if (!value) continue;

    if (label.includes("nombre") || label.includes("razon")) {
      result.nombre = value;
    } else if (label.includes("estado") || label.includes("condicion")) {
      result.estado = value;
    } else if (label.includes("rnc") || label.includes("cedula") || label.includes("documento")) {
      result.RNC = value;
    }
  }

  return result;
}

function hasMessage(html: string): string | null {
  const match = html.match(/id="cphMain_lblInformacion"[^>]*>([^<]*)</);
  return match ? match[1].trim() : null;
}

async function consultRNC(rnc: string): Promise<DgiiRawResult> {
  const { viewstate, viewstateGen, eventValidation } = await dgiiGet(RNC_URL);

  const response = await dgiiPost(RNC_URL, {
    __VIEWSTATE: viewstate,
    __VIEWSTATEGENERATOR: viewstateGen,
    __EVENTVALIDATION: eventValidation,
    "ctl00$cphMain$txtRNCCedula": rnc,
    "ctl00$cphMain$btnBuscarPorRNC": "Buscar",
    __ASYNCPOST: "true",
  });

  const content = parseAjaxResponse(response);
  if (!content) return {};

  const message = hasMessage(content);
  if (message) return {};

  return parseDetailsView(content);
}

async function consultCuidadanos(cedula: string): Promise<DgiiRawResult> {
  const { viewstate, viewstateGen, eventValidation } = await dgiiGet(CEDULA_URL);

  const response = await dgiiPost(CEDULA_URL, {
    __VIEWSTATE: viewstate,
    __VIEWSTATEGENERATOR: viewstateGen,
    __EVENTVALIDATION: eventValidation,
    "ctl00$cphMain$txtCedula": cedula,
    "ctl00$cphMain$btnBuscarCedula": "Buscar",
    __ASYNCPOST: "true",
  });

  const content = parseAjaxResponse(response);
  if (!content) return {};

  const message = hasMessage(content);
  if (message) return {};

  return parseCedulaResult(content);
}

function parseNameSearchGrid(html: string): DgiiRawResult[] {
  const results: DgiiRawResult[] = [];
  const tableMatch = html.match(/<table[^>]*id="[^"]*gvBuscRazonSocial[^"]*"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return results;

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  if (!rows || rows.length < 2) return results;

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!cells || cells.length < 2) continue;

    const texts = cells.map((c) => decodeEntities(c.replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " "));
    results.push({
      RNC: texts[0] || undefined,
      nombre: texts[1] || undefined,
      nombre_comercial: texts[2] || undefined,
      estado: texts[5] || undefined,
      facturacion_electronica: texts[6] || undefined,
    });
  }

  return results;
}

async function consultByName(name: string): Promise<DgiiRawResult[]> {
  const { viewstate, viewstateGen, eventValidation } = await dgiiGet(RNC_URL);

  const response = await dgiiPost(RNC_URL, {
    __VIEWSTATE: viewstate,
    __VIEWSTATEGENERATOR: viewstateGen,
    __EVENTVALIDATION: eventValidation,
    "ctl00$cphMain$txtRazonSocial": name,
    "ctl00$cphMain$btnBuscarPorRazonSocial": "Buscar",
    __ASYNCPOST: "true",
  });

  const content = parseAjaxResponse(response);
  if (!content) {
    console.error("[consultByName] Empty content from AJAX response. Response length:", response.length);
    console.error("[consultByName] Response preview:", response.substring(0, 500));
    return [];
  }

  const results = parseNameSearchGrid(content);
  if (results.length > 0) return results;

  const message = content.match(/cphMain_lblInformacion[^>]*>([^<]*)</);
  if (message) {
    console.log("[consultByName] DGII message:", message[1]);
  } else {
    console.error("[consultByName] No grid found and no message. Content length:", content.length);
    console.error("[consultByName] Content preview:", content.substring(0, 500));
  }

  return [];
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
      if (res && res.nombre) {
        return {
          rnc: res.RNC || cleanRnc,
          name: res.nombre,
          status: res.estado || "INACTIVO",
          isElectronicBillingRegistered: false,
        };
      }
      const fallback = await consultRNC(cleanRnc);
      if (fallback && fallback.nombre) {
        return {
          rnc: fallback.RNC || cleanRnc,
          name: fallback.nombre,
          tradeName: fallback.nombre_comercial || undefined,
          status: fallback.estado || "INACTIVO",
          economicActivity: fallback.actividad_economica || undefined,
          isElectronicBillingRegistered: fallback.facturacion_electronica === "SI",
        };
      }
      return null;
    } catch (error) {
      console.error("Error consulting taxpayer with DGII:", error);
      return null;
    }
  }

  async searchByName(name: string): Promise<NameSearchResult[]> {
    if (!name || name.trim().length < 4) return [];
    try {
      const results = await consultByName(name.trim());
      return results
        .filter((r) => r.nombre && r.RNC)
        .map((r) => ({
          rnc: r.RNC!.replace(/[^0-9]/g, ""),
          name: r.nombre!,
          tradeName: r.nombre_comercial || undefined,
          status: r.estado || "INACTIVO",
        }));
    } catch (error) {
      console.error("Error searching taxpayer by name:", error);
      return [];
    }
  }
}

export const dgiiService = new DgiiService();
