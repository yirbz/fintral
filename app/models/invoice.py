import json
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from app.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    file_path = Column(String)
    file_type = Column(String)  # 'image' or 'pdf'

    # Datos extraídos de la factura
    vendor_name = Column(String)
    invoice_number = Column(String)
    invoice_date = Column(DateTime)
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

    # Metadatos
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    processed = Column(Boolean, default=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_type": self.file_type,
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
            "organization_id": self.organization_id,
            "goods_services_type": self.goods_services_type,
        }
