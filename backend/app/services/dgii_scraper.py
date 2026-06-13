"""
Cliente HTTP para consulta viva de NCFs físicos en el portal público DGII.

Utiliza el endpoint:
  https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ncf.aspx

Estrategia anti-bloqueo:
- Ejecución on-demand (no automática en ingesta masiva)
- Rate limiting: 500ms-1s entre consultas consecutivas
- Caché: resultados exitosos se guardan en invoice.dgii_validation_status
- Manejo silencioso de errores: si DGII bloquea (403), retorna warning
"""
import logging
import re
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

NCF_CONSULTA_URL = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ncf.aspx"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
REQUEST_TIMEOUT = 30.0
MIN_DELAY_MS = 500

_VIEWSTATE_RE = re.compile(r'id="__VIEWSTATE" value="([^"]+)"')
_EVENTVALIDATION_RE = re.compile(r'id="__EVENTVALIDATION" value="([^"]+)"')


@dataclass
class NcfConsultaResult:
    found: bool
    razon_social: Optional[str]
    tipo_comprobante: Optional[str]
    estado: Optional[str]
    vigencia: Optional[str]
    ncf: Optional[str]
    rnc: Optional[str]
    raw_message: Optional[str]
    error: Optional[str]
    blocked: bool = False  # True if DGII returned 403


class DgiiScraper:
    """Scraper for the DGII NCF public consultation portal."""

    def __init__(self):
        self._last_request_ms = 0

    async def consultar_ncf(
        self,
        rnc: str,
        ncf: str,
    ) -> NcfConsultaResult:
        """Consulta un NCF físico en el portal DGII.

        Returns NcfConsultaResult with parsed data from the DGII response table.
        """
        import time

        # Rate limiting
        now_ms = time.monotonic() * 1000
        elapsed = now_ms - self._last_request_ms
        if elapsed < MIN_DELAY_MS:
            await self._sleep((MIN_DELAY_MS - elapsed) / 1000)
        self._last_request_ms = now_ms

        clean_rnc = re.sub(r"\D", "", rnc)
        clean_ncf = ncf.strip().upper()

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(REQUEST_TIMEOUT),
            follow_redirects=True,
        ) as client:
            try:
                # Step 1: GET page to extract __VIEWSTATE and __EVENTVALIDATION
                resp = await client.get(
                    NCF_CONSULTA_URL,
                    headers={"User-Agent": USER_AGENT},
                )
                resp.raise_for_status()

                fields = self._extract_form_fields(resp.text)
                if not fields.get("__VIEWSTATE"):
                    return NcfConsultaResult(
                        found=False,
                        razon_social=None,
                        tipo_comprobante=None,
                        estado=None,
                        vigencia=None,
                        ncf=clean_ncf,
                        rnc=clean_rnc,
                        raw_message=None,
                        error="No se pudo extraer el formulario de la DGII",
                    )

                # Step 2: POST the query
                fields["ctl00$cphMain$txtRNC"] = clean_rnc
                fields["ctl00$cphMain$txtNCF"] = clean_ncf
                fields["ctl00$cphMain$btnConsultar"] = "Buscar"

                post_resp = await client.post(
                    NCF_CONSULTA_URL,
                    data=fields,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": USER_AGENT,
                    },
                )
                post_resp.raise_for_status()

                # Step 3: Parse the result
                return self._parse_response(post_resp.text, clean_rnc, clean_ncf)

            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 403:
                    logger.warning("DGII NCF portal blocked request (403)")
                    return NcfConsultaResult(
                        found=False,
                        razon_social=None,
                        tipo_comprobante=None,
                        estado=None,
                        vigencia=None,
                        ncf=clean_ncf,
                        rnc=clean_rnc,
                        raw_message=None,
                        error="Verificación online no disponible en este momento (DGII bloqueó la solicitud)",
                        blocked=True,
                    )
                logger.error("DGII HTTP error: %s", exc)
                return NcfConsultaResult(
                    found=False,
                    razon_social=None,
                    tipo_comprobante=None,
                    estado=None,
                    vigencia=None,
                    ncf=clean_ncf,
                    rnc=clean_rnc,
                    raw_message=None,
                    error=f"Error al conectar con la DGII: {exc}",
                )
            except httpx.TimeoutException:
                logger.warning("DGII NCF portal timed out")
                return NcfConsultaResult(
                    found=False,
                    razon_social=None,
                    tipo_comprobante=None,
                    estado=None,
                    vigencia=None,
                    ncf=clean_ncf,
                    rnc=clean_rnc,
                    raw_message=None,
                    error="La consulta a la DGII tardó demasiado. Intenta de nuevo.",
                )
            except Exception as exc:
                logger.exception("Unexpected DGII scraper error")
                return NcfConsultaResult(
                    found=False,
                    razon_social=None,
                    tipo_comprobante=None,
                    estado=None,
                    vigencia=None,
                    ncf=clean_ncf,
                    rnc=clean_rnc,
                    raw_message=None,
                    error=f"Error inesperado: {exc}",
                )

    def _extract_form_fields(self, html: str) -> dict:
        viewstate = _VIEWSTATE_RE.search(html)
        event_validation = _EVENTVALIDATION_RE.search(html)
        return {
            "__VIEWSTATE": viewstate.group(1) if viewstate else "",
            "__EVENTVALIDATION": event_validation.group(1) if event_validation else "",
        }

    def _parse_response(
        self, html: str, rnc: str, ncf: str
    ) -> NcfConsultaResult:
        # Check for error/validation messages first
        error_span = re.search(
            r'<span[^>]*id="cphMain_lblInformacion"[^>]*>(.*?)</span>',
            html, re.DOTALL,
        )
        raw_message = error_span.group(1).strip() if error_span else None

        if raw_message:
            msg_clean = re.sub(r"<[^>]+>", "", raw_message).strip()
            if "no es correcto" in msg_clean.lower() or "no corresponde" in msg_clean.lower():
                return NcfConsultaResult(
                    found=False,
                    razon_social=None,
                    tipo_comprobante=None,
                    estado=None,
                    vigencia=None,
                    ncf=ncf,
                    rnc=rnc,
                    raw_message=msg_clean,
                    error=None,
                )

        # Parse result table
        table_match = re.search(
            r'<span[^>]*id="cphMain_lblRazonSocial"[^>]*>(.*?)</span>',
            html, re.DOTALL,
        )
        if not table_match:
            return NcfConsultaResult(
                found=False,
                razon_social=None,
                tipo_comprobante=None,
                estado=None,
                vigencia=None,
                ncf=ncf,
                rnc=rnc,
                raw_message=raw_message,
                error=None,
            )

        def extract_span_text(pattern: str) -> Optional[str]:
            m = re.search(pattern, html, re.DOTALL)
            if m:
                return re.sub(r"<[^>]+>", "", m.group(1)).strip()
            return None

        razon_social = extract_span_text(
            r'<span[^>]*id="cphMain_lblRazonSocial"[^>]*>(.*?)</span>'
        )
        tipo_comprobante = extract_span_text(
            r'<span[^>]*id="cphMain_lblTipoComprobante"[^>]*>(.*?)</span>'
        )
        estado = extract_span_text(
            r'<span[^>]*id="cphMain_lblEstado"[^>]*>(.*?)</span>'
        )
        vigencia = extract_span_text(
            r'<span[^>]*id="cphMain_lblVigencia"[^>]*>(.*?)</span>'
        )
        rnc_leido = extract_span_text(
            r'<span[^>]*id="cphMain_lblRncCedula"[^>]*>(.*?)</span>'
        )
        ncf_leido = extract_span_text(
            r'<span[^>]*id="cphMain_lblNCF"[^>]*>(.*?)</span>'
        )

        found = bool(razon_social)
        return NcfConsultaResult(
            found=found,
            razon_social=razon_social,
            tipo_comprobante=tipo_comprobante,
            estado=estado,
            vigencia=vigencia,
            ncf=ncf_leido or ncf,
            rnc=rnc_leido or rnc,
            raw_message=raw_message,
            error=None,
        )

    @staticmethod
    async def _sleep(seconds: float):
        import asyncio
        await asyncio.sleep(seconds)


dgii_scraper = DgiiScraper()
