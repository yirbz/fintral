import logging
import time
import datetime
from typing import Optional
from uuid import UUID

import requests
from sqlalchemy.orm import Session

from app.services.settings_service import SettingsService
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)

CURRENCY_MAP = {
    "DOP": "214",
    "USD": "032",
    "214": "214",
    "032": "032"
}


class MioService:
    def __init__(self, settings_service: Optional[SettingsService] = None):
        self.settings_service = settings_service or SettingsService()
        self._token_cache: dict[str, tuple[str, float]] = {}

    def _resolve_config(self, db: Session, org_id: Optional[UUID]) -> dict:
        return {
            "client_id": self.settings_service.resolve_setting(
                db,
                "mio_client_id",
                org_id=org_id,
                env_key="MIO_CLIENT_ID",
                default="",
            ),
            "client_secret": self.settings_service.resolve_setting(
                db,
                "mio_client_secret",
                org_id=org_id,
                env_key="MIO_CLIENT_SECRET",
                default="",
            ),
            "auth_url": self.settings_service.resolve_setting(
                db,
                "mio_auth_url",
                org_id=org_id,
                env_key="MIO_AUTH_BASE_URL",
                default="https://auth.stg.geopagos.io",
            ),
            "checkout_url": self.settings_service.resolve_setting(
                db,
                "mio_checkout_url",
                org_id=org_id,
                env_key="MIO_CHECKOUT_BASE_URL",
                default="https://api-mpos-mio.stg.geopagos.io",
            ),
        }

    def get_token(
        self,
        db: Session,
        org_id: Optional[UUID] = None,
        *,
        force_refresh: bool = False,
    ) -> dict:
        cfg = self._resolve_config(db, org_id)
        client_id = cfg["client_id"]
        client_secret = cfg["client_secret"]
        auth_url = cfg["auth_url"]

        if not client_id or not client_secret:
            return {
                "status": "error",
                "message": "MIO no configurado. Configura MIO_CLIENT_ID y MIO_CLIENT_SECRET.",
            }

        cache_key = str(org_id) if org_id else "__default__"

        if not force_refresh:
            cached = self._token_cache.get(cache_key)
            if cached:
                token, expires_at = cached
                if time.time() < expires_at - 60:
                    return {
                        "status": "success",
                        "token_type": "Bearer",
                        "access_token": token,
                        "cached": True,
                    }

        try:
            response = requests.post(
                f"{auth_url}/oauth/token",
                json={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": "*",
                },
                headers={"Content-Type": "application/json"},
                timeout=15,
            )
        except requests.exceptions.Timeout:
            return {"status": "error", "message": "Timeout conectando con MIO Auth"}
        except requests.exceptions.ConnectionError:
            return {"status": "error", "message": f"No se pudo conectar con {auth_url}"}
        except Exception as exc:
            return {"status": "error", "message": f"Error de conexión: {exc}"}

        if response.status_code != 200:
            logger.error("MIO token error %s: %s", response.status_code, response.text[:300])
            return {
                "status": "error",
                "message": f"Error obteniendo token: {response.status_code}",
                "detail": response.text[:500],
            }

        data = response.json()
        access_token = data.get("access_token")
        expires_in = int(data.get("expires_in", 3600))
        token_type = data.get("token_type", "Bearer")

        if not access_token:
            return {"status": "error", "message": "Respuesta de MIO no contiene access_token"}

        self._token_cache[cache_key] = (access_token, time.time() + expires_in)

        return {
            "status": "success",
            "token_type": token_type,
            "access_token": access_token,
            "expires_in": expires_in,
            "cached": False,
        }

    def create_order(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        amount: float,
        currency: str,
        invoice_id: Optional[UUID] = None,
        items: Optional[list] = None,
        redirect_urls: Optional[dict] = None,
        webhook_url: Optional[str] = None,
        expire_minutes: Optional[int] = 14400,
    ) -> dict:
        token_res = self.get_token(db, org_id)
        if token_res["status"] != "success":
            return token_res

        token = token_res["access_token"]
        cfg = self._resolve_config(db, org_id)
        checkout_url = cfg["checkout_url"]

        currency_code = CURRENCY_MAP.get(currency.upper(), "214")

        if not items:
            items = [
                {
                    "id": 1,
                    "name": "Pago de Factura" + (f" #{invoice_id}" if invoice_id else ""),
                    "unitPrice": {
                        "currency": currency_code,
                        "amount": int(amount * 100)
                    },
                    "quantity": 1
                }
            ]
        else:
            formatted_items = []
            for idx, item in enumerate(items):
                item_price = item.get("amount") or item.get("unit_price") or amount
                formatted_items.append({
                    "id": item.get("id", idx + 1),
                    "name": item.get("name", "Item"),
                    "unitPrice": {
                        "currency": currency_code,
                        "amount": int(item_price * 100)
                    },
                    "quantity": item.get("quantity", 1)
                })
            items = formatted_items

        attributes = {
            "currency": currency_code,
            "items": items,
        }

        if redirect_urls:
            attributes["redirect_urls"] = redirect_urls
        if webhook_url:
            attributes["webhookUrl"] = webhook_url
        if expire_minutes:
            attributes["expireLimitMinutes"] = expire_minutes

        payload = {
            "data": {
                "attributes": attributes
            }
        }

        headers = {
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/vnd.api+json",
            "Authorization": f"Bearer {token}"
        }

        try:
            response = requests.post(
                f"{checkout_url}/api/v2/orders",
                json=payload,
                headers=headers,
                timeout=15,
            )
        except Exception as exc:
            return {"status": "error", "message": f"Error al conectar con MIO: {exc}"}

        if response.status_code not in (200, 201):
            logger.error("MIO create order error %s: %s", response.status_code, response.text[:300])
            return {
                "status": "error",
                "message": f"Error al crear orden en MIO: {response.status_code}",
                "detail": response.text[:500]
            }

        res_data = response.json()
        data_node = res_data.get("data", {})
        attr_node = data_node.get("attributes", {})
        order_uuid = attr_node.get("uuid")

        links = data_node.get("links", {})
        checkout_link = None
        if isinstance(links, list) and len(links) > 0:
            checkout_link = links[0].get("checkout")
        elif isinstance(links, dict):
            checkout_link = links.get("checkout")

        if not checkout_link:
            checkout_link = attr_node.get("links", {}).get("checkout")

        from app.models.mio_payment import MioPayment

        expires_at = None
        if expire_minutes:
            expires_at = utc_now() + datetime.timedelta(minutes=expire_minutes)

        mio_payment = MioPayment(
            tenant_id=tenant_id,
            organization_id=org_id,
            invoice_id=invoice_id,
            mio_order_uuid=order_uuid,
            checkout_url=checkout_link,
            status="PENDING",
            currency=currency,
            amount=amount,
            items=items,
            expires_at=expires_at
        )
        db.add(mio_payment)
        db.commit()
        db.refresh(mio_payment)

        return {
            "status": "success",
            "payment": mio_payment.to_dict(),
            "checkout_url": checkout_link,
            "order_uuid": order_uuid
        }

    def get_order_status(self, db: Session, org_id: UUID, order_uuid: str) -> dict:
        token_res = self.get_token(db, org_id)
        if token_res["status"] != "success":
            return token_res

        token = token_res["access_token"]
        cfg = self._resolve_config(db, org_id)
        checkout_url = cfg["checkout_url"]

        headers = {
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/vnd.api+json",
            "Authorization": f"Bearer {token}"
        }

        try:
            response = requests.get(
                f"{checkout_url}/api/v2/orders/{order_uuid}",
                headers=headers,
                timeout=15,
            )
        except Exception as exc:
            return {"status": "error", "message": f"Error al conectar con MIO: {exc}"}

        if response.status_code != 200:
            logger.error("MIO get order error %s: %s", response.status_code, response.text[:300])
            return {
                "status": "error",
                "message": f"Error al consultar orden en MIO: {response.status_code}",
                "detail": response.text[:500]
            }

        res_data = response.json()
        data_node = res_data.get("data", {})
        attr_node = data_node.get("attributes", {})

        mio_status = attr_node.get("status")
        payment_info = attr_node.get("payment") or {}

        from app.models.mio_payment import MioPayment
        mio_payment = db.query(MioPayment).filter(MioPayment.mio_order_uuid == order_uuid).first()
        if mio_payment:
            status_map = {
                "SUCCESS": "SUCCESS",
                "APPROVED": "SUCCESS",
                "FAILED": "FAILED",
                "DECLINED": "FAILED",
                "PENDING": "PENDING"
            }
            mapped_status = status_map.get(mio_status, "PENDING")

            if mapped_status == "SUCCESS" and mio_payment.status != "SUCCESS":
                mio_payment.status = "SUCCESS"
                mio_payment.payment_id = str(payment_info.get("id")) if payment_info.get("id") else None
                mio_payment.authorization_code = payment_info.get("authorization_code")
                mio_payment.reference_number = payment_info.get("reference_number")

                if mio_payment.invoice_id:
                    from app.models.invoice import Invoice
                    invoice = db.query(Invoice).filter(Invoice.id == mio_payment.invoice_id).first()
                    if invoice:
                        invoice.payment_status = "paid"
                        invoice.payment_date = utc_now()

                db.commit()
                db.refresh(mio_payment)
            elif mapped_status == "FAILED" and mio_payment.status != "FAILED":
                mio_payment.status = "FAILED"
                db.commit()
                db.refresh(mio_payment)

        return {
            "status": "success",
            "mio_status": mio_status,
            "payment_info": payment_info,
            "data": res_data
        }

    def process_webhook(self, db: Session, payload: dict) -> dict:
        data_node = payload.get("data", {})
        order_node = data_node.get("order", {})
        payment_node = data_node.get("payment", {})

        order_uuid = order_node.get("uuid")
        order_status = order_node.get("status")

        if not order_uuid:
            return {"status": "error", "message": "Falta order uuid en webhook payload"}

        from app.models.mio_payment import MioPayment
        mio_payment = db.query(MioPayment).filter(MioPayment.mio_order_uuid == order_uuid).first()
        if not mio_payment:
            return {"status": "error", "message": f"Pago MIO con uuid {order_uuid} no encontrado en sistema"}

        mio_payment.webhook_payload = payload

        status_map = {
            "SUCCESS": "SUCCESS",
            "FAILED": "FAILED",
            "APPROVED": "SUCCESS",
            "DECLINED": "FAILED"
        }
        mapped_status = status_map.get(order_status, "PENDING")

        if mapped_status == "SUCCESS" and mio_payment.status != "SUCCESS":
            mio_payment.status = "SUCCESS"
            mio_payment.payment_id = str(payment_node.get("id")) if payment_node.get("id") else None
            mio_payment.authorization_code = payment_node.get("authorizationCode")
            mio_payment.reference_number = payment_node.get("refNumber")

            if mio_payment.invoice_id:
                from app.models.invoice import Invoice
                invoice = db.query(Invoice).filter(Invoice.id == mio_payment.invoice_id).first()
                if invoice:
                    invoice.payment_status = "paid"
                    invoice.payment_date = utc_now()
        elif mapped_status == "FAILED" and mio_payment.status != "FAILED":
            mio_payment.status = "FAILED"

        db.commit()
        db.refresh(mio_payment)

        return {
            "status": "success",
            "order_uuid": order_uuid,
            "mapped_status": mapped_status,
            "payment": mio_payment.to_dict()
        }
