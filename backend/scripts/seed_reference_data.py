"""
Seed reference_data table with all DGII catalogs and default reference data.

Usage:
    python -m backend.scripts.seed_reference_data
"""

import json
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime
from uuid_utils import uuid7

from app.database import Base, get_engine, SessionLocal
from app.models.reference_data import ReferenceData

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DGII Goods & Services Types (606 — Column 3)
# ---------------------------------------------------------------------------
GOODS_SERVICES_TYPES = [
    ("01", "Gastos de personal", "Sueldos, salarios, comisiones, bonificaciones, prestaciones y demás gastos de personal"),
    ("02", "Gastos por trabajos, suministros y servicios", "Honorarios profesionales, servicios de terceros, suministros y servicios en general"),
    ("03", "Arrendamientos", "Alquileres de bienes muebles e inmuebles"),
    ("04", "Gastos de activos fijos", "Mantenimiento, reparación y depreciación de activos fijos"),
    ("05", "Gastos de representación", "Gastos de viaje, hospedaje, alimentación y representación"),
    ("06", "Otras deducciones admitidas", "Donaciones, cuotas, suscripciones y otras deducciones permitidas por ley"),
    ("07", "Gastos financieros", "Intereses, comisiones bancarias, diferencias cambiarias y otros gastos financieros"),
    ("08", "Gastos extraordinarios", "Pérdidas por siniestros, robos, multas y otros gastos no operativos"),
    ("09", "Compras y gastos que formarán parte del costo de venta", "Mercancías, materias primas, envases, empaques y otros costos directos"),
    ("10", "Adquisiciones de activos", "Compra de terrenos, edificios, maquinarias, equipos y otros activos fijos"),
    ("11", "Gastos de seguros", "Primas de seguros contra incendios, robo, responsabilidad civil y otros"),
]

# ---------------------------------------------------------------------------
# DGII Payment Methods (606 — Column 23, 607 — Columns 17-23)
# ---------------------------------------------------------------------------
PAYMENT_METHODS = [
    ("01", "Efectivo", "Pago en efectivo"),
    ("02", "Cheque / Transferencia / Depósito", "Pago mediante cheque, transferencia bancaria o depósito"),
    ("03", "Tarjeta crédito/débito", "Pago con tarjeta de crédito o débito"),
    ("04", "Venta a crédito", "Monto no cobrado al momento de la emisión (cuenta por cobrar)"),
    ("05", "Permuta", "Intercambio de bienes o servicios sin uso de dinero"),
    ("06", "Nota de crédito / Bono", "Pago mediante nota de crédito, bonos o certificados"),
    ("07", "Mixto / Otra forma", "Combinación de formas de pago u otro método no especificado"),
]

# ---------------------------------------------------------------------------
# NCF Types (Traditional: B01-B17 + Electronic: E31-E47)
# ---------------------------------------------------------------------------
NCF_TYPES = [
    # Traditional (serie B)
    ("B01", "Factura de Crédito Fiscal", "Transacciones entre contribuyentes registrados. Genera crédito ITBIS.", "B", "01"),
    ("B02", "Factura de Consumo", "Ventas a consumidores finales. No genera crédito ITBIS.", "B", "02"),
    ("B03", "Nota de Débito", "Aumenta monto de comprobante anterior (intereses, fletes, ajustes).", "B", "03"),
    ("B04", "Nota de Crédito", "Reduce monto de comprobante anterior (devoluciones, descuentos, anulaciones).", "B", "04"),
    ("B11", "Comprobante de Compras", "Lo emite el comprador cuando el proveedor no tiene RNC (informal).", "B", "11"),
    ("B12", "Registro Único de Ingresos (RUI)", "Resumen diario de transacciones con consumidores finales (bienes exentos ITBIS).", "B", "12"),
    ("B13", "Comprobante para Gastos Menores", "Gastos pequeños del personal de la empresa (caja chica).", "B", "13"),
    ("B14", "Comprobante para Regímenes Especiales", "Ventas a zonas francas, turismo y otros regímenes con exención.", "B", "14"),
    ("B15", "Comprobante Gubernamental", "Ventas al Gobierno Central, instituciones autónomas y Seguridad Social.", "B", "15"),
    ("B16", "Comprobante para Exportaciones", "Ventas fuera del territorio dominicano. Tasa 0% ITBIS.", "B", "16"),
    ("B17", "Comprobante para Pagos al Exterior", "Pagos a no residentes fiscales. Retención total ISR aplica.", "B", "17"),
    # Electronic (serie E)
    ("E31", "Factura de Crédito Fiscal Electrónica", "e-CF equivalente a B01. Entre contribuyentes registrados.", "E", "31"),
    ("E32", "Factura de Consumo Electrónica", "e-CF equivalente a B02. Consumidores finales.", "E", "32"),
    ("E33", "Nota de Débito Electrónica", "e-CF equivalente a B03.", "E", "33"),
    ("E34", "Nota de Crédito Electrónica", "e-CF equivalente a B04.", "E", "34"),
    ("E41", "Comprobante Electrónico de Compras", "e-CF equivalente a B11.", "E", "41"),
    ("E43", "Comprobante Electrónico para Gastos Menores", "e-CF equivalente a B13.", "E", "43"),
    ("E44", "Comprobante Electrónico para Regímenes Especiales", "e-CF equivalente a B14.", "E", "44"),
    ("E45", "Comprobante Electrónico Gubernamental", "e-CF equivalente a B15.", "E", "45"),
    ("E46", "Comprobante Electrónico para Exportaciones", "e-CF equivalente a B16.", "E", "46"),
    ("E47", "Comprobante Electrónico para Pagos al Exterior", "e-CF equivalente a B17.", "E", "47"),
]

# ---------------------------------------------------------------------------
# ISR Retention Types (606 — Column 17)
# ---------------------------------------------------------------------------
ISR_RETENTION_TYPES = [
    ("01", "Alquileres", "Retención por alquiler de bienes muebles e inmuebles"),
    ("02", "Honorarios por servicios", "Retención por honorarios profesionales y servicios en general"),
    ("03", "Otras rentas", "Otras rentas no especificadas en las categorías anteriores"),
    ("04", "Otras rentas (rentas presuntas)", "Rentas presuntas según normativa fiscal"),
    ("05", "Intereses pagados a personas jurídicas residentes", "Intereses pagados a empresas residentes"),
    ("06", "Intereses pagados a personas físicas residentes", "Intereses pagados a personas físicas residentes"),
    ("07", "Retención por proveedores del Estado", "Retenciones aplicadas a proveedores del gobierno"),
    ("08", "Juegos telefónicos", "Retención por juegos de azar telefónicos"),
    ("09", "Retenciones subsector de ganadería de carne bovina", "Retención específica para el subsector de ganadería"),
]

# ---------------------------------------------------------------------------
# Income Types (607 — Column 5)
# ---------------------------------------------------------------------------
INCOME_TYPES = [
    ("01", "Ingresos por operaciones (No financieros)", "Ingresos ordinarios por venta de bienes y servicios — el más común"),
    ("02", "Ingresos Financieros", "Intereses ganados, diferencias cambiarias, dividendos"),
    ("03", "Ingresos Extraordinarios", "Ganancias por venta de activos, indemnizaciones, y otros no recurrentes"),
    ("04", "Ingresos por Arrendamientos", "Ingresos por alquiler de bienes muebles e inmuebles"),
    ("05", "Ingresos por Venta de Activo Depreciable", "Ganancia por venta de activos fijos depreciables"),
    ("06", "Otros Ingresos", "Cualquier otro ingreso no clasificado en las categorías anteriores"),
]

# ---------------------------------------------------------------------------
# ID Types
# ---------------------------------------------------------------------------
ID_TYPES = [
    ("01", "RNC", "Registro Nacional del Contribuyente (personas jurídicas y físicas con RNC)"),
    ("02", "Cédula", "Cédula de identidad y electoral dominicana (11 dígitos)"),
    ("03", "Pasaporte / ID Tributaria", "Para extranjeros sin RNC o cédula dominicana"),
]

# ---------------------------------------------------------------------------
# Currencies
# ---------------------------------------------------------------------------
CURRENCIES = [
    ("DOP", "Peso Dominicano", "RD$ — Moneda oficial de República Dominicana"),
    ("USD", "Dólar Estadounidense", "US$ — Dólar de los Estados Unidos"),
    ("EUR", "Euro", "€ — Moneda de la Unión Europea"),
    ("MXN", "Peso Mexicano", "MX$ — Peso mexicano"),
    ("CAD", "Dólar Canadiense", "CA$ — Dólar canadiense"),
    ("GBP", "Libra Esterlina", "£ — Libra del Reino Unido"),
    ("ARS", "Peso Argentino", "AR$ — Peso argentino"),
    ("COP", "Peso Colombiano", "CO$ — Peso colombiano"),
    ("BRL", "Real Brasileño", "R$ — Real brasileño"),
    ("CLP", "Peso Chileno", "CL$ — Peso chileno"),
]

# ---------------------------------------------------------------------------
# Default categories (user-facing, not DGII-mandated)
# ---------------------------------------------------------------------------
DEFAULT_CATEGORIES = [
    ("oficina", "Oficina y suministros", "Papelería, útiles de oficina, mobiliario"),
    ("tecnologia", "Tecnología y software", "Equipos informáticos, software, servicios IT"),
    ("servicios_profesionales", "Servicios profesionales", "Consultoría, asesoría legal, contable, marketing"),
    ("transporte", "Transporte y logística", "Fletes, envíos, transporte de personal, combustible"),
    ("servicios_publicos", "Servicios públicos", "Electricidad, agua, internet, telefonía"),
    ("alquileres", "Alquileres", "Alquiler de oficinas, locales, equipos"),
    ("marketing", "Marketing y publicidad", "Publicidad, redes sociales, diseño gráfico, comerciales"),
    ("capacitacion", "Capacitación y educación", "Cursos, seminarios, materiales educativos"),
    ("salud", "Salud y seguros", "Seguros médicos, medicinas, exámenes"),
    ("alimentacion", "Alimentación y representación", "Comidas, catering, eventos corporativos"),
    ("importacion", "Importación y aduanas", "Derechos aduaneros, fletes internacionales, agentes de aduana"),
    ("gastos_financieros", "Gastos financieros", "Comisiones bancarias, intereses, cargos por transferencias"),
    ("construccion", "Construcción y mantenimiento", "Obras, reparaciones, mantenimiento de instalaciones"),
    ("combustible", "Combustible y lubricantes", "Gasolina, diesel, gas, lubricantes para vehículos"),
    ("otros", "Otros gastos", "Gastos no clasificados en categorías anteriores"),
]

# ---------------------------------------------------------------------------
# DGII Report Period Status
# ---------------------------------------------------------------------------
REPORT_STATUSES = [
    ("pending", "Pendiente", "Período no reportado aún a la DGII"),
    ("draft", "En preparación", "Revisando facturas antes de enviar"),
    ("completed", "Completado", "Reporte enviado y aceptado por DGII"),
    ("error", "Con errores", "Reporte enviado con alertas de validación"),
]

# ---------------------------------------------------------------------------
# Entry type for 607
# ---------------------------------------------------------------------------
TRANSACTION_TYPES = [
    ("income", "Ingreso / Venta", "Facturas de venta o ingreso (reporte 607)"),
    ("expense", "Gasto / Compra", "Facturas de compra o gasto (reporte 606)"),
]


def seed_domain(db, domain: str, items: list[tuple], base_sort: int = 0, extra_meta: dict | None = None):
    for i, item in enumerate(items):
        code = item[0]
        label = item[1]
        desc = item[2] if len(item) > 2 else None
        existing = db.query(ReferenceData).filter(
            ReferenceData.domain == domain,
            ReferenceData.code == code,
        ).first()
        if existing:
            existing.label_es = label
            existing.description = desc
            existing.sort_order = base_sort + i
            if extra_meta:
                existing.metadata_json = json.dumps(extra_meta.get(code, {}))
            logger.info("Updated: %s / %s", domain, code)
        else:
            meta = extra_meta.get(code) if extra_meta else None
            entry = ReferenceData(
                id=uuid7(),
                domain=domain,
                code=code,
                label_es=label,
                description=desc,
                sort_order=base_sort + i,
                is_active=True,
                metadata_json=json.dumps(meta) if meta else None,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(entry)
            logger.info("Created: %s / %s", domain, code)
    db.commit()
    logger.info("Seeded domain '%s' with %d items", domain, len(items))


def main():
    logger.info("=" * 60)
    logger.info("Seeding reference data...")
    logger.info("=" * 60)

    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # Build NCF metadata
        ncf_meta = {}
        for code, label, desc, serie, tipo in NCF_TYPES:
            ncf_meta[code] = {"serie": serie, "tipo_code": tipo}

        seed_domain(db, "ncf_types", NCF_TYPES, 0, ncf_meta)
        seed_domain(db, "goods_services_types", GOODS_SERVICES_TYPES, 0)
        seed_domain(db, "payment_methods", PAYMENT_METHODS, 0)
        seed_domain(db, "isr_retention_types", ISR_RETENTION_TYPES, 0)
        seed_domain(db, "income_types", INCOME_TYPES, 0)
        seed_domain(db, "id_types", ID_TYPES, 0)
        seed_domain(db, "currencies", CURRENCIES, 0)
        seed_domain(db, "categories", DEFAULT_CATEGORIES, 0)
        seed_domain(db, "report_statuses", REPORT_STATUSES, 0)
        seed_domain(db, "transaction_types", TRANSACTION_TYPES, 0)

        logger.info("")
        logger.info("=" * 60)
        logger.info("Reference data seeding complete!")
        logger.info("=" * 60)

    except Exception as e:
        logger.error("Error seeding reference data: %s", e)
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
