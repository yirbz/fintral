"""
Xero REST connector — OAuth 2.0 + vendor bill push.

Uses `requests` for HTTP. Auth flow:
  1. get_auth_url()  →  user authorizes in Xero
  2. exchange_code() →  access_token + refresh_token
  3. fetch_tenants() →  discover connected Xero orgs
  4. push_invoice()  →  POST /api.xro/2.0/Invoices (ACCPAY)
"""

import base64
import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import requests

from app.config import XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI
from app.models import Invoice

logger = logging.getLogger(__name__)

XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize"
XERO_TOKEN_URL = "https://identity.xero.com/connect/token"
XERO_CONNECTIONS_URL = "https://api.xero.com/connections"
XERO_API_BASE = "https://api.xero.com/api.xro/2.0"
XERO_SCOPE = "openid profile email accounting.invoices accounting.contacts accounting.settings.read offline_access"

PKCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"


class XeroConnector:

    def __init__(self):
        self._client_id = XERO_CLIENT_ID
        self._client_secret = XERO_CLIENT_SECRET
        self._redirect_uri = XERO_REDIRECT_URI

    # ── PKCE ───────────────────────────────────────────────────

    @staticmethod
    def generate_pkce_pair() -> Tuple[str, str]:
        code_verifier = "".join(secrets.choice(PKCE_CHARS) for _ in range(64))
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        return code_verifier, code_challenge

    # ── OAuth 2.0 ──────────────────────────────────────────────

    def get_auth_url(self, state: str = "", code_challenge: str = "") -> str:
        params = {
            "client_id": self._client_id,
            "response_type": "code",
            "scope": XERO_SCOPE,
            "redirect_uri": self._redirect_uri,
        }
        if state:
            params["state"] = state
        if code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"
        qs = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
        url = f"{XERO_AUTH_URL}?{qs}"
        logger.info("Xero auth URL generated redirect_uri=%s pkce=%s", self._redirect_uri, bool(code_challenge))
        return url

    def _basic_auth(self) -> str:
        return base64.b64encode(
            f"{self._client_id}:{self._client_secret}".encode()
        ).decode()

    def _token_post(self, data: dict) -> dict:
        auth = self._basic_auth()
        resp = requests.post(
            XERO_TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth}",
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data=data,
            timeout=30,
        )
        logger.info("Xero token request status=%d", resp.status_code)
        if not resp.ok:
            err = resp.text[:500]
            logger.error("Xero token request failed: %s", err)
            raise ConnectionError(f"Xero token request failed: {err}")
        return resp.json()

    def exchange_code(self, code: str, code_verifier: str = "") -> dict:
        logger.info("Xero exchanging authorization code pkce=%s", bool(code_verifier))
        token_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self._redirect_uri,
        }
        if code_verifier:
            token_data["code_verifier"] = code_verifier
        data = self._token_post(token_data)
        logger.info("Xero token exchange OK keys=%s", list(data.keys()))
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
            "id_token": data.get("id_token", ""),
            "token_expiry": (
                datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))
            ).isoformat(),
            "client_id": self._client_id,
            "client_secret": self._client_secret,
        }

    def fetch_tenants(self, config: dict) -> list:
        token, _ = self._ensure_valid_token(config)
        resp = requests.get(
            XERO_CONNECTIONS_URL,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=30,
        )
        if not resp.ok:
            err = resp.text[:500]
            logger.error("Xero list tenants failed: %s", err)
            raise ConnectionError(f"Xero list tenants failed: {err}")
        return resp.json()

    def refresh_access_token(self, config: dict) -> dict:
        refresh_token = config.get("refresh_token")
        if not refresh_token:
            raise ValueError("No refresh_token in config")

        data = self._token_post({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        })
        config["access_token"] = data["access_token"]
        config["refresh_token"] = data.get("refresh_token", refresh_token)
        config["id_token"] = data.get("id_token", config.get("id_token", ""))
        config["token_expiry"] = (
            datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))
        ).isoformat()
        return config

    def _ensure_valid_token(self, config: dict) -> tuple:
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
        tenant_id = config.get("xero_tenant_id", "")
        url = f"{XERO_API_BASE}/{path.lstrip('/')}"

        headers = {
            "Authorization": f"Bearer {token}",
            "Xero-tenant-id": tenant_id,
            "Accept": "application/json",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"

        resp = requests.request(
            method=method,
            url=url,
            params=params,
            headers=headers,
            json=data,
            timeout=30,
        )
        if not resp.ok:
            body = resp.text[:1000]
            logger.error("Xero API %s %s failed: %s", method, path, body)
            raise ConnectionError(f"Xero API error ({resp.status_code}): {body}")

        return resp.json()

    # ── Contact (vendor) search / create ───────────────────────

    def _search_or_create_contact(self, config: dict, invoice: Invoice) -> str:
        name = (invoice.vendor_name or "Unknown Vendor").strip()
        vat = invoice.vendor_tax_id or ""

        where = f'Name=="{name.replace(chr(34), chr(34)+chr(34))}"'
        resp = self._api(config, "GET", "Contacts", params={"where": where})
        contacts = resp.get("Contacts", [])
        if contacts:
            cid = contacts[0].get("ContactID", "")
            logger.info("Found Xero contact %s (id=%s)", name, cid)
            return cid

        contact_data = {"Name": name}
        if vat:
            contact_data["TaxNumber"] = vat

        created = self._api(config, "POST", "Contacts", data={"Contacts": [contact_data]})
        created_list = created.get("Contacts", [])
        cid = created_list[0].get("ContactID", "") if created_list else ""
        logger.info("Created Xero contact %s (id=%s)", name, cid)
        return cid

    # ── Account lookup ─────────────────────────────────────────

    def _resolve_account_code(self, config: dict, category: str) -> str:
        resp = self._api(config, "GET", "Accounts")
        accounts = resp.get("Accounts", [])

        name_norm = category.strip().lower()
        for a in accounts:
            if a.get("Name", "").strip().lower() == name_norm or a.get("Code", "") == name_norm:
                return a.get("Code", "")
        for a in accounts:
            if a.get("Type") == "EXPENSE":
                return a.get("Code", "")
        return ""

    # ── Parsing helpers ────────────────────────────────────────

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

    # ── Push invoice (ACCPAY) ──────────────────────────────────

    def push_invoice(
        self, config: dict, invoice: Invoice
    ) -> Dict[str, Any]:
        self._ensure_valid_token(config)

        contact_id = self._search_or_create_contact(config, invoice)
        account_code = self._resolve_account_code(config, invoice.category or "Expenses")

        raw = self._parse_raw_data(invoice.raw_extracted_data)
        total = self._to_number(invoice.total_amount) or self._to_number(raw.get("total_amount")) or 0

        date_val = invoice.invoice_date or datetime.utcnow()
        date_str = date_val.strftime("%Y-%m-%d") if isinstance(date_val, datetime) else str(date_val)[:10]
        due_str = (date_val + timedelta(days=30)).strftime("%Y-%m-%d") if isinstance(date_val, datetime) else date_str

        description = (invoice.description or raw.get("description") or "Servicios")[:200]

        line_items = [{
            "Description": description,
            "Quantity": 1.0,
            "UnitAmount": total,
            "AccountCode": account_code or "500",
        }]

        invoice_data = {
            "Type": "ACCPAY",
            "Contact": {"ContactID": contact_id},
            "Date": date_str,
            "DueDate": due_str,
            "LineItems": line_items,
            "LineAmountTypes": "NoTax",
            "Status": "AUTHORISED",
        }

        if invoice.invoice_number:
            invoice_data["Reference"] = invoice.invoice_number
            invoice_data["LineItems"][0]["Description"] += f" | NCF: {invoice.invoice_number}"

        result = self._api(config, "POST", "Invoices", data={"Invoices": [invoice_data]})
        created = result.get("Invoices", [])
        inv_id = created[0].get("InvoiceID", "") if created else ""

        logger.info(
            "Created Xero ACCPAY id=%s for invoice=%s vendor=%s total=%s",
            inv_id, invoice.invoice_number, invoice.vendor_name, total,
        )

        return {"xero_invoice_id": inv_id, "contact_id": contact_id}

    def push_invoices(
        self, config: dict, invoices: List[Invoice]
    ) -> List[Dict[str, Any]]:
        results = []
        for inv in invoices:
            try:
                result = self.push_invoice(config, inv)
                result["invoice_id"] = str(inv.id)
                result["invoice_number"] = inv.invoice_number
                result["success"] = True
            except Exception as e:
                logger.error("Failed to push invoice %s to Xero: %s", inv.id, e)
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
        try:
            result = self._api(config, "GET", "Organisation")
            org = result.get("Organisations", [{}])[0]
            return {
                "ok": True,
                "company_name": org.get("Name", ""),
                "country": org.get("CountryCode", ""),
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}
