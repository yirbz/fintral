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

# Layer 2.5: Deterministic e-CF type → DGII category mapping.
# The TipoeCF in the XML already tells us the document nature — no LLM needed.
ECF_TYPE_TO_DGII_CODE: Dict[str, str] = {
    "31": "02",  # Crédito Fiscal → Gastos por Trabajos, Suministros y Servicios (default)
    "41": "09",  # Compras → Costos y Gastos de Operación (compras de inventario/costo)
    "43": "02",  # Gastos Menores → Gastos por Trabajos, Suministros y Servicios
    "45": "06",  # Gubernamental → Otras Deducciones Admitidas
    "44": "06",  # Regímenes Especiales → Otras Deducciones Admitidas
    "46": "09",  # Exportación → Costos y Gastos de Operación
    "47": "02",  # Pago al Exterior → Gastos por Trabajos, Suministros y Servicios
}

# Types whose Layer 2.5 assignment is a safe default, NOT a hard rule.
# The user should review and confirm before locking.
ECF_TYPE_REQUIRES_REVIEW: set = {"31"}

DGII_CATEGORY_LABELS: Dict[str, str] = {
    "01": "Gastos de Personal",
    "02": "Gastos por Trabajos, Suministros y Servicios",
    "03": "Arrendamientos",
    "04": "Gastos de Activos Fijos",
    "05": "Gastos de Representación",
    "06": "Otras Deducciones Admitidas",
    "07": "Gastos Financieros",
    "08": "Gastos Extraordinarios",
    "09": "Costos y Gastos de Operación",
    "10": "Adquisiciones de Activos",
    "11": "Gastos de Seguros",
}

INCOME_TYPE_LABELS: Dict[str, str] = {
    "01": "Ingresos por operaciones (No financieros)",
    "02": "Ingresos Financieros",
    "03": "Ingresos Extraordinarios",
    "04": "Ingresos por Arrendamientos",
    "05": "Ingresos por Venta de Activo Depreciable",
    "06": "Otros Ingresos",
}

DGII_TO_ADMIN_CATEGORY: Dict[str, str] = {
    "01": "Personal",
    "02": "Servicios y Suministros",
    "03": "Alquileres",
    "04": "Mantenimiento y Activos",
    "05": "Dietas y Viajes",
    "06": "Otras Deducciones",
    "07": "Gastos Financieros",
    "08": "Gastos Extraordinarios",
    "09": "Costos de Operación",
    "10": "Adquisición de Activos",
    "11": "Seguros",
}

INCOME_TO_ADMIN_CATEGORY: Dict[str, str] = {
    "01": "Ventas y Operaciones",
    "02": "Ingresos Financieros",
    "03": "Ingresos Extraordinarios",
    "04": "Alquileres Cobrados",
    "05": "Venta de Activos",
    "06": "Otros Ingresos",
}

# Reverse mapping: admin category name → DGII code (for auto-learning)
ADMIN_TO_DGII_CATEGORY: Dict[str, str] = {v: k for k, v in DGII_TO_ADMIN_CATEGORY.items()}
ADMIN_TO_INCOME_CATEGORY: Dict[str, str] = {v: k for k, v in INCOME_TO_ADMIN_CATEGORY.items()}

def get_dgii_code(admin_category: str, transaction_type: Optional[str] = "expense") -> Optional[str]:
    if not admin_category:
        return None
    lookup = ADMIN_TO_INCOME_CATEGORY if transaction_type == "income" else ADMIN_TO_DGII_CATEGORY
    return lookup.get(admin_category)

def get_admin_category(code: Optional[str], transaction_type: Optional[str]) -> str:
    if not code:
        return "Otros"
    if transaction_type == "income":
        return INCOME_TO_ADMIN_CATEGORY.get(code, "Otros Ingresos")
    else:
        return DGII_TO_ADMIN_CATEGORY.get(code, "Otros Gastos")

EXPENSE_PROMPT = """Eres un asistente especializado en clasificación fiscal DGII de República Dominicana.

Esta es una factura de gasto/compra. Clasifícala en EXACTAMENTE UNA de las siguientes categorías de gasto basándote en el nombre del proveedor y los artículos/servicios facturados.

IMPORTANTE: NO asignes "01 - Gastos de Personal" a menos que la factura sea explícitamente sobre salarios, nómina, beneficios de empleados, o regalías pagadas a personas físicas. Una compra de suministros, equipos, servicios, alimentos o cualquier bien no es "Gastos de Personal". Si no estás seguro, usa "02 - Gastos por Trabajos, Suministros y Servicios" (la categoría más genérica para compras/gastos varios).

Categorías de gasto disponibles:
01 - Gastos de Personal (Salarios, sueldos, comisiones, bonificaciones, regalías a personas físicas, salud empleados, capacitación, uniformes, beneficio empleados)
02 - Gastos por Trabajos, Suministros y Servicios (Electricidad, internet, agua, telefonía, mensajería, papelería, limpieza, contratistas externos, consultoría, servicios profesionales, mantenimiento general)
03 - Arrendamientos (Alquiler de oficina, local, almacén, leasing de vehículos, alquiler de equipos)
04 - Gastos de Activos Fijos (Depreciación, reparación y mantenimiento de maquinaria, vehículos, infraestructura, edificios)
05 - Gastos de Representación (Atención a clientes, cenas, viajes de negocios, eventos corporativos, relaciones públicas)
06 - Otras Deducciones Admitidas (Donaciones, cuotas sindicales, aportes a asociaciones, gastos no categorizados en las anteriores)
07 - Gastos Financieros (Comisiones bancarias, intereses de préstamos, diferencias cambiarias, gastos de tarjetas de crédito)
08 - Gastos Extraordinarios (Daños por desastres, siniestros, multas fiscales deducibles, indemnizaciones no aseguradas)
09 - Costos y Gastos de Operación (Materias primas, inventario, combustible, fletes, empaques, insumos de producción)
10 - Adquisiciones de Activos (Compra directa de inmuebles, vehículos, servidores, maquinaria, equipos de capital)
11 - Gastos de Seguros (Pagos de pólizas: propiedad, vehículos, salud, responsabilidad civil, vida, fianzas)

Responde SOLO con un objeto JSON:
{"dgii_category_code": "XX", "admin_category": "Nombre de categoría simple/administrativa (elige de: Personal, Servicios y Suministros, Alquileres, Mantenimiento y Activos, Dietas y Viajes, Otras Deducciones, Gastos Financieros, Gastos Extraordinarios, Costos de Operación, Adquisición de Activos, Seguros, Otros)", "reason": "explicación breve en español", "confidence": 0.95}"""

INCOME_PROMPT = """Eres un asistente especializado en clasificación fiscal DGII de República Dominicana.

Esta es una factura de ingreso/venta. Clasifícala en EXACTAMENTE UNA de los siguientes tipos de ingreso basándote en el nombre del cliente y los artículos/servicios facturados.

Tipos de ingreso disponibles (Formulario 607 — Ventas):
01 - Ingresos por operaciones (No financieros) (Venta de bienes y servicios del giro del negocio)
02 - Ingresos Financieros (Intereses ganados, diferencias cambiarias, dividendos)
03 - Ingresos Extraordinarios (Ganancias por venta de activos, indemnizaciones)
04 - Ingresos por Arrendamientos (Alquiler de bienes muebles e inmuebles)
05 - Ingresos por Venta de Activo Depreciable (Ganancia por venta de activos fijos)
06 - Otros Ingresos (Cualquier otro ingreso no clasificado arriba)

Responde SOLO con un objeto JSON:
{"dgii_category_code": "XX", "admin_category": "Nombre de categoría simple/administrativa (elige de: Ventas y Operaciones, Ingresos Financieros, Alquileres Cobrados, Otros Ingresos)", "reason": "explicación breve en español", "confidence": 0.95}"""


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
    LLM_CONFIDENCE_THRESHOLD = 0.7

    def categorize(
        self,
        vendor_tax_id: Optional[str],
        vendor_name: Optional[str],
        line_items: list,
        tenant_id: str,
        transaction_type: Optional[str] = None,
        db: Optional[Session] = None,
        source_type: Optional[str] = None,
        ecf_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """3-layer fallback cascade to determine the DGII category.

        For structured sources (ecf/xml), always saves LLM results as
        TenantVendorRule so the next invoice from the same vendor hits
        Layer 1 — deterministic, zero-cost, sub-millisecond.

        Args:
            transaction_type: "income" or "expense". Determines which code set to use.
                              If None, defaults to expense categories.
            source_type: processing source hint (ecf, xml, pdf_text, etc.)
            ecf_type: TipoeCF from e-CF XML. When present with known mapping,
                      skips LLM entirely (Layer 2.5).

        Returns:
            dict with keys: dgii_category_code, admin_category, source,
                            vendor_name, reason, requires_review
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
                    "admin_category": get_admin_category(rule.dgii_category_code, transaction_type),
                    "source": rule.source,
                    "vendor_name": vendor_name,
                    "reason": f"Regla de {rule.source} previa para este proveedor",
                    "requires_review": False,
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
                "admin_category": get_admin_category(code, transaction_type),
                "source": "global_vendor",
                "vendor_name": vendor_name,
                "reason": f"Proveedor global pre-clasificado como {code_labels.get(code, code)}",
                "requires_review": False,
            }

        # Layer 2.5: Deterministic e-CF type mapping (TipoeCF → DGII category)
        # The e-CF XML already encodes the document nature — no LLM needed.
        if ecf_type and ecf_type in ECF_TYPE_TO_DGII_CODE:
            if transaction_type == "expense":
                code = ECF_TYPE_TO_DGII_CODE[ecf_type]
                needs_review = ecf_type in ECF_TYPE_REQUIRES_REVIEW
                logger.info(
                    "Layer 2.5 hit: ecf_type=%s → category=%s (requires_review=%s)",
                    ecf_type, code, needs_review,
                )
                return {
                    "dgii_category_code": code,
                    "admin_category": get_admin_category(code, transaction_type),
                    "source": "ecf_type_default",
                    "vendor_name": vendor_name,
                    "reason": f"Tipo {ecf_type}: {code_labels.get(code, code)} por defecto",
                    "requires_review": needs_review,
                }

        # Layer 3: Semantic LLM classification (text-only, cheap)
        result = self._classify_with_llm(vendor_name, line_items, transaction_type)
        if result:
            logger.info(
                "Layer 3 hit: vendor=%s → category=%s (confidence=%.2f)",
                vendor_name, result["dgii_category_code"], result.get("confidence", 0.0),
            )
            result["source"] = "ai_suggestion"
            result["vendor_name"] = vendor_name

            # Auto-save to TenantVendorRule so next time is Layer 1 (deterministic)
            if result["dgii_category_code"] and clean_rnc and db and tenant_id:
                rule = (
                    db.query(TenantVendorRule)
                    .filter(
                        TenantVendorRule.tenant_id == tenant_id,
                        TenantVendorRule.emisor_rnc == clean_rnc,
                    )
                    .first()
                )
                if not rule:
                    rule = TenantVendorRule(
                        tenant_id=tenant_id,
                        emisor_rnc=clean_rnc,
                        dgii_category_code=result["dgii_category_code"],
                        source="ai_suggestion",
                        vendor_name=vendor_name,
                    )
                    db.add(rule)
                    db.commit()
                    logger.info(
                        "Auto-saved TenantVendorRule: tenant=%s rnc=%s → %s",
                        tenant_id, clean_rnc, result["dgii_category_code"],
                    )

            confidence = result.get("confidence", 1.0)
            result["requires_review"] = confidence < self.LLM_CONFIDENCE_THRESHOLD
            return result

        # Fallback: deterministic default + requires_review
        default_code = "01" if transaction_type == "income" else "02"
        logger.warning(
            "All layers missed for vendor=%s rnc=%s — using default %s",
            vendor_name, clean_rnc, default_code,
        )
        return {
            "dgii_category_code": default_code,
            "admin_category": get_admin_category(default_code, transaction_type),
            "source": "default_fallback",
            "vendor_name": vendor_name,
            "reason": f"No se pudo clasificar automáticamente. Se asignó {code_labels.get(default_code, default_code)} por defecto.",
            "requires_review": True,
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
            admin_cat = parsed.get("admin_category")
            reason = parsed.get("reason", "")
            confidence = float(parsed.get("confidence", 1.0))

            if code not in valid_codes:
                logger.warning("LLM returned invalid category code: %s for tx_type=%s", code, transaction_type)
                return None

            if not admin_cat:
                admin_cat = get_admin_category(code, transaction_type)

            return {
                "dgii_category_code": code,
                "admin_category": admin_cat,
                "reason": reason,
                "confidence": max(0.0, min(1.0, confidence)),
            }

        except Exception as e:
            logger.exception("Layer 3 LLM call failed: %s", e)
            return None


categorizer = Categorizer()
