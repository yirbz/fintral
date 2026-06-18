import json

from app.config import SUPABASE_URL, SUPABASE_STORAGE_BUCKET
from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from uuid_utils import uuid7

from app.database import Base, GUID


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        Index("ix_invoices_tenant_org", "tenant_id", "organization_id"),
        Index("ix_invoices_vendor_date", "tenant_id", "organization_id", "vendor_tax_id", "invoice_date"),
        Index("ix_invoices_ncf", "tenant_id", "organization_id", "invoice_number"),
        Index("ix_invoices_source", "tenant_id", "organization_id", "source_type"),
        Index("ix_invoices_parent", "parent_invoice_id"),
    )

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    organization_id = Column(GUID, ForeignKey("organizations.id"), nullable=False, index=True)

    filename = Column(String, index=True)
    file_path = Column(String)
    processed_path = Column(String, nullable=True)
    file_type = Column(String)  # 'image' or 'pdf'

    # Datos extraídos de la factura
    vendor_name = Column(String)
    invoice_number = Column(String)
    invoice_date = Column(DateTime(timezone=True))
    total_amount = Column(Float)
    tax_amount = Column(Float)
    currency = Column(String, default="USD")

    # Clasificación
    transaction_type = Column(String)  # 'income' or 'expense'
    category = Column(String)
    description = Column(Text)

    # Datos de OpenAI
    raw_extracted_data = Column(Text)  # JSON string con datos completos de OpenAI
    confidence_score = Column(Float)
    audit_flags = Column(Text)  # JSON string con alertas de auditoría

    # Costos y métricas OpenAI
    openai_tokens_used = Column(Integer, default=0)
    openai_cost_usd = Column(Float, default=0.0)
    openai_model_used = Column(String)
    openai_processing_time = Column(Float)  # segundos

    # Datos fiscales del proveedor
    vendor_country = Column(String(3))  # ISO 3166-1 alpha-3
    vendor_tax_id = Column(String)  # NIT/RNC/RFC/EIN/VAT
    vendor_fiscal_address = Column(Text)
    line_items_data = Column(Text)  # JSON
    country_detection_method = Column(String)
    country_confidence = Column(Float)
    goods_services_type = Column(String)  # DGII 606

    # File metadata
    file_size = Column(Integer, nullable=True)  # bytes of the original uploaded file

    # Pipeline metadata
    source_type = Column(String(20))  # xml, pdf_text, pdf_image, image_ocr, image_ai, xlsx, manual
    quality_report = Column(Text, nullable=True)  # JSON with quality analysis
    original_xml_data = Column(Text)  # Raw XML content for e-CF invoices
    ecf_type = Column(String(2))  # e-CF type code (31-47, 33=debit, 34=credit)
    batch_id = Column(GUID, nullable=True)  # Groups XLSX bulk imports

    # Hybrid ingestion layer (e-CF vs physical NCF)
    rnc_comprador = Column(String, nullable=True)  # Buyer RNC (DGII comprador)
    is_electronic = Column(Boolean, default=False, nullable=False)  # True for e-CF, False for physical NCF
    ingestion_source = Column(String(20), nullable=True)  # xml_upload, whatsapp_ocr, manual_entry, email_api
    status = Column(String(20), default="draft", nullable=False, index=True)  # draft, pending_review, verified, voided

    # Comprobantes modificatorios (Notas de Crédito/Débito — es同一 tabla)
    parent_invoice_id = Column(GUID, ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True)
    modified_ncf = Column(String, nullable=True, index=True)  # NCF/e-CF de la factura padre
    modification_reason = Column(String(2), nullable=True)  # DGII codes 01-10

    # Operational metadata
    accounting_account_id = Column(String, nullable=True)
    cost_center_id = Column(String, nullable=True)
    tags = Column(Text, nullable=True)  # JSON array of tags
    internal_notes = Column(Text, nullable=True)
    payment_status = Column(String(20), nullable=True)  # pending, paid, overdue
    payment_condition = Column(String(20), default="contado", nullable=True)  # contado, credito
    due_date = Column(DateTime(timezone=True), nullable=True)
    payment_date = Column(DateTime(timezone=True), nullable=True)
    bank_account_id = Column(GUID, ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True)
    upload_link_id = Column(GUID, ForeignKey("upload_links.id", ondelete="SET NULL"), nullable=True, index=True)


    # Metadatos
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    processed = Column(Boolean, default=False)

    # Soft delete
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    deleted_by = Column(GUID, nullable=True)

    # DGII cancellation (Formulario 608)
    cancelled_at = Column(DateTime(timezone=True), nullable=True, index=True)
    cancellation_type = Column(String(2), nullable=True)  # Código 01-10 DGII

    # DGII real-time validation (ConsultaTimbreFC)
    dgii_security_code = Column(String, nullable=True)  # CodigoSeguridad del QR
    dgii_validation_status = Column(String(20), nullable=False, default="unchecked", index=True)  # unchecked, accepted, rejected, voided, registered, pending, not_found, error
    dgii_validation_date = Column(DateTime(timezone=True), nullable=True, index=True)  # Última validación
    dgii_validation_detail = Column(Text, nullable=True)  # JSON con detalle de validación DGII

    # Fiscal conciliation status (independent from commercial flow)
    # Controls whether this invoice is included in DGII 606/607 reports
    fiscal_status = Column(
        String(20),
        nullable=False,
        default="pending_review",
        index=True,
    )
    # When fiscal_status = 'deferred', overrides which period the invoice reports in
    fiscal_period_override = Column(String(6), nullable=True)  # "202607"
    # When fiscal_status = 'non_deductible', reason code
    fiscal_exclusion_reason = Column(String(100), nullable=True)

    FISCAL_STATUSES = {
        "pending_review": "Recién ingresada, aún no clasificada fiscalmente",
        "valid": "Validada: NCF correcto, RNC existe, datos completos. Pasa al 606.",
        "invalid": "Tiene problemas detectados. Requiere acción del usuario antes del cierre.",
        "deferred": "Excluida de este período, se mueve al siguiente usando fiscal_period_override.",
        "non_deductible": "Gasto real pero sin validez fiscal. Excluida permanentemente del 606.",
    }

    # Relationships
    organization = relationship("Organization", back_populates="invoices")
    parent_invoice = relationship("Invoice", remote_side=[id], back_populates="child_invoices", lazy="select")
    child_invoices = relationship("Invoice", back_populates="parent_invoice", lazy="select")
    bank_account = relationship("BankAccount", lazy="select")

    @property
    def is_modificatory(self) -> bool:
        """True if this invoice is a credit or debit note."""
        if self.ecf_type in ("33", "34"):
            return True
        ncf = (self.invoice_number or "").strip().upper()
        if ncf.startswith("B03") or ncf.startswith("B04"):
            return True
        if ncf.startswith("E33") or ncf.startswith("E34"):
            return True
        return False

    @property
    def modificatory_sign(self) -> int:
        """Financial sign: -1 for credit notes, +1 for debit notes, 0 for regular invoices."""
        if self.ecf_type == "34" or (self.invoice_number or "").strip().upper().startswith(("B04", "E34")):
            return -1
        if self.ecf_type == "33" or (self.invoice_number or "").strip().upper().startswith(("B03", "E33")):
            return 1
        return 0

    def to_dict(self):
        file_url = None
        processed_url = None
        if self.file_path:
            file_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{self.file_path.lstrip('/')}"
            if self.processed_path:
                processed_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{self.processed_path.lstrip('/')}"

        children = []
        if self.child_invoices:
            for child in self.child_invoices:
                if not child.is_deleted:
                    children.append({
                        "id": str(child.id),
                        "invoice_number": child.invoice_number,
                        "ecf_type": child.ecf_type,
                        "total_amount": child.total_amount,
                        "invoice_date": child.invoice_date.isoformat() if child.invoice_date else None,
                        "modification_reason": child.modification_reason,
                        "is_modificatory": child.is_modificatory,
                        "modificatory_sign": child.modificatory_sign,
                        "status": child.status,
                        "created_at": child.created_at.isoformat() if child.created_at else None,
                    })

        return {
            "id": str(self.id),
            "filename": self.filename,
            "file_type": self.file_type,
            "file_url": file_url,
            "processed_url": processed_url,
            "vendor_name": self.vendor_name,
            "invoice_number": self.invoice_number,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "total_amount": self.total_amount,
            "tax_amount": self.tax_amount,
            "currency": self.currency,
            "transaction_type": self.transaction_type,
            "category": self.category,
            "description": self.description,
            "confidence_score": self.confidence_score,
            "audit_flags": self.audit_flags,
            "openai_tokens_used": self.openai_tokens_used,
            "openai_cost_usd": self.openai_cost_usd,
            "openai_model_used": self.openai_model_used,
            "openai_processing_time": self.openai_processing_time,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "processed": self.processed,
            "vendor_country": self.vendor_country,
            "vendor_tax_id": self.vendor_tax_id,
            "vendor_fiscal_address": self.vendor_fiscal_address,
            "line_items": json.loads(self.line_items_data) if self.line_items_data else [],
            "country_detection_method": self.country_detection_method,
            "country_confidence": self.country_confidence,
            "organization_id": str(self.organization_id),
            "tenant_id": str(self.tenant_id),
            "goods_services_type": self.goods_services_type,
            "source_type": self.source_type,
            "original_xml_data": self.original_xml_data,
            "raw_extracted_data": self.raw_extracted_data,
            "ecf_type": self.ecf_type,
            "rnc_comprador": self.rnc_comprador,
            "is_electronic": self.is_electronic,
            "ingestion_source": self.ingestion_source,
            "status": self.status,
            "parent_invoice_id": str(self.parent_invoice_id) if self.parent_invoice_id else None,
            "modified_ncf": self.modified_ncf,
            "modification_reason": self.modification_reason,
            "is_modificatory": self.is_modificatory,
            "modificatory_sign": self.modificatory_sign,
            "child_modificatories": children,
            "accounting_account_id": self.accounting_account_id,
            "cost_center_id": self.cost_center_id,
            "tags": json.loads(self.tags) if self.tags else [],
            "internal_notes": self.internal_notes,
            "payment_status": self.payment_status,
            "payment_condition": self.payment_condition,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "payment_date": self.payment_date.isoformat() if self.payment_date else None,
            "bank_account_id": str(self.bank_account_id) if self.bank_account_id else None,
            "batch_id": str(self.batch_id) if self.batch_id else None,
            "upload_link_id": str(self.upload_link_id) if self.upload_link_id else None,
            "is_deleted": self.is_deleted,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "cancellation_type": self.cancellation_type,
            "dgii_security_code": self.dgii_security_code,
            "dgii_validation_status": self.dgii_validation_status or "unchecked",
            "dgii_validation_date": self.dgii_validation_date.isoformat() if self.dgii_validation_date else None,
            "dgii_validation_detail": self.dgii_validation_detail,
            "fiscal_status": self.fiscal_status or "pending_review",
            "fiscal_period_override": self.fiscal_period_override,
            "fiscal_exclusion_reason": self.fiscal_exclusion_reason,
        }
