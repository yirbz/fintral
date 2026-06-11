import { NextRequest, NextResponse } from "next/server";
import {
  decodeEntities,
  parseAjaxResponse,
  hasMessage,
  dgiiGet,
  dgiiPost,
} from "@/lib/dgii-rnc";

const RNC_URL = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name") || "";
  const cleaned = name.trim().slice(0, 50);

  if (cleaned.length < 3) {
    return NextResponse.json({ results: [] });
  }

  try {
    const { viewstate, viewstateGen, eventValidation } = await dgiiGet(RNC_URL);
    const response = await dgiiPost(RNC_URL, {
      __VIEWSTATE: viewstate,
      __VIEWSTATEGENERATOR: viewstateGen,
      __EVENTVALIDATION: eventValidation,
      "ctl00$cphMain$txtRazonSocial": cleaned,
      "ctl00$cphMain$btnBuscarPorRazonSocial": "Buscar",
      __ASYNCPOST: "true",
    });

    const content = parseAjaxResponse(response);
    if (!content) return NextResponse.json({ results: [] });

    const message = hasMessage(content);
    if (message) return NextResponse.json({ results: [] });

    const results = parseNameGrid(content);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("DGII name search error:", err);
    return NextResponse.json({ error: "Error al consultar DGII" }, { status: 502 });
  }
}

interface NameSearchResult {
  rnc: string;
  name: string;
  tradeName: string | null;
  status: string;
  isElectronicBillingRegistered: boolean;
}

function parseNameGrid(html: string): NameSearchResult[] {
  const results: NameSearchResult[] = [];

  // The DGII returns a grid view (ASP.NET GridView) with id "gvBuscRazonSocial"
  const tableMatch = html.match(/<table[^>]*id="[^"]*gvBuscRazonSocial[^"]*"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return results;

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  if (!rows) return results;

  // Skip header row (first <tr> usually has <th>)
  const dataRows = rows.filter((row) => row.includes("<td"));

  for (const row of dataRows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!cells || cells.length < 5) continue;

    const clean = cells.map((c) =>
      decodeEntities(c.replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ")
    );

    // Columns: RNC, name, tradeName, category, regime, status, isElectronic, licenses
    const rnc = clean[0] || "";
    const name = clean[1] || "";
    const tradeName = clean[2] && clean[2].replace(/\s/g, "").length > 0 ? clean[2] : null;
    const status = clean[5] || "INACTIVO";
    const isElectronic = clean[6]?.toUpperCase() === "SI";

    if (rnc && name) {
      results.push({ rnc, name, tradeName, status, isElectronicBillingRegistered: isElectronic });
    }
  }

  return results;
}
