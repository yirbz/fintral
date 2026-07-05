import json
import logging
import os
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from app.utils.dates import utc_now

from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import SUPABASE_URL
from app.repositories import InvoiceRepository
from app.models import Invoice, Organization
from app.core.redis import invalidate_cache_pattern

logger = logging.getLogger(__name__)

async def lookup_rnc_name_from_dgii(rnc: str) -> Optional[str]:
    import re
    import html
    import httpx
    
    clean_rnc = re.sub(r"[^0-9]", "", rnc)
    if len(clean_rnc) not in (9, 11):
        return None
        
    RNC_URL = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx"
    CEDULA_URL = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ciudadanos.aspx"
    UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    
    def _extract_all_form_fields(html_text: str) -> dict[str, str]:
        fields = {}
        for m in re.finditer(r'<input\s+([^>]+)>', html_text, re.IGNORECASE):
            attrs = m.group(1)
            name_match = re.search(r'name="([^"]+)"', attrs, re.IGNORECASE)
            if name_match:
                name = name_match.group(1)
                val_match = re.search(r'value="([^"]*)"', attrs, re.IGNORECASE)
                val = val_match.group(1) if val_match else ""
                fields[name] = val
        return fields

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            if len(clean_rnc) == 9:
                r = await client.get(RNC_URL, headers={"User-Agent": UA})
                r.raise_for_status()
                
                viewstate_match = re.search(r'id="__VIEWSTATE" value="([^"]+)"', r.text)
                viewstate = viewstate_match.group(1) if viewstate_match else ""
                viewstate_gen_match = re.search(r'id="__VIEWSTATEGENERATOR" value="([^"]+)"', r.text)
                viewstate_gen = viewstate_gen_match.group(1) if viewstate_gen_match else ""
                event_val_match = re.search(r'id="__EVENTVALIDATION" value="([^"]+)"', r.text)
                event_val = event_val_match.group(1) if event_val_match else ""
                
                if not viewstate:
                    return None
                    
                post_data = {
                    "__VIEWSTATE": viewstate,
                    "__VIEWSTATEGENERATOR": viewstate_gen,
                    "__EVENTVALIDATION": event_val,
                    "ctl00$cphMain$txtRNCCedula": clean_rnc,
                    "ctl00$cphMain$btnBuscarPorRNC": "Buscar",
                    "__ASYNCPOST": "true"
                }
                
                resp = await client.post(
                    RNC_URL,
                    data=post_data,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": UA,
                        "Referer": RNC_URL
                    }
                )
                resp.raise_for_status()
                
                content = resp.text
                match = re.search(r"updatePanel\|upMainMaster\|([\s\S]*?)(?=\|8\|hiddenField|$)", content)
                parsed_content = match.group(1).strip() if match else content
                
                table_match = re.search(r'<table[^>]*id="[^"]*dvDatosContribuyentes[^"]*"[^>]*>([\s\S]*?)<\/table>', parsed_content)
                if table_match:
                    rows = re.findall(r'<tr[^>]*>([\s\S]*?)</tr>', table_match.group(1))
                    for row in rows:
                        cells = re.findall(r'<td[^>]*>([\s\S]*?)</td>', row)
                        if len(cells) >= 2:
                            label = html.unescape(re.sub(r'<[^>]*>', '', cells[0]).strip().lower())
                            if 'razon social' in label or 'razón social' in label or 'nombre' in label:
                                val_raw = re.sub(r'<[^>]*>', '', cells[1]).strip()
                                return re.sub(r'\s+', ' ', html.unescape(val_raw))
            else:
                r = await client.get(CEDULA_URL, headers={"User-Agent": UA})
                r.raise_for_status()
                
                fields = _extract_all_form_fields(r.text)
                fields["ctl00$cphMain$txtCedula"] = clean_rnc
                fields["ctl00$cphMain$btnBuscarCedula"] = "Buscar"
                fields["__ASYNCPOST"] = "true"
                
                resp = await client.post(
                    CEDULA_URL,
                    data=fields,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": UA,
                        "Referer": CEDULA_URL
                    }
                )
                resp.raise_for_status()
                
                content = resp.text
                match = re.search(r"updatePanel\|upMainMaster\|([\s\S]*?)(?=\|8\|hiddenField|$)", content)
                parsed_content = match.group(1).strip() if match else content
                
                table_match = re.search(r'<table[^>]*id="[^"]*dvResultadoCedula[^"]*"[^>]*>([\s\S]*?)<\/table>', parsed_content)
                if not table_match:
                    table_match = re.search(r'<table[^>]*>([\s\S]*?)<\/table>', parsed_content)
                if table_match:
                    rows = re.findall(r'<tr[^>]*>([\s\S]*?)</tr>', table_match.group(1))
                    for row in rows:
                        cells = re.findall(r'<td[^>]*>([\s\S]*?)</td>', row)
                        if len(cells) >= 2:
                            label = html.unescape(re.sub(r'<[^>]*>', '', cells[0]).strip().lower())
                            if 'nombre' in label or 'razon' in label or 'razón' in label:
                                val_raw = re.sub(r'<[^>]*>', '', cells[1]).strip()
                                return re.sub(r'\s+', ' ', html.unescape(val_raw))
    except Exception as e:
        logger.warning(f"Error looking up RNC {rnc} from DGII in background: {e}")
    return None


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
            import re
            raw_str = str(value).strip()
            date_str = raw_str.split("T")[0].split()[0]
            date_str = re.sub(r'^[^\w]+|[^\w]+$', '', date_str)
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
                try:
                    return datetime.strptime(date_str, fmt)
                except Exception:
                    continue
        except Exception:
            pass
        return None

    @staticmethod
    def _is_modificatory_pipeline_result(extracted_data: dict) -> bool:
        ecf_type = extracted_data.get("ecf_type")
        if ecf_type in ("33", "34"):
            return True
        if extracted_data.get("is_credit_note") is True:
            return True
        ncf = (extracted_data.get("invoice_number") or "").strip().upper()
        if ncf.startswith(("B03", "B04", "E33", "E34")):
            return True
        return False

    @staticmethod
    def _normalize_tax_id(value: Optional[str]) -> str:
        if not value:
            return ""
        return "".join(c for c in value if c.isalnum())

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
        invoice.rnc_comprador = extracted_data.get("rnc_comprador")
        invoice.is_electronic = extracted_data.get("is_electronic", False)
        invoice.ingestion_source = extracted_data.get("ingestion_source")
        
        invoice.payment_condition = extracted_data.get("payment_condition") or "contado"
        due_date = self._parse_invoice_date(extracted_data.get("due_date"))
        if due_date:
            invoice.due_date = due_date
        payment_date = self._parse_invoice_date(extracted_data.get("payment_date"))
        if payment_date:
            invoice.payment_date = payment_date
        if extracted_data.get("payment_status"):
            invoice.payment_status = extracted_data["payment_status"]
            
        if extracted_data.get("bank_account_id"):
            try:
                invoice.bank_account_id = UUID(str(extracted_data["bank_account_id"]))
            except Exception:
                pass
            
        if extracted_data.get("status"):
            invoice.status = extracted_data["status"]

        invoice.vendor_country = extracted_data.get("vendor_country")
        invoice.vendor_tax_id = extracted_data.get("vendor_tax_id")
        invoice.vendor_fiscal_address = extracted_data.get("vendor_fiscal_address")
        invoice.country_detection_method = extracted_data.get("country_detection_method")
        invoice.country_confidence = extracted_data.get("country_confidence")

        line_items = extracted_data.get("line_items")
        invoice.line_items_data = json.dumps(line_items or [], ensure_ascii=False)

        qa_warnings = extracted_data.get("quality_warnings")
        if qa_warnings and isinstance(qa_warnings, list):
            report = {"pipeline_warnings": qa_warnings}
        else:
            report = {}

        cat_source = extracted_data.get("category_source")
        if cat_source:
            report["category_source"] = cat_source

        if report:
            invoice.quality_report = json.dumps(report, ensure_ascii=False)

        duplicate_ncf = None
        duplicate_vendor = None
        ncf = extracted_data.get("invoice_number")

        if ncf:
            # Primary rule: NCF/e-NCF must be globally unique per org (DGII fiscal rule)
            duplicate_ncf = self.invoice_repo.find_by_ncf(
                db,
                tenant_id=tenant_id,
                org_id=org_id,
                invoice_number=ncf,
                exclude_invoice_id=invoice.id,
            )

        if not duplicate_ncf and ncf and extracted_data.get("vendor_name"):
            # Secondary rule: same number + same vendor (non-NCF invoices)
            duplicate_vendor = self.invoice_repo.find_duplicate_processed(
                db,
                tenant_id=tenant_id,
                org_id=org_id,
                invoice_number=ncf,
                vendor_name=extracted_data["vendor_name"],
                exclude_invoice_id=invoice.id,
            )

        warnings = extracted_data.get("audit_warnings", [])
        if not isinstance(warnings, list):
            warnings = []

        if duplicate_ncf:
            warnings.insert(
                0,
                f"COMPROBANTE DUPLICADO: El NCF/e-NCF \"{ncf}\" ya fue registrado "
                f"en la factura {duplicate_ncf.id} "
                f"({duplicate_ncf.vendor_name or 'proveedor desconocido'}). "
                "Verifica si es un duplicado antes de continuar.",
            )
        elif duplicate_vendor:
            warnings.insert(
                0,
                f"DUPLICADO: Ya existe una factura con el n\u00famero \"{ncf}\" "
                f"del mismo proveedor (ID: {duplicate_vendor.id}).",
            )

        invoice.audit_flags = json.dumps(warnings, ensure_ascii=False)

        dgii_code = extracted_data.get("dgii_security_code")
        if dgii_code:
            invoice.dgii_security_code = str(dgii_code)

        dgii_val_status = extracted_data.get("dgii_validation_status")
        if dgii_val_status:
            invoice.dgii_validation_status = str(dgii_val_status)

        dgii_val_date = extracted_data.get("dgii_validation_date")
        if dgii_val_date:
            parsed_date = self._parse_invoice_date(dgii_val_date)
            if parsed_date:
                invoice.dgii_validation_date = parsed_date

        dgii_detail = extracted_data.get("dgii_validation_detail")
        if dgii_detail:
            if isinstance(dgii_detail, dict):
                invoice.dgii_validation_detail = json.dumps(dgii_detail, ensure_ascii=False)
            else:
                invoice.dgii_validation_detail = str(dgii_detail)

        if persist_raw:
            invoice.raw_extracted_data = json.dumps(extracted_data, ensure_ascii=False)

        invoice.processed = processed
        invoice.updated_at = utc_now()

        # Return the conflicting invoice (if any) so callers can surface structured metadata
        conflicting = duplicate_ncf or duplicate_vendor
        return invoice, conflicting

    @staticmethod
    def _apply_modificatory_data(
        db: Session,
        invoice: Invoice,
        extracted_data: dict,
        tenant_id: UUID,
        org_id: UUID,
        *,
        source_type: Optional[str] = None,
    ) -> Invoice:
        """Apply modificatory fields (credit/debit note) to an Invoice record."""
        ncf_modified = extracted_data.get("ncf_modified")
        modified_ncf = None
        parent_invoice_id = None

        if ncf_modified:
            modified_ncf = ncf_modified
            parent = (
                db.query(Invoice)
                .filter(
                    Invoice.tenant_id == tenant_id,
                    Invoice.organization_id == org_id,
                    Invoice.invoice_number == ncf_modified,
                    Invoice.is_deleted.is_(False),
                )
                .first()
            )
            if parent:
                parent_invoice_id = parent.id

        # Resolve modification reason (2-digit DGII code)
        mod_reason = extracted_data.get("ncf_modification_type")
        if mod_reason:
            mod_reason = str(mod_reason).strip()
            if mod_reason.isdigit() and len(mod_reason) == 1:
                mod_reason = f"0{mod_reason}"
        if not mod_reason:
            motivo_txt = extracted_data.get("motivo_modificacion")
            if motivo_txt:
                motivo_txt = str(motivo_txt).strip()
                if motivo_txt.isdigit() and len(motivo_txt) == 1:
                    mod_reason = f"0{motivo_txt}"
                elif motivo_txt.isdigit() and len(motivo_txt) == 2:
                    mod_reason = motivo_txt
                elif "anula" in motivo_txt.lower():
                    mod_reason = "01"
                elif "corr" in motivo_txt.lower() or "texto" in motivo_txt.lower():
                    mod_reason = "02"
                elif "descuento" in motivo_txt.lower():
                    mod_reason = "03"
                elif "devol" in motivo_txt.lower():
                    mod_reason = "04"
                elif "precio" in motivo_txt.lower() or "ajuste" in motivo_txt.lower():
                    mod_reason = "05"

        invoice.parent_invoice_id = parent_invoice_id
        invoice.modified_ncf = modified_ncf
        invoice.modification_reason = mod_reason
        invoice.ecf_type = extracted_data.get("ecf_type")
        invoice.is_electronic = True
        invoice.source_type = source_type or extracted_data.get("source_type") or "ecf"

        # Auto-verify if parent found and source is structured XML
        resolved_source = source_type or extracted_data.get("source_type") or "ecf"
        auto_verify = resolved_source in ("ecf", "xml")
        if parent_invoice_id and auto_verify:
            invoice.status = "verified"
            if mod_reason == "01":
                parent = db.query(Invoice).filter(Invoice.id == parent_invoice_id).first()
                if parent:
                    parent.status = "voided"
                    parent.cancelled_at = invoice.invoice_date or utc_now()
                    parent.cancellation_type = "01"
        else:
            invoice.status = "pending_review"

        invoice.raw_extracted_data = json.dumps(dict(extracted_data), ensure_ascii=False)
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

        from app.services.supabase_storage import download_to_temp, resolve_invoice_path

        ocr_path = resolve_invoice_path(invoice, variant="processed")
        if not ocr_path:
            ocr_path = resolve_invoice_path(invoice, variant="original")
        local_path = ocr_path
        cleanup_path = None
        if SUPABASE_URL:
            local_path = download_to_temp(ocr_path)
            if not local_path:
                invoice.processed = True
                invoice.status = "draft"
                invoice.confidence_score = 0.0
                invoice.audit_flags = json.dumps(["Error de procesamiento de IA: No se pudo descargar el archivo del storage"], ensure_ascii=False)
                db.commit()
                return {"status": "error", "error": "No se pudo descargar el archivo del storage"}
            cleanup_path = local_path

        # Look up org RNC for direction resolution
        org = db.query(Organization).filter(Organization.id == org_id).first()
        org_rnc = org.tax_id if org else None

        try:
            success, extracted_data, source_type = await run_in_threadpool(
                self.orchestrator.process,
                local_path,
                invoice.file_type,
                invoice,
                db,
                str(user_id) if user_id else None,
                org_rnc,
            )
        except Exception as exc:
            success = False
            extracted_data = {"error": str(exc)}
            source_type = invoice.file_type
        finally:
            if cleanup_path and os.path.exists(cleanup_path):
                os.unlink(cleanup_path)

        if not success or extracted_data.get("error"):
            invoice.processed = True
            invoice.status = "draft"
            invoice.confidence_score = 0.0
            error_details = extracted_data.get("error", "No se pudieron extraer datos") if extracted_data else "No se pudieron extraer datos"
            invoice.audit_flags = json.dumps([f"Error de procesamiento de IA: {error_details}"], ensure_ascii=False)
            db.commit()
            return {
                "status": "error",
                "error": error_details,
                "extracted_data": extracted_data or {},
            }

        if success and extracted_data:
            tax_id = extracted_data.get("vendor_tax_id")
            if tax_id:
                official_name = await lookup_rnc_name_from_dgii(tax_id)
                if official_name:
                    extracted_data["vendor_name"] = official_name

        invoice, conflicting = self.apply_extracted_data(db, invoice, extracted_data, tenant_id, org_id)
        invoice.source_type = source_type or invoice.file_type

        if extracted_data.get("original_xml_data"):
            invoice.original_xml_data = extracted_data["original_xml_data"]

        # Modificatory detection (credit/debit notes) — keep as Invoice, just add fields
        if self._is_modificatory_pipeline_result(extracted_data):
            self._apply_modificatory_data(db, invoice, extracted_data, tenant_id, org_id, source_type=source_type)
        else:
            if extracted_data.get("ecf_type"):
                invoice.ecf_type = extracted_data["ecf_type"]

            is_ecf = bool(extracted_data.get("ecf_type")) or source_type == "xml"
            invoice.is_electronic = is_ecf

            auto_verify = source_type in ("ecf", "xml")
            if auto_verify:
                invoice.status = "verified"
            else:
                invoice.status = "draft"

        if not invoice.ingestion_source:
            invoice.ingestion_source = "manual_entry"

        # ── Auto-classify fiscal status after extraction ──
        if invoice.fiscal_status in (None, "pending_review"):
            from app.services.fiscal_classifier import fiscal_classifier
            new_status, _ = fiscal_classifier.classify(invoice)
            invoice.fiscal_status = new_status

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

        result: dict = {
            "status": "success",
            "invoice": invoice,
            "extracted_data": extracted_data,
        }

        if conflicting:
            result["duplicate_ncf"] = {
                "invoice_id": str(conflicting.id),
                "invoice_number": conflicting.invoice_number,
                "vendor_name": conflicting.vendor_name,
                "invoice_date": conflicting.invoice_date.isoformat() if conflicting.invoice_date else None,
                "total_amount": conflicting.total_amount,
            }

        return result

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
