"""
Odoo JSON-2 API connector for pushing vendor bills directly into Odoo.

Uses the new /json/2 endpoint (Odoo 19+) with bearer API key auth.
XML-RPC (/xmlrpc/2/object) is deprecated since Odoo 19 and
scheduled for removal in Odoo 22 (fall 2028).
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

from app.models import IntegrationConnection, Invoice

logger = logging.getLogger(__name__)


class OdooConnector:
    _SESSION = requests.Session()

    # ── HTTP helpers ───────────────────────────────────────────────

    def _build_headers(self, config: dict) -> dict:
        api_key = config.get("api_key", "")
        db = config.get("database", "")
        headers = {
            "Authorization": f"bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Fintral/1.0",
        }
        if db:
            headers["X-Odoo-Database"] = db
        return headers

    def _post(self, config: dict, model: str, method: str, payload: dict) -> Any:
        """POST /json/2/<model>/<method> and return the parsed JSON response."""
        url = config.get("url", "").rstrip("/")
        headers = self._build_headers(config)
        r = self._SESSION.post(
            f"{url}/json/2/{model}/{method}",
            headers=headers,
            json=payload,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    # ── Connection testing ─────────────────────────────────────────

    def test_connection(self, config: dict) -> dict:
        """Test connection using /web/version + res.users/context_get."""
        url = config.get("url", "").rstrip("/")
        headers = self._build_headers(config)

        try:
            r = self._SESSION.get(
                f"{url}/web/version", headers=headers, timeout=15
            )
            r.raise_for_status()
            version = r.json()
            server_series = ""
            vi = version.get("version_info")
            if vi and len(vi) > 0:
                server_series = f"Odoo {vi[0]}"

            r2 = self._SESSION.post(
                f"{url}/json/2/res.users/context_get",
                headers=headers,
                json={},
                timeout=15,
            )
            r2.raise_for_status()
            ctx = r2.json()
        except requests.RequestException as e:
            return {"ok": False, "error": str(e)}

        return {
            "ok": True,
            "server_version": version.get("version", ""),
            "server_series": server_series,
            "uid": ctx.get("uid"),
        }

    def get_connection_status(self, connection: IntegrationConnection) -> dict:
        """Test a saved connection and return status."""
        config = connection.get_config()
        if not config:
            return {"ok": False, "error": "No configuration found"}
        try:
            return self.test_connection(config)
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ── Partner helpers ────────────────────────────────────────────

    def _search_or_create_partner(self, config: dict, invoice: Invoice) -> int:
        vat = invoice.vendor_tax_id or ""
        name = invoice.vendor_name or "Unknown Vendor"

        if vat:
            ids = self._post(config, "res.partner", "search", {
                "domain": [["vat", "=", vat]],
            })
            if ids:
                return ids[0]

        ids = self._post(config, "res.partner", "search", {
            "domain": [["name", "=", name]],
        })
        if ids:
            return ids[0]

        country_code = invoice.vendor_country or "DO"
        partner_vals: dict = {
            "name": name,
            "vat": vat,
            "country_id": self._search_country(config, country_code),
        }

        try:
            fields = self._post(config, "res.partner", "fields_get", {
                "attributes": ["string"],
            })
            if "is_company" in fields:
                partner_vals["is_company"] = True
        except Exception:
            pass

        partner_id = self._post(config, "res.partner", "create", {
            "args": [partner_vals],
        })
        logger.info("Created Odoo partner %s (id=%s)", name, partner_id)
        return partner_id

    def _search_country(self, config: dict, code: str) -> int:
        ids = self._post(config, "res.country", "search", {
            "domain": [["code", "=", code]],
        })
        return ids[0] if ids else 0

    def _search_currency(self, config: dict, code: str) -> int:
        ids = self._post(config, "res.currency", "search", {
            "domain": [["name", "=", code]],
        })
        return ids[0] if ids else 0

    def _search_account(self, config: dict, category: str) -> int:
        ids = self._post(config, "account.account", "search", {
            "domain": [["name", "ilike", category or "Expenses"]],
        })
        if ids:
            return ids[0]

        ids = self._post(config, "account.account", "search", {
            "domain": [["account_type", "=", "expense"]],
            "limit": 1,
        })
        return ids[0] if ids else 0

    def _search_taxes(self, config: dict) -> List[int]:
        ids = self._post(config, "account.tax", "search", {
            "domain": [["amount", "=", 18.0], ["type_tax_use", "=", "purchase"]],
        })
        return ids if ids else []

    # ── Financial helpers ──────────────────────────────────────────

    def _to_number(self, value) -> Optional[float]:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def _parse_raw_data(self, raw) -> dict:
        try:
            if raw:
                return json.loads(raw)
        except Exception:
            pass
        return {}

    def _normalize_goods_type(self, value) -> Optional[str]:
        if not value:
            return None
        digits = "".join([c for c in str(value) if c.isdigit()])
        if not digits:
            return None
        if len(digits) == 1:
            digits = f"0{digits}"
        valid = {f"{i:02d}" for i in range(1, 12)}
        return digits if digits in valid else None

    def _split_base_by_type(self, base, category, goods_type):
        goods_keywords = ['oficina', 'inventario', 'mercancia', 'mercancía', 'compras', 'equipos', 'activos', 'maquinaria']
        goods_types = {"04", "09", "10"}
        is_goods = goods_type in goods_types or any(k in (category or '').lower() for k in goods_keywords)
        if is_goods:
            return base, 0.0
        return 0.0, base

    # ── Push vendor bill ───────────────────────────────────────────

    def push_vendor_bill(self, config: dict, invoice: Invoice) -> Dict[str, Any]:
        """Push a single invoice as a vendor bill to Odoo via JSON-2 API."""
        partner_id = self._search_or_create_partner(config, invoice)

        # ── Dates ─────────────────────────────────────────────
        date_val = invoice.invoice_date or datetime.utcnow()
        date_str = date_val.strftime("%Y-%m-%d") if isinstance(date_val, datetime) else str(date_val)[:10]
        due_str = (date_val + timedelta(days=30)).strftime("%Y-%m-%d") if isinstance(date_val, datetime) else date_str

        # ── Parse financial data ──────────────────────────────
        raw = self._parse_raw_data(invoice.raw_extracted_data)
        total = self._to_number(invoice.total_amount) or self._to_number(raw.get("total_amount")) or 0
        tax = self._to_number(invoice.tax_amount) or self._to_number(raw.get("tax_amount")) or 0
        base = total - tax

        goods_type = self._normalize_goods_type(
            invoice.goods_services_type or raw.get("goods_services_type")
        )

        amount_services = self._to_number(raw.get("services_amount"))
        amount_goods = self._to_number(raw.get("goods_amount"))
        if amount_services is None and amount_goods is None:
            amount_goods, amount_services = self._split_base_by_type(base, invoice.category, goods_type)
        elif amount_services is None and amount_goods is not None:
            amount_services = max(base - amount_goods, 0.0)
        elif amount_goods is None and amount_services is not None:
            amount_goods = max(base - amount_services, 0.0)
        amount_services = amount_services or 0.0
        amount_goods = amount_goods or 0.0

        # ── Odoo lookups ──────────────────────────────────────
        currency_id = self._search_currency(config, invoice.currency or "DOP")
        account_id = self._search_account(config, invoice.category or "Expenses")

        tax_ids: List[int] = []
        if tax > 0:
            tax_ids = self._search_taxes(config)

        # ── Build invoice lines ───────────────────────────────
        line_items: list = []

        raw_items = invoice.line_items_data
        items: list = []
        if raw_items:
            try:
                items = json.loads(raw_items) if isinstance(raw_items, str) else raw_items
            except (json.JSONDecodeError, TypeError):
                items = []

        if items:
            for item in items:
                qty = float(item.get("quantity", 1))
                price = float(item.get("unit_price", 0) or item.get("subtotal", 0))
                line_items.append((0, 0, {
                    "name": item.get("description", "Line item")[:200],
                    "quantity": qty,
                    "price_unit": round(price, 2),
                    "account_id": account_id,
                    "tax_ids": [(6, 0, tax_ids)] if tax_ids else [],
                }))
        elif amount_services > 0 and amount_goods > 0:
            line_items.append((0, 0, {
                "name": "Servicios",
                "quantity": 1,
                "price_unit": round(amount_services, 2),
                "account_id": account_id,
                "tax_ids": [(6, 0, tax_ids)] if tax_ids else [],
            }))
            line_items.append((0, 0, {
                "name": "Bienes",
                "quantity": 1,
                "price_unit": round(amount_goods, 2),
                "account_id": account_id,
                "tax_ids": [(6, 0, tax_ids)] if tax_ids else [],
            }))
        else:
            line_items.append((0, 0, {
                "name": (invoice.description or raw.get("description") or "Servicios")[:200],
                "quantity": 1,
                "price_unit": round(amount_services or amount_goods or total, 2),
                "account_id": account_id,
                "tax_ids": [(6, 0, tax_ids)] if tax_ids else [],
            }))

        # ── Create the vendor bill ────────────────────────────
        move_data = {
            "move_type": "in_invoice",
            "partner_id": partner_id,
            "invoice_date": date_str,
            "invoice_date_due": due_str,
            "ref": invoice.invoice_number or f"Fintral-{invoice.id}",
            "currency_id": currency_id,
            "invoice_line_ids": line_items,
        }

        move_id = self._post(config, "account.move", "create", {
            "args": [move_data],
        })

        logger.info(
            "Created Odoo vendor bill id=%s for invoice=%s partner=%s total=%s tax=%s lines=%d",
            move_id, invoice.invoice_number, invoice.vendor_name, total, tax, len(line_items),
        )

        return {"odoo_move_id": move_id, "partner_id": partner_id}

    def push_vendor_bills(self, config: dict, invoices: List[Invoice]) -> List[Dict[str, Any]]:
        """Push multiple invoices as vendor bills. Returns list of results."""
        results = []
        for inv in invoices:
            try:
                result = self.push_vendor_bill(config, inv)
                result["invoice_id"] = str(inv.id)
                result["invoice_number"] = inv.invoice_number
                result["success"] = True
            except Exception as e:
                logger.error("Failed to push invoice %s: %s", inv.id, e)
                result = {
                    "invoice_id": str(inv.id),
                    "invoice_number": inv.invoice_number,
                    "success": False,
                    "error": str(e),
                }
            results.append(result)
        return results
