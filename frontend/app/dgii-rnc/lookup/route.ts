import { NextRequest, NextResponse } from "next/server";

const DGII_BASE = "https://dgii.gov.do";
const RNC_URL = `${DGII_BASE}/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx`;
const CEDULA_URL = `${DGII_BASE}/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ciudadanos.aspx`;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(parseInt(code, 10)))
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

function parseDetailsView(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  const tableMatch = html.match(/<table[^>]*id="[^"]*dvDatosContribuyentes[^"]*"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return result;

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  if (!rows) return result;

  const RULES: [RegExp, string][] = [
    [/(nombre|razon social)/i, "nombre"],
    [/nombre comercial/i, "nombre_comercial"],
    [/rnc|cedula/i, "RNC"],
    [/estado/i, "estado"],
    [/actividad economica/i, "actividad_economica"],
    [/facturador electronico/i, "facturacion_electronica"],
  ];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!cells || cells.length < 2) continue;
    const label = normalizeLabel(decodeEntities(cells[0].replace(/<[^>]*>/g, "").trim().toLowerCase()));
    const value = decodeEntities(cells[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");
    if (!value) continue;
    for (const [pattern, key] of RULES) {
      if (pattern.test(label)) {
        result[key] = value;
        break;
      }
    }
  }
  return result;
}

function parseCedulaResult(html: string): Record<string, string> {
  const result: Record<string, string> = {};
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

function parseAjaxResponse(response: string): string {
  const match = response.match(/updatePanel\|upMainMaster\|([\s\S]*?)(?=\|8\|hiddenField|$)/);
  return match ? match[1].trim() : "";
}

function hasMessage(html: string): string | null {
  const match = html.match(/id="cphMain_lblInformacion"[^>]*>([^<]*)</);
  return match ? match[1].trim() : null;
}

async function dgiiGet(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  const html = await resp.text();
  const viewstate = html.match(/id="__VIEWSTATE" value="([^"]+)"/)?.[1] ?? "";
  const viewstateGen = html.match(/id="__VIEWSTATEGENERATOR" value="([^"]+)"/)?.[1] ?? "";
  const eventValidation = html.match(/id="__EVENTVALIDATION" value="([^"]+)"/)?.[1] ?? "";
  return { html, viewstate, viewstateGen, eventValidation };
}

async function dgiiPost(url: string, fields: Record<string, string>) {
  const formBody = new URLSearchParams(fields).toString();
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: formBody,
    cache: "no-store",
  });
  return resp.text();
}

async function consultRNC(rnc: string): Promise<Record<string, string>> {
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

async function consultCuidadanos(cedula: string): Promise<Record<string, string>> {
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

export async function GET(request: NextRequest) {
  const rnc = request.nextUrl.searchParams.get("rnc") || "";
  const cleaned = rnc.replace(/[^0-9]/g, "");

  if (cleaned.length !== 9 && cleaned.length !== 11) {
    return NextResponse.json({ error: "RNC debe tener 9 digitos (contribuyente) o 11 (cedula)" }, { status: 400 });
  }

  try {
    if (cleaned.length === 9) {
      const res = await consultRNC(cleaned);
      if (!res || !res.nombre) {
        return NextResponse.json({ error: "No encontrado en DGII" }, { status: 404 });
      }
      return NextResponse.json({
        rnc: res.RNC || cleaned,
        name: res.nombre,
        tradeName: res.nombre_comercial || null,
        status: res.estado || "INACTIVO",
        economicActivity: res.actividad_economica || null,
        isElectronicBillingRegistered: res.facturacion_electronica === "SI",
      });
    }

    // 11 digits — cedula
    const res = await consultCuidadanos(cleaned);
    if (res && res.nombre) {
      return NextResponse.json({
        rnc: res.RNC || cleaned,
        name: res.nombre,
        tradeName: null,
        status: res.estado || "INACTIVO",
        economicActivity: null,
        isElectronicBillingRegistered: false,
      });
    }

    // fallback: try RNC lookup
    const fallback = await consultRNC(cleaned);
    if (fallback && fallback.nombre) {
      return NextResponse.json({
        rnc: fallback.RNC || cleaned,
        name: fallback.nombre,
        tradeName: fallback.nombre_comercial || null,
        status: fallback.estado || "INACTIVO",
        economicActivity: fallback.actividad_economica || null,
        isElectronicBillingRegistered: fallback.facturacion_electronica === "SI",
      });
    }

    return NextResponse.json({ error: "No encontrado en DGII" }, { status: 404 });
  } catch (err) {
    console.error("DGII lookup error:", err);
    return NextResponse.json({ error: "Error al consultar DGII" }, { status: 502 });
  }
}
