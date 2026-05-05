import json
import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.repositories import InvoiceRepository
from app.models import Invoice
from app.core.redis import invalidate_cache_pattern

logger = logging.getLogger(__name__)


class InvoiceProcessingService:
    def __init__(self, invoice_repo: Optional[InvoiceRepository] = None, openai_processor: Any = None, webhook_sender: Any = None):
        self.invoice_repo = invoice_repo or InvoiceRepository()
        self.openai_processor = openai_processor
        self.webhook_sender = webhook_sender
        
        self._orchestrator = None
    
    @property
    def orchestrator(self):
        if self._orchestrator is None:
            from app.services.pipeline_orchestrator import PipelineOrchestrator
            self._orchestrator = PipelineOrchestrator(openai_processor=self.openai_processor)
        return self._orchestrator

    @staticmethod
    def _parse_invoice_date(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except Exception:  # noqa: BLE001
            return None

    def apply_extracted_data(
        self,
        db: Session,
        invoice: Invoice,
        extracted_data: dict,
        tenant_id: UUID,
        org_id: UUID,
        *,
        persist_raw: bool = True,
        processed: bool = True,
    ) -> Invoice:
        invoice.vendor_name = extracted_data.get("vendor_name")
        invoice.invoice_number = extracted_data.get("invoice_number")

        invoice_date = self._parse_invoice_date(extracted_data.get("invoice_date"))
        if invoice_date:
            invoice.invoice_date = invoice_date

        invoice.total_amount = extracted_data.get("total_amount")
        invoice.tax_amount = extracted_data.get("tax_amount")
        invoice.currency = extracted_data.get("currency", "USD")
        invoice.transaction_type = extracted_data.get("transaction_type")
        invoice.category = extracted_data.get("category")
        invoice.description = extracted_data.get("description")
        invoice.confidence_score = extracted_data.get("confidence")
        invoice.goods_services_type = extracted_data.get("goods_services_type")

        invoice.vendor_country = extracted_data.get("vendor_country")
        invoice.vendor_tax_id = extracted_data.get("vendor_tax_id")
        invoice.vendor_fiscal_address = extracted_data.get("vendor_fiscal_address")
        invoice.country_detection_method = extracted_data.get("country_detection_method")
        invoice.country_confidence = extracted_data.get("country_confidence")

        line_items = extracted_data.get("line_items")
        invoice.line_items_data = json.dumps(line_items or [], ensure_ascii=False)

        duplicate = None
        if extracted_data.get("invoice_number") and extracted_data.get("vendor_name"):
            duplicate = self.invoice_repo.find_duplicate_processed(
                db,
                tenant_id=tenant_id,
                org_id=org_id,
                invoice_number=extracted_data["invoice_number"],
                vendor_name=extracted_data["vendor_name"],
                exclude_invoice_id=invoice.id,
            )

        warnings = extracted_data.get("audit_warnings", [])
        if not isinstance(warnings, list):
            warnings = []

        if duplicate:
            warnings.insert(0, f"DUPLICADO: Ya existe la factura #{duplicate.id}")

        invoice.audit_flags = json.dumps(warnings, ensure_ascii=False)

        if persist_raw:
            invoice.raw_extracted_data = json.dumps(extracted_data, ensure_ascii=False)

        invoice.processed = processed
        invoice.updated_at = datetime.utcnow()

        return invoice

    async def process_invoice_record(
        self,
        db: Session,
        invoice: Invoice,
        tenant_id: UUID,
        org_id: UUID,
        *,
        user_id: Optional[UUID] = None,
        trigger_webhook: bool = True,
    ) -> dict:
        if invoice.processed:
            return {
                "status": "already_processed",
                "invoice": invoice,
                "message": "Factura ya procesada",
            }

        extracted_data = await run_in_threadpool(
            self.orchestrator.process,
            invoice.file_path,
            invoice.file_type,
            invoice,
            db,
            str(user_id) if user_id else None,
        )

        if not extracted_data or "error" in extracted_data:
            return {
                "status": "error",
                "error": (extracted_data or {}).get("error", "No se pudieron extraer datos"),
                "extracted_data": extracted_data,
            }

        self.apply_extracted_data(db, invoice, extracted_data, tenant_id, org_id)
        
        invoice.source_type = extracted_data.get("source_type") or invoice.file_type
        
        if extracted_data.get("original_xml_data"):
            invoice.original_xml_data = extracted_data["original_xml_data"]
        
        if extracted_data.get("ecf_type"):
            invoice.ecf_type = extracted_data["ecf_type"]

        db.commit()
        db.refresh(invoice)

        invalidate_cache_pattern("stats:*")

        if trigger_webhook and self.webhook_sender:
            try:
                await run_in_threadpool(
                    self.webhook_sender.trigger_event,
                    db,
                    "invoice.processed",
                    invoice.to_dict(),
                    tenant_id,
                    org_id,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Error disparando webhook invoice.processed: %s", exc)

        return {
            "status": "success",
            "invoice": invoice,
            "extracted_data": extracted_data,
        }

    async def bulk_process(
        self,
        db: Session,
        invoices: list[Invoice],
        tenant_id: UUID,
        org_id: UUID,
        *,
        user_id: Optional[UUID] = None,
    ) -> tuple[int, list[str]]:
        success_count = 0
        errors: list[str] = []

        for invoice in invoices:
            try:
                result = await self.process_invoice_record(
                    db,
                    invoice,
                    tenant_id,
                    org_id,
                    user_id=user_id,
                    trigger_webhook=True,
                )
                if result["status"] == "success":
                    success_count += 1
                elif result["status"] == "error":
                    errors.append(f"ID {invoice.id}: {result['error']}")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"ID {invoice.id}: {exc}")

        db.commit()
        return success_count, errors
