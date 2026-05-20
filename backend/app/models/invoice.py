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

    # Pipeline metadata
    source_type = Column(String(20))  # xml, pdf_text, pdf_image, image_ocr, image_ai, xlsx, manual
    quality_report = Column(Text, nullable=True)  # JSON with quality analysis
    original_xml_data = Column(Text)  # Raw XML content for e-CF invoices
    ecf_type = Column(String(2))  # e-CF type code (31-47)
    batch_id = Column(GUID, nullable=True)  # Groups XLSX bulk imports

    # Metadatos
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    processed = Column(Boolean, default=False)

    # Soft delete
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    deleted_by = Column(GUID, nullable=True)

    # DGII cancellation (Formulario 608)
    cancelled_at = Column(DateTime(timezone=True), nullable=True, index=True)
    cancellation_type = Column(String(2), nullable=True)  # Código 01-10 DGII

    # Relationships
    organization = relationship("Organization", back_populates="invoices")

    def to_dict(self):
        file_url = None
        processed_url = None
        if self.file_path:
            file_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{self.file_path.lstrip('/')}"
            if self.processed_path:
                processed_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{self.processed_path.lstrip('/')}"
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
            "ecf_type": self.ecf_type,
            "batch_id": str(self.batch_id) if self.batch_id else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "cancellation_type": self.cancellation_type,
        }
