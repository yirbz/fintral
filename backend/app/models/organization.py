from app.utils.dates import utc_now

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship, validates
from uuid_utils import uuid7

from app.database import Base, GUID


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(GUID, primary_key=True, default=uuid7)
    tenant_id = Column(GUID, ForeignKey("tenants.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    tax_id = Column(String)
    phone = Column(String, nullable=True)
    email_contact = Column(String, nullable=True)
    website = Column(String, nullable=True)
    country = Column(String(3))  # ISO 3166-1 alpha-3
    fiscal_address = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_ecf_authorized = Column(Boolean, default=False, nullable=False)
    settings_json = Column(Text, default="{}")
    
    # Estado de certificación DGII/Alanube
    # Valores: "none" | "company_registered" | "certificate_uploaded" | "set_test_running" | "set_test_approved" | "certified" | "set_test_rejected"
    certification_status = Column(String, default="none", nullable=False)
    alanube_company_id = Column(String, nullable=True)       # ID de empresa en Alanube (lockeado al iniciar certificación)
    alanube_environment = Column(String, nullable=True)       # "TesteCF" o "eCF"
    certificate_uploaded_at = Column(DateTime(timezone=True), nullable=True)
    economic_activity = Column(String, nullable=True)         # Actividad económica para DGII
    certification_step = Column(String, default="0", nullable=False)  # Paso actual del wizard (0=inicio, 1=datos empresa, 2=certificado, 3=test)
    is_certification_completed = Column(Boolean, default=False, nullable=False)  # ¿Terminó el proceso de certificación?
    
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    tenant = relationship("Tenant", back_populates="organizations")
    invoices = relationship("Invoice", back_populates="organization", lazy="select")
    notifications = relationship("Notification", back_populates="organization", lazy="select")
    webhooks = relationship("WebhookEndpoint", back_populates="organization", lazy="select")

    @validates('tax_id')
    def validate_tax_id(self, key, value):
        old_val = (self.tax_id or "").strip()
        new_val = (value or "").strip()
        if old_val and old_val != new_val:
            raise ValueError("El RNC/Cédula no puede ser modificado una vez registrado.")
        return value
