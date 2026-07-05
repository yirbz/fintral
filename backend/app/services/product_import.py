"""
ProductImportService — parse, validate, and bulk-import product CSV/XLSX files.
"""
import csv
import io
import logging
from typing import Any

logger = logging.getLogger(__name__)

VALID_TAX_RATES = {0.0, 9.0, 16.0, 18.0}
MAX_NAME_LENGTH = 255
MAX_INTERNAL_CODE_LENGTH = 100
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_ROWS = 500


class ProductImportError:
    def __init__(self, row: int, internal_code: str | None, reason: str):
        self.row = row
        self.internal_code = internal_code
        self.reason = reason

    def to_dict(self) -> dict:
        return {"row": self.row, "internal_code": self.internal_code, "reason": self.reason}


def _detect_delimiter(sample: str) -> str:
    first_line = sample.split("\n")[0]
    comma_count = first_line.count(",")
    semicolon_count = first_line.count(";")
    return ";" if semicolon_count > comma_count else ","


def parse_csv(file_bytes: bytes) -> tuple[list[dict[str, Any]], list[ProductImportError]]:
    """Parse CSV bytes into list of row dicts. Auto-detects comma vs semicolon."""
    text = file_bytes.decode("utf-8-sig")
    delimiter = _detect_delimiter(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = []
    errors = []
    for i, row in enumerate(reader, start=1):
        if not any(v.strip() for v in row.values()):
            continue
        normalized = {k.strip().lower(): v.strip() if v else "" for k, v in row.items()}
        rows.append(normalized)
    return rows, errors


def parse_xlsx(file_bytes: bytes) -> tuple[list[dict[str, Any]], list[ProductImportError]]:
    """Parse XLSX bytes into list of row dicts (first worksheet only)."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        return [], []

    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if not header_row:
        return [], []

    headers = [str(h).strip().lower() if h else f"col_{i}" for i, h in enumerate(header_row)]

    rows = []
    errors = []
    for i, row in enumerate(rows_iter, start=1):
        if not any(v is not None for v in row):
            continue
        row_dict = {}
        for j, val in enumerate(row):
            h = headers[j] if j < len(headers) else f"col_{j}"
            row_dict[h] = str(val).strip() if val is not None else ""
        rows.append(row_dict)

    wb.close()
    return rows, errors


def validate_row(row_dict: dict, row_num: int) -> tuple[dict | None, ProductImportError | None]:
    """Validate a single product row. Returns (normalized_row, error)."""
    name = row_dict.get("nombre", row_dict.get("name", "")).strip()
    if not name:
        return None, ProductImportError(row_num, None, "El nombre del producto es obligatorio")
    if len(name) > MAX_NAME_LENGTH:
        return None, ProductImportError(row_num, None, f"El nombre no puede exceder {MAX_NAME_LENGTH} caracteres")

    internal_code = row_dict.get("codigo_interno", row_dict.get("internal_code", row_dict.get("codigo", ""))).strip()
    if len(internal_code) > MAX_INTERNAL_CODE_LENGTH:
        return None, ProductImportError(row_num, internal_code, f"El código interno no puede exceder {MAX_INTERNAL_CODE_LENGTH} caracteres")

    description = row_dict.get("descripcion", row_dict.get("description", "")).strip()

    price_str = row_dict.get("precio", row_dict.get("price", "0")).strip()
    price_str = price_str.replace(",", ".").replace("$", "").replace("RD$", "").strip()
    try:
        price = float(price_str)
    except (ValueError, TypeError):
        return None, ProductImportError(row_num, internal_code, f"Precio inválido: '{price_str}'")
    if price < 0:
        return None, ProductImportError(row_num, internal_code, "El precio no puede ser negativo")

    tax_str = row_dict.get("tasa_itbis", row_dict.get("tax_rate", row_dict.get("itbis", "18"))).strip()
    tax_str = tax_str.replace(",", ".").replace("%", "").strip()
    try:
        tax_rate = float(tax_str)
    except (ValueError, TypeError):
        return None, ProductImportError(row_num, internal_code, f"Tasa de ITBIS inválida: '{tax_str}'")

    if tax_rate not in VALID_TAX_RATES:
        valid_list = ", ".join(f"{r}%" for r in sorted(VALID_TAX_RATES))
        return None, ProductImportError(
            row_num, internal_code,
            f"Tasa de ITBIS debe ser una de: {valid_list}. Recibido: {tax_rate}%",
        )

    return {
        "name": name,
        "internal_code": internal_code or None,
        "description": description or None,
        "price": price,
        "tax_rate": tax_rate,
    }, None
