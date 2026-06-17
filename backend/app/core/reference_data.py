import hashlib
import json
import logging
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from uuid_utils import uuid7

from app.core.redis import cache_delete, cache_get, cache_set
from app.models import ReferenceData
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)

REFDATA_CACHE_TTL = 3600

SEED_ENTRIES: list[dict[str, Any]] = [
    # ── NCF Types ──────────────────────────────────────
    {"domain": "ncf_types", "code": "B01", "label_es": "Factura de Crédito Fiscal", "description": "Transacciones entre contribuyentes registrados. Genera crédito ITBIS.", "sort_order": 0, "metadata_json": json.dumps({"serie": "B", "tipo_code": "01"})},
    {"domain": "ncf_types", "code": "B02", "label_es": "Factura de Consumo", "description": "Ventas a consumidores finales. No genera crédito ITBIS.", "sort_order": 1, "metadata_json": json.dumps({"serie": "B", "tipo_code": "02"})},
    {"domain": "ncf_types", "code": "B03", "label_es": "Nota de Débito", "description": "Aumenta monto de comprobante anterior (intereses, fletes, ajustes).", "sort_order": 2, "metadata_json": json.dumps({"serie": "B", "tipo_code": "03"})},
    {"domain": "ncf_types", "code": "B04", "label_es": "Nota de Crédito", "description": "Reduce monto de comprobante anterior (devoluciones, descuentos, anulaciones).", "sort_order": 3, "metadata_json": json.dumps({"serie": "B", "tipo_code": "04"})},
    {"domain": "ncf_types", "code": "B11", "label_es": "Comprobante de Compras", "description": "Lo emite el comprador cuando el proveedor no tiene RNC (informal).", "sort_order": 4, "metadata_json": json.dumps({"serie": "B", "tipo_code": "11"})},
    {"domain": "ncf_types", "code": "B12", "label_es": "Registro Único de Ingresos (RUI)", "description": "Resumen diario de transacciones con consumidores finales (bienes exentos ITBIS).", "sort_order": 5, "metadata_json": json.dumps({"serie": "B", "tipo_code": "12"})},
    {"domain": "ncf_types", "code": "B13", "label_es": "Comprobante para Gastos Menores", "description": "Gastos pequeños del personal de la empresa (caja chica).", "sort_order": 6, "metadata_json": json.dumps({"serie": "B", "tipo_code": "13"})},
    {"domain": "ncf_types", "code": "B14", "label_es": "Comprobante para Regímenes Especiales", "description": "Ventas a zonas francas, turismo y otros regímenes con exención.", "sort_order": 7, "metadata_json": json.dumps({"serie": "B", "tipo_code": "14"})},
    {"domain": "ncf_types", "code": "B15", "label_es": "Comprobante Gubernamental", "description": "Ventas al Gobierno Central, instituciones autónomas y Seguridad Social.", "sort_order": 8, "metadata_json": json.dumps({"serie": "B", "tipo_code": "15"})},
    {"domain": "ncf_types", "code": "B16", "label_es": "Comprobante para Exportaciones", "description": "Ventas fuera del territorio dominicano. Tasa 0% ITBIS.", "sort_order": 9, "metadata_json": json.dumps({"serie": "B", "tipo_code": "16"})},
    {"domain": "ncf_types", "code": "B17", "label_es": "Comprobante para Pagos al Exterior", "description": "Pagos a no residentes fiscales. Retención total ISR aplica.", "sort_order": 10, "metadata_json": json.dumps({"serie": "B", "tipo_code": "17"})},
    {"domain": "ncf_types", "code": "E31", "label_es": "Factura de Crédito Fiscal Electrónica", "description": "e-CF equivalente a B01. Entre contribuyentes registrados.", "sort_order": 11, "metadata_json": json.dumps({"serie": "E", "tipo_code": "31"})},
    {"domain": "ncf_types", "code": "E32", "label_es": "Factura de Consumo Electrónica", "description": "e-CF equivalente a B02. Consumidores finales.", "sort_order": 12, "metadata_json": json.dumps({"serie": "E", "tipo_code": "32"})},
    {"domain": "ncf_types", "code": "E33", "label_es": "Nota de Débito Electrónica", "description": "e-CF equivalente a B03.", "sort_order": 13, "metadata_json": json.dumps({"serie": "E", "tipo_code": "33"})},
    {"domain": "ncf_types", "code": "E34", "label_es": "Nota de Crédito Electrónica", "description": "e-CF equivalente a B04.", "sort_order": 14, "metadata_json": json.dumps({"serie": "E", "tipo_code": "34"})},
    {"domain": "ncf_types", "code": "E41", "label_es": "Comprobante Electrónico de Compras", "description": "e-CF equivalente a B11.", "sort_order": 15, "metadata_json": json.dumps({"serie": "E", "tipo_code": "41"})},
    {"domain": "ncf_types", "code": "E43", "label_es": "Comprobante Electrónico para Gastos Menores", "description": "e-CF equivalente a B13.", "sort_order": 16, "metadata_json": json.dumps({"serie": "E", "tipo_code": "43"})},
    {"domain": "ncf_types", "code": "E44", "label_es": "Comprobante Electrónico para Regímenes Especiales", "description": "e-CF equivalente a B14.", "sort_order": 17, "metadata_json": json.dumps({"serie": "E", "tipo_code": "44"})},
    {"domain": "ncf_types", "code": "E45", "label_es": "Comprobante Electrónico Gubernamental", "description": "e-CF equivalente a B15.", "sort_order": 18, "metadata_json": json.dumps({"serie": "E", "tipo_code": "45"})},
    {"domain": "ncf_types", "code": "E46", "label_es": "Comprobante Electrónico para Exportaciones", "description": "e-CF equivalente a B16.", "sort_order": 19, "metadata_json": json.dumps({"serie": "E", "tipo_code": "46"})},
    {"domain": "ncf_types", "code": "E47", "label_es": "Comprobante Electrónico para Pagos al Exterior", "description": "e-CF equivalente a B17.", "sort_order": 20, "metadata_json": json.dumps({"serie": "E", "tipo_code": "47"})},
    # ── Goods / Services Types ─────────────────────────
    {"domain": "goods_services_types", "code": "01", "label_es": "Gastos de personal", "description": "Sueldos, salarios, comisiones, bonificaciones, prestaciones y demás gastos de personal", "sort_order": 0},
    {"domain": "goods_services_types", "code": "02", "label_es": "Gastos por trabajos, suministros y servicios", "description": "Honorarios profesionales, servicios de terceros, suministros y servicios en general", "sort_order": 1},
    {"domain": "goods_services_types", "code": "03", "label_es": "Arrendamientos", "description": "Alquileres de bienes muebles e inmuebles", "sort_order": 2},
    {"domain": "goods_services_types", "code": "04", "label_es": "Gastos de activos fijos", "description": "Mantenimiento, reparación y depreciación de activos fijos", "sort_order": 3},
    {"domain": "goods_services_types", "code": "05", "label_es": "Gastos de representación", "description": "Gastos de viaje, hospedaje, alimentación y representación", "sort_order": 4},
    {"domain": "goods_services_types", "code": "06", "label_es": "Otras deducciones admitidas", "description": "Donaciones, cuotas, suscripciones y otras deducciones permitidas por ley", "sort_order": 5},
    {"domain": "goods_services_types", "code": "07", "label_es": "Gastos financieros", "description": "Intereses, comisiones bancarias, diferencias cambiarias y otros gastos financieros", "sort_order": 6},
    {"domain": "goods_services_types", "code": "08", "label_es": "Gastos extraordinarios", "description": "Pérdidas por siniestros, robos, multas y otros gastos no operativos", "sort_order": 7},
    {"domain": "goods_services_types", "code": "09", "label_es": "Compras y gastos que formarán parte del costo de venta", "description": "Mercancías, materias primas, envases, empaques y otros costos directos", "sort_order": 8},
    {"domain": "goods_services_types", "code": "10", "label_es": "Adquisiciones de activos", "description": "Compra de terrenos, edificios, maquinarias, equipos y otros activos fijos", "sort_order": 9},
    {"domain": "goods_services_types", "code": "11", "label_es": "Gastos de seguros", "description": "Primas de seguros contra incendios, robo, responsabilidad civil y otros", "sort_order": 10},
    # ── Payment Methods ────────────────────────────────
    {"domain": "payment_methods", "code": "01", "label_es": "Efectivo", "description": "Pago en efectivo", "sort_order": 0},
    {"domain": "payment_methods", "code": "02", "label_es": "Cheque / Transferencia / Depósito", "description": "Pago mediante cheque, transferencia bancaria o depósito", "sort_order": 1},
    {"domain": "payment_methods", "code": "03", "label_es": "Tarjeta crédito/débito", "description": "Pago con tarjeta de crédito o débito", "sort_order": 2},
    {"domain": "payment_methods", "code": "04", "label_es": "Venta a crédito", "description": "Monto no cobrado al momento de la emisión (cuenta por cobrar)", "sort_order": 3},
    {"domain": "payment_methods", "code": "05", "label_es": "Permuta", "description": "Intercambio de bienes o servicios sin uso de dinero", "sort_order": 4},
    {"domain": "payment_methods", "code": "06", "label_es": "Nota de crédito / Bono", "description": "Pago mediante nota de crédito, bonos o certificados", "sort_order": 5},
    {"domain": "payment_methods", "code": "07", "label_es": "Mixto / Otra forma", "description": "Combinación de formas de pago u otro método no especificado", "sort_order": 6},
    # ── ISR Retention Types ────────────────────────────
    {"domain": "isr_retention_types", "code": "01", "label_es": "Alquileres", "description": "Retención por alquiler de bienes muebles e inmuebles", "sort_order": 0},
    {"domain": "isr_retention_types", "code": "02", "label_es": "Honorarios por servicios", "description": "Retención por honorarios profesionales y servicios en general", "sort_order": 1},
    {"domain": "isr_retention_types", "code": "03", "label_es": "Otras rentas", "description": "Otras rentas no especificadas en las categorías anteriores", "sort_order": 2},
    {"domain": "isr_retention_types", "code": "04", "label_es": "Otras rentas (rentas presuntas)", "description": "Rentas presuntas según normativa fiscal", "sort_order": 3},
    {"domain": "isr_retention_types", "code": "05", "label_es": "Intereses pagados a personas jurídicas residentes", "description": "Intereses pagados a empresas residentes", "sort_order": 4},
    {"domain": "isr_retention_types", "code": "06", "label_es": "Intereses pagados a personas físicas residentes", "description": "Intereses pagados a personas físicas residentes", "sort_order": 5},
    {"domain": "isr_retention_types", "code": "07", "label_es": "Retención por proveedores del Estado", "description": "Retenciones aplicadas a proveedores del gobierno", "sort_order": 6},
    {"domain": "isr_retention_types", "code": "08", "label_es": "Juegos telefónicos", "description": "Retención por juegos de azar telefónicos", "sort_order": 7},
    {"domain": "isr_retention_types", "code": "09", "label_es": "Retenciones subsector de ganadería de carne bovina", "description": "Retención específica para el subsector de ganadería", "sort_order": 8},
    # ── Income Types ───────────────────────────────────
    {"domain": "income_types", "code": "01", "label_es": "Ingresos por operaciones (No financieros)", "description": "Ingresos ordinarios por venta de bienes y servicios — el más común", "sort_order": 0},
    {"domain": "income_types", "code": "02", "label_es": "Ingresos Financieros", "description": "Intereses ganados, diferencias cambiarias, dividendos", "sort_order": 1},
    {"domain": "income_types", "code": "03", "label_es": "Ingresos Extraordinarios", "description": "Ganancias por venta de activos, indemnizaciones, y otros no recurrentes", "sort_order": 2},
    {"domain": "income_types", "code": "04", "label_es": "Ingresos por Arrendamientos", "description": "Ingresos por alquiler de bienes muebles e inmuebles", "sort_order": 3},
    {"domain": "income_types", "code": "05", "label_es": "Ingresos por Venta de Activo Depreciable", "description": "Ganancia por venta de activos fijos depreciables", "sort_order": 4},
    {"domain": "income_types", "code": "06", "label_es": "Otros Ingresos", "description": "Cualquier otro ingreso no clasificado en las categorías anteriores", "sort_order": 5},
    # ── ID Types ───────────────────────────────────────
    {"domain": "id_types", "code": "01", "label_es": "RNC", "description": "Registro Nacional del Contribuyente (personas jurídicas y físicas con RNC)", "sort_order": 0},
    {"domain": "id_types", "code": "02", "label_es": "Cédula", "description": "Cédula de identidad y electoral dominicana (11 dígitos)", "sort_order": 1},
    {"domain": "id_types", "code": "03", "label_es": "Pasaporte / ID Tributaria", "description": "Para extranjeros sin RNC o cédula dominicana", "sort_order": 2},
    # ── Currencies ─────────────────────────────────────
    {"domain": "currencies", "code": "DOP", "label_es": "Peso Dominicano", "description": "RD$ — Moneda oficial de República Dominicana", "sort_order": 0},
    {"domain": "currencies", "code": "USD", "label_es": "Dólar Estadounidense", "description": "US$ — Dólar de los Estados Unidos", "sort_order": 1},
    {"domain": "currencies", "code": "EUR", "label_es": "Euro", "description": "€ — Moneda de la Unión Europea", "sort_order": 2},
    {"domain": "currencies", "code": "MXN", "label_es": "Peso Mexicano", "description": "MX$ — Peso mexicano", "sort_order": 3},
    {"domain": "currencies", "code": "CAD", "label_es": "Dólar Canadiense", "description": "CA$ — Dólar canadiense", "sort_order": 4},
    {"domain": "currencies", "code": "GBP", "label_es": "Libra Esterlina", "description": "£ — Libra del Reino Unido", "sort_order": 5},
    {"domain": "currencies", "code": "ARS", "label_es": "Peso Argentino", "description": "AR$ — Peso argentino", "sort_order": 6},
    {"domain": "currencies", "code": "COP", "label_es": "Peso Colombiano", "description": "CO$ — Peso colombiano", "sort_order": 7},
    {"domain": "currencies", "code": "BRL", "label_es": "Real Brasileño", "description": "R$ — Real brasileño", "sort_order": 8},
    {"domain": "currencies", "code": "CLP", "label_es": "Peso Chileno", "description": "CL$ — Peso chileno", "sort_order": 9},
    # ── Categories ─────────────────────────────────────
    {"domain": "categories", "code": "oficina", "label_es": "Oficina y suministros", "description": "Papelería, útiles de oficina, mobiliario", "sort_order": 0},
    {"domain": "categories", "code": "tecnologia", "label_es": "Tecnología y software", "description": "Equipos informáticos, software, servicios IT", "sort_order": 1},
    {"domain": "categories", "code": "servicios_profesionales", "label_es": "Servicios profesionales", "description": "Consultoría, asesoría legal, contable, marketing", "sort_order": 2},
    {"domain": "categories", "code": "transporte", "label_es": "Transporte y logística", "description": "Fletes, envíos, transporte de personal, combustible", "sort_order": 3},
    {"domain": "categories", "code": "servicios_publicos", "label_es": "Servicios públicos", "description": "Electricidad, agua, internet, telefonía", "sort_order": 4},
    {"domain": "categories", "code": "alquileres", "label_es": "Alquileres", "description": "Alquiler de oficinas, locales, equipos", "sort_order": 5},
    {"domain": "categories", "code": "marketing", "label_es": "Marketing y publicidad", "description": "Publicidad, redes sociales, diseño gráfico, comerciales", "sort_order": 6},
    {"domain": "categories", "code": "capacitacion", "label_es": "Capacitación y educación", "description": "Cursos, seminarios, materiales educativos", "sort_order": 7},
    {"domain": "categories", "code": "salud", "label_es": "Salud y seguros", "description": "Seguros médicos, medicinas, exámenes", "sort_order": 8},
    {"domain": "categories", "code": "alimentacion", "label_es": "Alimentación y representación", "description": "Comidas, catering, eventos corporativos", "sort_order": 9},
    {"domain": "categories", "code": "importacion", "label_es": "Importación y aduanas", "description": "Derechos aduaneros, fletes internacionales, agentes de aduana", "sort_order": 10},
    {"domain": "categories", "code": "gastos_financieros", "label_es": "Gastos financieros", "description": "Comisiones bancarias, intereses, cargos por transferencias", "sort_order": 11},
    {"domain": "categories", "code": "construccion", "label_es": "Construcción y mantenimiento", "description": "Obras, reparaciones, mantenimiento de instalaciones", "sort_order": 12},
    {"domain": "categories", "code": "combustible", "label_es": "Combustible y lubricantes", "description": "Gasolina, diesel, gas, lubricantes para vehículos", "sort_order": 13},
    {"domain": "categories", "code": "otros", "label_es": "Otros gastos", "description": "Gastos no clasificados en categorías anteriores", "sort_order": 14},
    # ── Report Statuses ────────────────────────────────
    {"domain": "report_statuses", "code": "pending", "label_es": "Pendiente", "description": "Período no reportado aún a la DGII", "sort_order": 0},
    {"domain": "report_statuses", "code": "draft", "label_es": "En preparación", "description": "Revisando facturas antes de enviar", "sort_order": 1},
    {"domain": "report_statuses", "code": "completed", "label_es": "Completado", "description": "Reporte enviado y aceptado por DGII", "sort_order": 2},
    {"domain": "report_statuses", "code": "error", "label_es": "Con errores", "description": "Reporte enviado con alertas de validación", "sort_order": 3},
    # ── Transaction Types ──────────────────────────────
    {"domain": "transaction_types", "code": "income", "label_es": "Ingreso / Venta", "description": "Facturas de venta o ingreso (reporte 607)", "sort_order": 0},
    {"domain": "transaction_types", "code": "expense", "label_es": "Gasto / Compra", "description": "Facturas de compra o gasto (reporte 606)", "sort_order": 1},
]

SEED_HASH = hashlib.sha256(json.dumps(SEED_ENTRIES, sort_keys=True, default=str).encode()).hexdigest()


def _cache_key(domain: str) -> str:
    return f"refdata:{domain}"


def _hash_key() -> str:
    return "refdata:seed_hash"


def is_seed_up_to_date(db: Session) -> bool:
    cached = cache_get(_hash_key())
    return cached is not None and cached == SEED_HASH


def mark_seed_up_to_date() -> None:
    cache_set(_hash_key(), SEED_HASH, REFDATA_CACHE_TTL)


def seed_reference_data(db: Session) -> int:
    now = utc_now()
    dialect = db.bind.dialect.name if db.bind else "postgresql"

    if dialect != "sqlite":
        cached_hash = cache_get(_hash_key())
        if cached_hash == SEED_HASH:
            return 0

    existing_pairs: set[tuple[str, str]] = set()
    rows = db.query(ReferenceData.domain, ReferenceData.code).all()
    for domain, code in rows:
        existing_pairs.add((domain, code))

    to_insert = [e for e in SEED_ENTRIES if (e["domain"], e["code"]) not in existing_pairs]
    if not to_insert:
        if dialect != "sqlite":
            mark_seed_up_to_date()
        return 0

    if dialect == "sqlite":
        for e in to_insert:
            db.add(ReferenceData(**e, metadata_json=e.get("metadata_json")))
        db.commit()
    else:
        values = []
        for e in to_insert:
            values.append({
                "id": uuid7(),
                "domain": e["domain"],
                "code": e["code"],
                "label_es": e["label_es"],
                "description": e.get("description"),
                "sort_order": e.get("sort_order", 0),
                "is_active": e.get("is_active", True),
                "metadata_json": e.get("metadata_json"),
                "created_at": now,
                "updated_at": now,
            })
        stmt = pg_insert(ReferenceData).values(values)
        stmt = stmt.on_conflict_do_nothing(index_elements=["domain", "code"])
        db.execute(stmt)
        db.commit()
        mark_seed_up_to_date()

    logger.info("seed_reference_data — %d row(s) inserted, hash=%s", len(to_insert), SEED_HASH[:12])
    return len(to_insert)


def get_cached_domain(db: Session, domain: str) -> list[dict[str, Any]]:
    cached = cache_get(_cache_key(domain))
    if cached is not None:
        return cached

    items = (
        db.query(ReferenceData)
        .filter(ReferenceData.domain == domain, ReferenceData.is_active.is_(True))
        .order_by(ReferenceData.sort_order, ReferenceData.code)
        .all()
    )
    serialized = [item.to_dict() for item in items]
    cache_set(_cache_key(domain), serialized, REFDATA_CACHE_TTL)
    return serialized


def invalidate_domain_cache(domain: str) -> None:
    cache_delete(_cache_key(domain))


def invalidate_all_caches() -> None:
    for e in SEED_ENTRIES:
        cache_delete(_cache_key(e["domain"]))
    cache_delete(_hash_key())
