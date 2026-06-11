const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export function decodeEntities(text: string): string {
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
    .replace(/&Uacute;/g, "\u00DA")
    .replace(/&nbsp;/g, " ");
}

export function normalizeLabel(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function parseAjaxResponse(response: string): string {
  const match = response.match(/updatePanel\|upMainMaster\|([\s\S]*?)(?=\|8\|hiddenField|$)/);
  return match ? match[1].trim() : "";
}

export function hasMessage(html: string): string | null {
  const match = html.match(/id="cphMain_lblInformacion"[^>]*>([^<]*)</);
  return match ? match[1].trim() : null;
}

export async function dgiiGet(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  const html = await resp.text();
  const viewstate = html.match(/id="__VIEWSTATE" value="([^"]+)"/)?.[1] ?? "";
  const viewstateGen = html.match(/id="__VIEWSTATEGENERATOR" value="([^"]+)"/)?.[1] ?? "";
  const eventValidation = html.match(/id="__EVENTVALIDATION" value="([^"]+)"/)?.[1] ?? "";
  return { html, viewstate, viewstateGen, eventValidation };
}

export async function dgiiPost(url: string, fields: Record<string, string>) {
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
