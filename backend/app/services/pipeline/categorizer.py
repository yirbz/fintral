import json
import logging
from re import sub
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.config import GEMINI_API_URL, GEMINI_MODEL, OPENAI_API_KEY
from app.models import TenantVendorRule

logger = logging.getLogger(__name__)

# Layer 2: Global Macro-Vendor Directory
# Major nationwide enterprises with fixed, unambiguous DGII categories.
GLOBAL_MACRO_VENDORS: Dict[str, str] = {
    "101001541": "02",  # Claro (Gastos por Trabajos, Suministros y Servicios)
    "130907572": "02",  # Altice Dominicana
    "101150024": "02",  # Edesur Dominicana
    "101312497": "02",  # Edenorte Dominicana
    "101348514": "02",  # Edeeste Dominicana
    "101005229": "09",  # Refinería Dominicana de Petróleo (Costos de Venta / Combustible)
    "101824890": "09",  # AES Andrés (Generación de Electricidad — Combustible)
    "101548123": "09",  # Punta Catalina (Generación de Electricidad)
}

DGII_CATEGORY_LABELS: Dict[str, str] = {
    "01": "Gastos de Personal",
    "02": "Gastos por Trabajos, Suministros y Servicios",
    "03": "Arrendamientos",
    "04": "Gastos de Activos Fijos",
    "05": "Gastos de Representación",
    "06": "Gastos Financieros",
    "07": "Gastos de Seguros",
    "08": "Gastos por Pérdidas Extraordinarias",
    "09": "Compras que Forman Parte del Costo de Venta",
    "10": "Adquisiciones de Activos Fijos",
    "11": "Gastos de Seguros (auxiliary)",
}

INCOME_TYPE_LABELS: Dict[str, str] = {
    "01": "Ingresos por Operaciones",
    "02": "Ingresos Financieros",
    "03": "Ingresos Extraordinarios",
    "04": "Ingresos por Arrendamientos",
    "05": "Ingresos por Venta de Activo Depreciable",
    "06": "Otros Ingresos",
}

EXPENSE_PROMPT = """Eres un asistente especializado en clasificación fiscal DGII de República Dominicana.

Esta es una factura de gasto/compra. Clasifícala en EXACTAMENTE UNA de las siguientes categorías de gasto basándote en el nombre del proveedor y los artículos/servicios facturados.

Categorías de gasto disponibles (Formulario 606 — Compras):
01 - Gastos de Personal (Salarios, salud, beneficios empleados)
02 - Gastos por Trabajos, Suministros y Servicios (Electricidad, internet, contratistas externos)
03 - Arrendamientos (Alquiler de oficina, leasing vehículos)
04 - Gastos de Activos Fijos (Depreciación o mantenimiento maquinaria/infraestructura)
05 - Gastos de Representación (Cenas con clientes, eventos corporativos, viajes)
06 - Gastos Financieros (Comisiones bancarias, intereses préstamos)
07 - Gastos de Seguros (Pagos de pólizas propiedad, salud, responsabilidad civil)
08 - Gastos por Pérdidas Extraordinarias (Daños imprevistos, acuerdos legales)
09 - Compras que Forman Parte del Costo de Venta (Materias primas, inventario retail)
10 - Adquisiciones de Activos Fijos (Compra directa de inmuebles, vehículos, servidores)
11 - Gastos de Seguros (Seguro especializado / provisiones auxiliares)

Responde SOLO con un objeto JSON:
{"dgii_category_code": "XX", "reason": "explicación breve en español"}"""

INCOME_PROMPT = """Eres un asistente especializado en clasificación fiscal DGII de República Dominicana.

Esta es una factura de ingreso/venta. Clasifícala en EXACTAMENTE UNA de los siguientes tipos de ingreso basándote en el nombre del cliente y los artículos/servicios facturados.

Tipos de ingreso disponibles (Formulario 607 — Ventas):
01 - Ingresos por Operaciones (Venta de bienes y servicios del giro del negocio)
02 - Ingresos Financieros (Intereses ganados, diferencias cambiarias, dividendos)
03 - Ingresos Extraordinarios (Ganancias por venta de activos, indemnizaciones)
04 - Ingresos por Arrendamientos (Alquiler de bienes muebles e inmuebles)
05 - Ingresos por Venta de Activo Depreciable (Ganancia por venta de activos fijos)
06 - Otros Ingresos (Cualquier otro ingreso no clasificado arriba)

Responde SOLO con un objeto JSON:
{"dgii_category_code": "XX", "reason": "explicación breve en español"}"""


def _clean_rnc(rnc: Optional[str]) -> str:
    if not rnc:
        return ""
    return sub(r"[^0-9]", "", str(rnc))


def _valid_codes_for(transaction_type: Optional[str]) -> set:
    """Return the set of valid category codes for the given transaction type."""
    return (
        set(INCOME_TYPE_LABELS.keys())
        if transaction_type == "income"
        else set(DGII_CATEGORY_LABELS.keys())
    )

def _code_label(code: str, transaction_type: Optional[str]) -> str:
    """Return the human-readable label for a category code."""
    labels = INCOME_TYPE_LABELS if transaction_type == "income" else DGII_CATEGORY_LABELS
    return labels.get(code, f"Código {code}")


class Categorizer:
    def categorize(
        self,
        vendor_tax_id: Optional[str],
        vendor_name: Optional[str],
        line_items: list,
        tenant_id: str,
        transaction_type: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """3-layer fallback cascade to determine the DGII category.

        Args:
            transaction_type: "income" or "expense". Determines which code set to use.
                              If None, defaults to expense categories.

        Returns:
            dict with keys: dgii_category_code, source, vendor_name, reason
        """
        clean_rnc = _clean_rnc(vendor_tax_id)
        valid_codes = _valid_codes_for(transaction_type)
        code_labels = INCOME_TYPE_LABELS if transaction_type == "income" else DGII_CATEGORY_LABELS

        # Layer 1: Tenant history cache
        if clean_rnc and db and tenant_id:
            rule = (
                db.query(TenantVendorRule)
                .filter(
                    TenantVendorRule.tenant_id == tenant_id,
                    TenantVendorRule.emisor_rnc == clean_rnc,
                )
                .first()
            )
            if rule and rule.dgii_category_code in valid_codes:
                logger.info(
                    "Layer 1 hit: tenant=%s rnc=%s → category=%s (source=%s)",
                    tenant_id, clean_rnc, rule.dgii_category_code, rule.source,
                )
                return {
                    "dgii_category_code": rule.dgii_category_code,
                    "source": rule.source,
                    "vendor_name": vendor_name,
                    "reason": f"Regla de {rule.source} previa para este proveedor",
                }
            elif rule:
                logger.info(
                    "Layer 1 skip: rule %s not valid for tx_type=%s",
                    rule.dgii_category_code, transaction_type,
                )

        # Layer 2: Global macro-vendor directory (expense-only suppliers)
        if transaction_type != "income" and clean_rnc and clean_rnc in GLOBAL_MACRO_VENDORS:
            code = GLOBAL_MACRO_VENDORS[clean_rnc]
            logger.info("Layer 2 hit: rnc=%s → category=%s", clean_rnc, code)
            return {
                "dgii_category_code": code,
                "source": "global_vendor",
                "vendor_name": vendor_name,
                "reason": f"Proveedor global pre-clasificado como {code_labels.get(code, code)}",
            }

        # Layer 3: Semantic LLM classification
        result = self._classify_with_llm(vendor_name, line_items, transaction_type)
        if result:
            logger.info(
                "Layer 3 hit: vendor=%s → category=%s",
                vendor_name, result["dgii_category_code"],
            )
            result["source"] = "ai_suggestion"
            result["vendor_name"] = vendor_name
            return result

        # Fallback: uncategorized
        logger.warning("All layers missed for vendor=%s rnc=%s", vendor_name, clean_rnc)
        return {
            "dgii_category_code": None,
            "source": "none",
            "vendor_name": vendor_name,
            "reason": "No se pudo clasificar automáticamente",
        }

    def _classify_with_llm(
        self,
        vendor_name: Optional[str],
        line_items: list,
        transaction_type: Optional[str] = None,
    ) -> Optional[Dict[str, str]]:
        if not OPENAI_API_KEY or not OPENAI_API_KEY.startswith("AIza"):
            logger.debug("Layer 3 skipped: no Gemini API key configured")
            return None

        items_text = "; ".join(
            [
                i.get("description", "") if isinstance(i, dict) else str(i)
                for i in (line_items or [])
                if i
            ]
        )
        if not vendor_name and not items_text:
            return None

        payload_text = json.dumps(
            {"emisor_name": vendor_name or "desconocido", "items": items_text},
            ensure_ascii=False,
        )

        system_prompt = INCOME_PROMPT if transaction_type == "income" else EXPENSE_PROMPT
        valid_codes = _valid_codes_for(transaction_type)

        url = f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent?key={OPENAI_API_KEY}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": system_prompt},
                        {
                            "text": f"Clasifica esta factura:\n{payload_text}\n\nResponde SOLO con JSON."
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        try:
            import requests

            resp = requests.post(url, json=payload, timeout=15)
            if resp.status_code != 200:
                logger.warning("Gemini API error %s: %s", resp.status_code, resp.text[:200])
                return None

            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text)
            code = str(parsed.get("dgii_category_code", "")).strip().zfill(2)
            reason = parsed.get("reason", "")

            if code not in valid_codes:
                logger.warning("LLM returned invalid category code: %s for tx_type=%s", code, transaction_type)
                return None

            return {"dgii_category_code": code, "reason": reason}

        except Exception as e:
            logger.exception("Layer 3 LLM call failed: %s", e)
            return None


categorizer = Categorizer()
