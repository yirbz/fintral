import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.models import Invoice, Notification
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)


class AlanubeReceivedService:
    def __init__(self, api_url: str, jwt_token: str):
        self.api_url = api_url.rstrip("/")
        self.jwt_token = jwt_token

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.jwt_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def fetch_received_documents(
        self,
        company_id: Optional[str] = None,
        limit: int = 100,
        page: int = 1,
        start: Optional[str] = None,
        end: Optional[str] = None,
        status: Optional[str] = None,
        rnc: Optional[str] = None,
    ) -> Dict[str, Any]:
        if company_id:
            url = f"{self.api_url}/received-documents/idCompany/{company_id}"
        else:
            url = f"{self.api_url}/received-documents"

        params: Dict[str, Any] = {"limit": limit, "page": page}
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        if status:
            params["status"] = status
        if rnc:
            params["rnc"] = rnc

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self._get_headers(), params=params, timeout=30.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Alanube error fetching received documents: {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error fetching received documents: {e}")
                raise

    async def fetch_document_detail(
        self, doc_id: str, company_id: Optional[str] = None
    ) -> Dict[str, Any]:
        if company_id:
            url = f"{self.api_url}/received-documents/{doc_id}/idCompany/{company_id}"
        else:
            url = f"{self.api_url}/received-documents/{doc_id}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self._get_headers(), timeout=30.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Alanube error fetching document {doc_id}: {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error fetching document {doc_id}: {e}")
                raise

    def _parse_document_type(self, doc_type: str) -> str:
        dt = doc_type.strip()
        known = {
            "31": "31", "32": "32", "33": "33", "34": "34",
            "41": "41", "43": "43", "44": "44", "45": "45", "46": "46", "47": "47",
        }
        return known.get(dt, "32")

    def _parse_amount(self, amount_str: Optional[str]) -> Optional[float]:
        if not amount_str:
            return None
        try:
            return float(amount_str.replace(",", ""))
        except (ValueError, AttributeError):
            return None

    def find_existing_invoice(
        self, db: Session, tenant_id: UUID, org_id: UUID, doc: Dict[str, Any]
    ) -> Optional[Invoice]:
        issuer = doc.get("issuerIdentification", "")
        doc_number = doc.get("documentNumber", "")
        if not issuer or not doc_number:
            return None

        return (
            db.query(Invoice)
            .filter(
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
                Invoice.vendor_tax_id == issuer,
                Invoice.invoice_number == doc_number,
                Invoice.is_deleted.is_(False),
            )
            .first()
        )

    def create_invoice_from_document(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        org_tax_id: str,
        doc: Dict[str, Any],
    ) -> Invoice:
        doc_type = self._parse_document_type(doc.get("documentType", "32"))
        amount = self._parse_amount(doc.get("totalAmount"))

        stamp_date_str = doc.get("documentStampDate")
        invoice_date = None
        if stamp_date_str:
            try:
                invoice_date = datetime.strptime(stamp_date_str, "%Y-%m-%d")
            except ValueError:
                try:
                    invoice_date = datetime.fromisoformat(stamp_date_str)
                except (ValueError, TypeError):
                    invoice_date = None

        invoice = Invoice(
            tenant_id=tenant_id,
            organization_id=org_id,
            vendor_tax_id=doc.get("issuerIdentification"),
            vendor_name=doc.get("issuerName") or doc.get("issuerIdentification", ""),
            invoice_number=doc.get("documentNumber"),
            invoice_date=invoice_date,
            total_amount=amount,
            ecf_type=doc_type,
            source_type="alanube_received",
            ingestion_source="dgii_mailbox",
            is_electronic=True,
            status="pending_review",
            transaction_type="expense",
            currency="DOP",
            rnc_comprador=org_tax_id,
            raw_extracted_data=json.dumps(doc, ensure_ascii=False),
            processed=False,
        )
        db.add(invoice)
        db.flush()
        return invoice

    def create_notification(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        invoice: Invoice,
    ) -> Notification:
        vendor = invoice.vendor_name or invoice.vendor_tax_id or "Desconocido"
        amount = f"RD$ {invoice.total_amount:,.2f}" if invoice.total_amount else "N/A"

        notification = Notification(
            tenant_id=tenant_id,
            organization_id=org_id,
            type="info",
            title="Factura recibida del buzón DGII",
            message=f"{vendor} — NCF {invoice.invoice_number} — {amount}",
            data=json.dumps({"invoice_id": str(invoice.id), "source": "alanube_received"}),
            read=False,
        )
        db.add(notification)
        db.flush()
        return notification

    async def sync(
        self,
        db: Session,
        tenant_id: UUID,
        org_id: UUID,
        org_tax_id: str,
        company_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        result = {
            "total_fetched": 0,
            "new": 0,
            "updated": 0,
            "errors": [],
            "notifications_created": 0,
        }

        try:
            response = await self.fetch_received_documents(
                company_id=company_id,
                limit=1000,
                start=start_date,
                end=end_date,
            )
        except Exception as e:
            result["errors"].append(f"Error fetching from Alanube: {str(e)}")
            return result

        documents = response.get("documents", [])
        if not documents:
            return result

        result["total_fetched"] = len(documents)

        for doc in documents:
            try:
                existing = self.find_existing_invoice(db, tenant_id, org_id, doc)
                if existing:
                    existing.raw_extracted_data = json.dumps(doc, ensure_ascii=False)
                    existing.updated_at = utc_now()
                    if doc.get("commercialResponse"):
                        existing.audit_flags = json.dumps({
                            "commercial_response": doc.get("commercialResponse"),
                        })
                    result["updated"] += 1
                else:
                    invoice = self.create_invoice_from_document(
                        db, tenant_id, org_id, org_tax_id, doc,
                    )
                    self.create_notification(db, tenant_id, org_id, invoice)
                    result["new"] += 1
                    result["notifications_created"] += 1
            except Exception as e:
                doc_id = doc.get("id", "unknown")
                logger.exception(f"Error processing received document {doc_id}")
                result["errors"].append(f"Document {doc_id}: {str(e)}")

        if result["new"] > 0 or result["updated"] > 0:
            db.commit()

        return result
