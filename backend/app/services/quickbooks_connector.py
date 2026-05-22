"""
QuickBooks Online REST connector — OAuth 2.0 + vendor bill push.

Uses `requests` for HTTP. Auth flow:
  1. get_auth_url()  →  user authorizes in Intuit
  2. exchange_code() →  access_token + refresh_token (stored in IntegrationConnection)
  3. push_vendor_bill() → POST /v3/company/{realmId}/bill
"""

import base64
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

from app.config import (
    QUICKBOOKS_CLIENT_ID,
    QUICKBOOKS_CLIENT_SECRET,
    QUICKBOOKS_REDIRECT_URI,
    QUICKBOOKS_SANDBOX,
)
from app.models import Invoice

logger = logging.getLogger(__name__)

QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
QB_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke"
QB_SCOPE = "com.intuit.quickbooks.accounting"
QB_MINOR_VERSION = 73

if QUICKBOOKS_SANDBOX:
    QB_API_BASE = "https://sandbox-quickbooks.api.intuit.com"
else:
    QB_API_BASE = "https://quickbooks.api.intuit.com"


class QuickBooksConnector:

    def __init__(self):
        self._client_id = QUICKBOOKS_CLIENT_ID
        self._client_secret = QUICKBOOKS_CLIENT_SECRET
        self._redirect_uri = QUICKBOOKS_REDIRECT_URI

    # ── OAuth 2.0 ──────────────────────────────────────────────

    def get_auth_url(self, state: str = "") -> str:
        params = {
            "client_id": self._client_id,
            "response_type": "code",
            "scope": QB_SCOPE,
            "redirect_uri": self._redirect_uri,
        }
        if state:
            params["state"] = state
        qs = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
        url = f"{QB_AUTH_URL}?{qs}"
        logger.info("QB auth URL generated redirect_uri=%s client_id_len=%d", self._redirect_uri, len(self._client_id))
        return url

    def exchange_code(self, code: str, realm_id: str) -> dict:
        auth = base64.b64encode(
            f"{self._client_id}:{self._client_secret}".encode()
        ).decode()

        logger.info(
            "QB token exchange calling %s realm_id=%s code_len=%d",
            QB_TOKEN_URL, realm_id, len(code),
        )

        resp = requests.post(
            QB_TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth}",
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self._redirect_uri,
            },
            timeout=30,
        )

        logger.info("QB token exchange response status=%d", resp.status_code)

        if not resp.ok:
            err = resp.text[:500]
            logger.error("QB token exchange failed status=%d body=%s", resp.status_code, err)
            raise ConnectionError(f"QuickBooks token exchange failed: {err}")

        data = resp.json()
        logger.info("QB token exchange OK keys=%s", list(data.keys()))
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
            "token_expiry": (
                datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))
            ).isoformat(),
            "realm_id": realm_id,
            "client_id": self._client_id,
            "client_secret": self._client_secret,
        }

    def refresh_access_token(self, config: dict) -> dict:
        refresh_token = config.get("refresh_token")
        if not refresh_token:
            raise ValueError("No refresh_token in config")

        auth = base64.b64encode(
            f"{self._client_id}:{self._client_secret}".encode()
        ).decode()

        resp = requests.post(
            QB_TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth}",
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            timeout=30,
        )
        if not resp.ok:
            err = resp.text[:500]
            logger.error("QB token refresh failed: %s", err)
            raise ConnectionError(f"QuickBooks token refresh failed: {err}")

        data = resp.json()
        config["access_token"] = data["access_token"]
        config["refresh_token"] = data.get("refresh_token", refresh_token)
        config["token_expiry"] = (
            datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))
        ).isoformat()
        return config

    def _ensure_valid_token(self, config: dict) -> str:
        expiry = config.get("token_expiry")
        if expiry:
            try:
                if datetime.fromisoformat(expiry) <= datetime.utcnow():
                    config = self.refresh_access_token(config)
            except (ValueError, TypeError):
                config = self.refresh_access_token(config)
        return config["access_token"], config

    # ── API helpers ────────────────────────────────────────────

    def _api(
        self,
        config: dict,
        method: str,
        path: str,
        params: Optional[dict] = None,
        data: Optional[dict] = None,
    ) -> dict:
        token, config = self._ensure_valid_token(config)
        realm_id = config.get("realm_id", "")
        url = f"{QB_API_BASE}/v3/company/{realm_id}/{path.lstrip('/')}"
        req_params = {"minorversion": QB_MINOR_VERSION}
        if params:
            req_params.update(params)

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"

        resp = requests.request(
            method=method,
            url=url,
            params=req_params,
            headers=headers,
            json=data,
            timeout=30,
        )
        if not resp.ok:
            body = resp.text[:1000]
            logger.error("QB API %s %s failed: %s", method, path, body)
            raise ConnectionError(f"QuickBooks API error ({resp.status_code}): {body}")

        return resp.json()

    def _query(self, config: dict, select: str, entity: str, where: str = "") -> List[dict]:
        q = f"select {select} from {entity}"
        if where:
            q += f" where {where}"
        result = self._api(config, "GET", "query", params={"query": q})
        return result.get("QueryResponse", {}).get(entity, [])

    # ── Vendor search / create ─────────────────────────────────

    def _search_or_create_vendor(self, config: dict, invoice: Invoice) -> str:
        name = invoice.vendor_name or "Unknown Vendor"
        vat = invoice.vendor_tax_id or ""

        if vat:
            vendors = self._query(
                config, "*", "Vendor",
                f"DisplayName = '{name.replace(chr(39), chr(39)+chr(39))}'",
            )
        if not vendors:
            vendors = self._query(
                config, "*", "Vendor",
                f"DisplayName = '{name.replace(chr(39), chr(39)+chr(39))}'",
            )

        if vendors:
            return vendors[0]["Id"]

        vendor_data = {
            "DisplayName": name,
            "CompanyName": name,
        }
        if vat:
            vendor_data["TaxIdentifier"] = vat

        created = self._api(config, "POST", "vendor", data=vendor_data)
        vid = created.get("Vendor", {}).get("Id", "")
        logger.info("Created QBO vendor %s (id=%s)", name, vid)
        return vid

    def _search_account(self, config: dict, category: str) -> str:
        accounts = self._query(
            config, "*", "Account",
            f"Name = '{category.replace(chr(39), chr(39)+chr(39))}'",
        )
        if accounts:
            return accounts[0]["Id"]

        accounts = self._query(
            config, "*", "Account",
            "AccountType = 'Expense' MAX 1",
        )
        if accounts:
            return accounts[0]["Id"]
        return ""

    def _parse_raw_data(self, raw) -> dict:
        try:
            if raw:
                return json.loads(raw)
        except Exception:
            pass
        return {}

    def _to_number(self, value) -> Optional[float]:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    # ── Push vendor bill ───────────────────────────────────────

    def push_vendor_bill(
        self, config: dict, invoice: Invoice
    ) -> Dict[str, Any]:
        token, config = self._ensure_valid_token(config)

        vendor_id = self._search_or_create_vendor(config, invoice)
        account_id = self._search_account(config, invoice.category or "Expenses")

        raw = self._parse_raw_data(invoice.raw_extracted_data)
        total = self._to_number(invoice.total_amount) or self._to_number(raw.get("total_amount")) or 0
        tax = self._to_number(invoice.tax_amount) or self._to_number(raw.get("tax_amount")) or 0
        base = total - tax

        date_val = invoice.invoice_date or datetime.utcnow()
        date_str = date_val.strftime("%Y-%m-%d") if isinstance(date_val, datetime) else str(date_val)[:10]
        due_str = (date_val + timedelta(days=30)).strftime("%Y-%m-%d") if isinstance(date_val, datetime) else date_str

        lines = [{
            "DetailType": "AccountBasedExpenseLineDetail",
            "Amount": round(base, 2),
            "Description": (invoice.description or raw.get("description") or "Servicios")[:200],
            "AccountBasedExpenseLineDetail": {
                "AccountRef": {"value": account_id},
            },
        }]
        if tax > 0:
            lines.append({
                "DetailType": "AccountBasedExpenseLineDetail",
                "Amount": round(tax, 2),
                "Description": "ITBIS 18%",
                "AccountBasedExpenseLineDetail": {
                    "AccountRef": {"value": account_id},
                },
            })

        bill = {
            "VendorRef": {"value": vendor_id},
            "TxnDate": date_str,
            "DueDate": due_str,
            "Line": lines,
            "CurrencyRef": {"name": invoice.currency or "DOP"},
        }

        # Add private note with invoice reference
        if invoice.invoice_number:
            bill["PrivateNote"] = f"NCF: {invoice.invoice_number}"

        result = self._api(config, "POST", "bill", data=bill)
        bill_id = result.get("Bill", {}).get("Id", "")

        logger.info(
            "Created QBO Bill id=%s for invoice=%s vendor=%s total=%s tax=%s",
            bill_id, invoice.invoice_number, invoice.vendor_name, total, tax,
        )

        return {"quickbooks_bill_id": bill_id, "vendor_id": vendor_id}

    def push_vendor_bills(
        self, config: dict, invoices: List[Invoice]
    ) -> List[Dict[str, Any]]:
        results = []
        for inv in invoices:
            try:
                result = self.push_vendor_bill(config, inv)
                result["invoice_id"] = str(inv.id)
                result["invoice_number"] = inv.invoice_number
                result["success"] = True
            except Exception as e:
                logger.error("Failed to push invoice %s to QBO: %s", inv.id, e)
                result = {
                    "invoice_id": str(inv.id),
                    "invoice_number": inv.invoice_number,
                    "success": False,
                    "error": str(e),
                }
            results.append(result)
        return results

    # ── Test ───────────────────────────────────────────────────

    def test_connection(self, config: dict) -> dict:
        """Test QBO connection by querying company info."""
        try:
            result = self._api(config, "GET", "companyinfo/" + config.get("realm_id", ""))
            company = result.get("CompanyInfo", {})
            return {
                "ok": True,
                "company_name": company.get("CompanyName", ""),
                "country": company.get("Country", ""),
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}
