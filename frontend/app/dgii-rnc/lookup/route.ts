import { NextRequest, NextResponse } from "next/server";
import {
  decodeEntities,
  normalizeLabel,
  parseAjaxResponse,
  hasMessage,
  dgiiGet,
  dgiiPost,
} from "@/lib/dgii-rnc";

const RNC_URL = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx";
const CEDULA_URL = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ciudadanos.aspx";

function parseDetailsView(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  const tableMatch = html.match(/<table[^>]*id="[^"]*dvDatosContribuyentes[^"]*"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return result;

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  if (!rows) return result;

  const RULES: [RegExp, string][] = [
    [/nombre comercial/i, "nombre_comercial"],
    [/razon social/i, "nombre"],
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
