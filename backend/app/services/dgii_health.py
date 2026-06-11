import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta

import httpx

from app.services.alert_hooks import Alert, alert_manager

logger = logging.getLogger(__name__)

DGII_BASE = "https://dgii.gov.do"
RNC_URL = f"{DGII_BASE}/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx"
CEDULA_URL = f"{DGII_BASE}/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ciudadanos.aspx"

DGII_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

KNOWN_RNC = "132109122"
KNOWN_RNC_NAME = "ALANUBE INC."

CHECK_INTERVAL_HOURS = 24
CHECK_HOUR = 6

_VIEWSTATE_RE = re.compile(r'id="__VIEWSTATE" value="([^"]+)"')
_VIEWSTATEGEN_RE = re.compile(r'id="__VIEWSTATEGENERATOR" value="([^"]+)"')
_EVENTVALIDATION_RE = re.compile(r'id="__EVENTVALIDATION" value="([^"]+)"')
_UPDATE_PANEL_RE = re.compile(r"updatePanel\|upMainMaster\|([\s\S]*?)(?=\|8\|hiddenField|$)")

_ALERT_KNOWN_RNC = "DGII_RNC_LOOKUP_FAILED"
_ALERT_KNOWN_CEDULA = "DGII_CEDULA_LOOKUP_FAILED"
_ALERT_NAME_SEARCH = "DGII_NAME_SEARCH_FAILED"
_ALERT_ACCESSIBILITY = "DGII_PAGE_ACCESSIBILITY_FAILED"


@dataclass
class HealthCheckResult:
    status: str = "ok"
    message: str = ""
    details: dict = field(default_factory=dict)


@dataclass
class DgiiHealthReport:
    overall: str = "ok"
    checks: dict[str, HealthCheckResult] = field(default_factory=dict)
    timestamp: str = ""

    def to_dict(self) -> dict:
        return {
            "status": self.overall,
            "timestamp": self.timestamp,
            "checks": {
                name: {"status": c.status, "message": c.message, **c.details} for name, c in self.checks.items()
            },
        }


async def _fetch_page(client: httpx.AsyncClient, url: str) -> str:
    resp = await client.get(url, headers={"User-Agent": DGII_USER_AGENT})
    resp.raise_for_status()
    return resp.text


def _extract_form_fields(html: str) -> dict[str, str]:
    viewstate = _VIEWSTATE_RE.search(html)
    viewstate_gen = _VIEWSTATEGEN_RE.search(html)
    event_validation = _EVENTVALIDATION_RE.search(html)
    return {
        "__VIEWSTATE": viewstate.group(1) if viewstate else "",
        "__VIEWSTATEGENERATOR": viewstate_gen.group(1) if viewstate_gen else "",
        "__EVENTVALIDATION": event_validation.group(1) if event_validation else "",
    }


def _parse_ajax_response(response: str) -> str:
    match = _UPDATE_PANEL_RE.search(response)
    return match.group(1).strip() if match else ""


def _has_content(html: str) -> bool:
    return bool(re.search(r"dvDatosContribuyentes", html))


def _has_message(html: str) -> str | None:
    match = re.search(r'id="cphMain_lblInformacion"[^>]*>([^<]*)<', html)
    return match.group(1).strip() if match else None


async def _check_rnc_lookup(client: httpx.AsyncClient) -> HealthCheckResult:
    try:
        html = await _fetch_page(client, RNC_URL)
        fields = _extract_form_fields(html)
        if not fields["__VIEWSTATE"]:
            return HealthCheckResult(
                status="error",
                message="No se pudo extraer __VIEWSTATE de la página RNC de la DGII",
                details={"url": RNC_URL},
            )

        fields["ctl00$cphMain$txtRNCCedula"] = KNOWN_RNC
        fields["ctl00$cphMain$btnBuscarPorRNC"] = "Buscar"
        fields["__ASYNCPOST"] = "true"

        resp = await client.post(
            RNC_URL,
            data=fields,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": DGII_USER_AGENT,
            },
        )
        resp.raise_for_status()

        content = _parse_ajax_response(resp.text)
        if not content:
            msg = _has_message(resp.text)
            return HealthCheckResult(
                status="error",
                message=f"La DGII respondió sin contenido esperado: {msg}"
                if msg
                else "La DGII respondió sin contenido esperado",
                details={"url": RNC_URL, "rnc": KNOWN_RNC},
            )

        if not _has_content(content):
            return HealthCheckResult(
                status="error",
                message=f"No se encontró la tabla de datos del contribuyente (RNC {KNOWN_RNC})",
                details={"url": RNC_URL, "rnc": KNOWN_RNC, "content_preview": content[:300]},
            )

        return HealthCheckResult(
            status="ok",
            message=f"RNC {KNOWN_RNC} encontrado correctamente",
            details={"url": RNC_URL, "rnc": KNOWN_RNC},
        )
    except httpx.HTTPError as exc:
        return HealthCheckResult(
            status="error",
            message=f"Error HTTP al consultar RNC en la DGII: {exc}",
            details={"url": RNC_URL, "rnc": KNOWN_RNC},
        )
    except Exception as exc:
        return HealthCheckResult(
            status="error",
            message=f"Error inesperado al consultar RNC en la DGII: {exc}",
            details={"url": RNC_URL, "rnc": KNOWN_RNC},
        )


async def _check_name_search(client: httpx.AsyncClient) -> HealthCheckResult:
    try:
        html = await _fetch_page(client, RNC_URL)
        fields = _extract_form_fields(html)
        if not fields["__VIEWSTATE"]:
            return HealthCheckResult(
                status="error",
                message="No se pudo extraer __VIEWSTATE para búsqueda por nombre en la DGII",
                details={"url": RNC_URL},
            )

        fields["ctl00$cphMain$txtRazonSocial"] = KNOWN_RNC_NAME[:10]
        fields["ctl00$cphMain$btnBuscarPorRazonSocial"] = "Buscar"
        fields["__ASYNCPOST"] = "true"

        resp = await client.post(
            RNC_URL,
            data=fields,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": DGII_USER_AGENT,
            },
        )
        resp.raise_for_status()

        content = _parse_ajax_response(resp.text)
        if not content:
            msg = _has_message(resp.text)
            return HealthCheckResult(
                status="error",
                message=f"La DGII no devolvió resultados para la búsqueda por nombre: {msg}"
                if msg
                else "La DGII no devolvió resultados para la búsqueda por nombre",
                details={"url": RNC_URL, "query": KNOWN_RNC_NAME[:10]},
            )

        has_grid = bool(re.search(r"gvBuscRazonSocial", content))
        if not has_grid:
            return HealthCheckResult(
                status="error",
                message="No se encontró el grid de resultados de búsqueda por nombre",
                details={"url": RNC_URL, "query": KNOWN_RNC_NAME[:10], "content_preview": content[:300]},
            )

        return HealthCheckResult(
            status="ok",
            message="Búsqueda por nombre devuelve resultados correctamente",
            details={"url": RNC_URL, "query": KNOWN_RNC_NAME[:10]},
        )
    except httpx.HTTPError as exc:
        return HealthCheckResult(
            status="error",
            message=f"Error HTTP en búsqueda por nombre DGII: {exc}",
            details={"url": RNC_URL, "query": KNOWN_RNC_NAME[:10]},
        )
    except Exception as exc:
        return HealthCheckResult(
            status="error",
            message=f"Error inesperado en búsqueda por nombre DGII: {exc}",
            details={"url": RNC_URL, "query": KNOWN_RNC_NAME[:10]},
        )


async def check_dgii_health() -> DgiiHealthReport:
    now = datetime.utcnow()
    report = DgiiHealthReport(timestamp=now.isoformat())

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        report.checks["page_accessibility"] = await _check_page_accessibility(client)
        report.checks["rnc_lookup"] = await _check_rnc_lookup(client)
        report.checks["name_search"] = await _check_name_search(client)

    failed = [name for name, c in report.checks.items() if c.status == "error"]

    if not failed:
        report.overall = "ok"
        logger.info("DGII health check passed — all %d checks ok", len(report.checks))
    else:
        report.overall = "degraded"
        logger.warning("DGII health check degraded — %d/%d checks failed: %s", len(failed), len(report.checks), failed)

        for name in failed:
            check = report.checks[name]
            await alert_manager.dispatch(
                Alert(
                    title=f"DGII {name.replace('_', ' ').title()} caído",
                    message=check.message,
                    severity="error",
                    source="dgii_health",
                    metadata={"check": name, "check_result": check.message, "details": check.details},
                )
            )

    return report


async def _check_page_accessibility(client: httpx.AsyncClient) -> HealthCheckResult:
    urls = [("RNC", RNC_URL), ("Cédula", CEDULA_URL)]
    results = {}
    all_ok = True
    for label, url in urls:
        try:
            html = await _fetch_page(client, url)
            fields = _extract_form_fields(html)
            has_viewstate = bool(fields["__VIEWSTATE"])
            results[label] = "accessible" if has_viewstate else "no_viewstate"
            if not has_viewstate:
                all_ok = False
        except httpx.HTTPError as exc:
            results[label] = str(exc)
            all_ok = False
        except Exception as exc:
            results[label] = str(exc)
            all_ok = False

    if all_ok:
        return HealthCheckResult(
            status="ok",
            message="Páginas de la DGII accesibles",
            details={"urls": results},
        )
    else:
        return HealthCheckResult(
            status="error",
            message="Una o más páginas de la DGII no están accesibles",
            details={"urls": results},
        )


async def start_dgii_health_task() -> None:
    asyncio.create_task(_dgii_health_loop())


async def _dgii_health_loop() -> None:
    logger.info(
        "DGII health check scheduler started — runs daily at %02d:00 UTC (every %d hours)",
        CHECK_HOUR,
        CHECK_INTERVAL_HOURS,
    )

    while True:
        try:
            now = datetime.utcnow()
            target = datetime.combine(now.date(), time(CHECK_HOUR, 0))
            if now >= target:
                target += timedelta(days=1)

            wait_seconds = (target - now).total_seconds()
            logger.debug("DGII health check sleeping %.0f seconds until %s", wait_seconds, target.isoformat())

            await asyncio.sleep(wait_seconds)
            await check_dgii_health()
        except asyncio.CancelledError:
            logger.info("DGII health check scheduler cancelled")
            break
        except Exception as exc:
            logger.exception("DGII health check scheduler error: %s", exc)
            await asyncio.sleep(3600)
