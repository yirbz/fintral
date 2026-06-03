import json
import logging
import re
from datetime import date, datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Header,
    Request,
    UploadFile,
    File,
    Form,
)
from pydantic import BaseModel, Field, field_validator, model_validator

import httpx

from app.config import IS_DEVELOPMENT, SECRET_KEY
from app.core.reference_data import get_cached_domain
from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Client, Product, EcfSequence, Invoice, Organization
from app.services.alanube import AlanubeService
from app.services import audit_logger
from app.services.supabase_storage import build_storage_path, upload_file
from app.core.redis import invalidate_stats_cache
from app.database import SessionLocal

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])

# ---------------------------------------------------------------------------
# Error Handling Utilities
# ---------------------------------------------------------------------------


class AlanubeCertificationError(Exception):
    """Custom exception for Alanube certification errors with user-friendly messages."""

    def __init__(self, error_code: str, technical_message: str, user_message: str):
        self.error_code = error_code
        self.technical_message = technical_message
        self.user_message = user_message
        super().__init__(user_message)


def map_alanube_error_to_user_message(technical_message: str) -> tuple[str, str]:
    """
    Map Alanube error codes and messages to user-friendly Spanish notifications.
    Parses Alanube API error response format:
      "Alanube API Error: {\"errors\": [{\"code\": \"AP1010\", \"message\": \"...\"}]}"
    Returns (error_code, user_message) tuple.
    """
    error_mappings = {
        # Certificate errors
        "AP1001": (
            "certificate_invalid",
            "El certificado digital es inválido o no cumple con los requisitos. "
            "Verifique que sea un archivo válido en formato PKCS12 (.p12 o .pfx).",
        ),
        "AP1010": (
            "certificate_password_wrong",
            "La contraseña del certificado digital es incorrecta. Verifique que la contraseña sea la correcta.",
        ),
        "AP1011": (
            "certificate_format_invalid",
            "El certificado debe estar en formato PKCS12 (.p12 o .pfx). "
            "El archivo proporcionado tiene un formato diferente.",
        ),
        "AP1012": (
            "certificate_corrupted",
            "El certificado está corrupto o no se puede leer correctamente. Intente con otro archivo de certificado.",
        ),
        "AP1013": (
            "certificate_expired",
            "El certificado digital ha expirado. Por favor, renuévelo con la autoridad certificadora.",
        ),
        "AP1005": (
            "certificate_expired",
            "El certificado digital ha expirado. Por favor, renuévelo con la autoridad certificadora.",
        ),
        # Company/RNC errors
        "AP1002": (
            "company_not_found",
            "No se encontró la compañía en el sistema de facturación electrónica. "
            "Por favor, intente nuevamente o contacte al soporte.",
        ),
        "AP1004": (
            "main_company_exists",
            "Ya existe una empresa principal registrada para este usuario en el sistema de facturación. "
            "Solo se permite una empresa principal.",
        ),
        "AP1006": (
            "company_incomplete",
            "Faltan datos obligatorios de la compañía. Verifique que todos los campos estén completos.",
        ),
        "AP1016": (
            "rnc_mismatch",
            "El RNC o cédula no coincide con la información registrada de la compañía.",
        ),
        "AP1015": (
            "must_have_main_company",
            "Debe registrar una empresa principal antes de registrar empresas asociadas.",
        ),
        # Certificate signature/format errors
        "AP1007": (
            "signature_type_not_supported",
            "El tipo de firma del certificado no es compatible. Asegúrese de usar un certificado de firma final.",
        ),
        # Logo errors
        "AP1009": (
            "logo_size_exceeded",
            "La imagen del logo es demasiado grande. El tamaño máximo permitido es 150 KB.",
        ),
        # Webhook errors
        "AP1014": (
            "webhook_invalid",
            "La URL del webhook es inválida o no es accesible.",
        ),
        # Set test errors
        "AP1008": (
            "already_certified",
            "Esta empresa ya ha sido certificada. No se puede iniciar un nuevo proceso de certificación.",
        ),
        # Synchronous validation errors (AP16xxx)
        "AP16001": (
            "company_type_invalid",
            "El tipo de compañía es inválido. Debe ser principal o asociada.",
        ),
        "AP16003": (
            "certificate_extension_invalid",
            "La extensión del certificado es inválida. Debe ser un string sin punto.",
        ),
        "AP16004": (
            "certificate_content_invalid",
            "El contenido del certificado es inválido. Debe ser una cadena en formato base64.",
        ),
        # General authentication/connection errors
        "401": (
            "unauthorized",
            "Error de autorización con el sistema de facturación. "
            "Verifique que las credenciales estén configuradas correctamente.",
        ),
        "403": (
            "forbidden",
            "No tiene permisos para realizar esta acción. Contacte al administrador del sistema.",
        ),
        "500": (
            "server_error",
            "Error en el servidor del sistema de facturación. Por favor, intente nuevamente en unos momentos.",
        ),
        "503": (
            "service_unavailable",
            "El sistema de facturación no está disponible en este momento. Intente nuevamente más tarde.",
        ),
        "timeout": (
            "connection_timeout",
            "Se agotó el tiempo de espera al conectar con el sistema de facturación. "
            "Verifique su conexión a internet e intente nuevamente.",
        ),
    }

    # Try to parse Alanube API error JSON
    extracted_code = None
    if technical_message.startswith("Alanube API Error:"):
        json_str = technical_message[len("Alanube API Error:") :].strip()
        try:
            payload = json.loads(json_str)
            # Try extracting from {"errors": [{"code": "...", "message": "..."}]}
            errors = payload.get("errors", [])
            if errors and isinstance(errors, list):
                extracted_code = errors[0].get("code")
            # If field-level errors: {"field": {"code": "..."}}
            if not extracted_code:
                for field_val in payload.values():
                    if isinstance(field_val, dict) and "code" in field_val:
                        extracted_code = field_val["code"]
                        break
        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
            pass

    # Try exact match on extracted code
    if extracted_code and extracted_code in error_mappings:
        return error_mappings[extracted_code]

    # Try substring match of entire technical_message against error_mappings keys
    for key, value in error_mappings.items():
        if key in technical_message:
            return value

    # Fallback: generic message
    return (
        "unknown_error",
        "Ocurrió un error inesperado durante el proceso. Por favor, intente nuevamente o contacte al soporte.",
    )


# Extended emission-specific error codes (AP19xxx + AEP2xxx)
EMISSION_ERROR_MAPPINGS: dict[str, tuple[str, str]] = {
    # AP19xxx — Synchronous validation (pre-emission)
    "AP19001": (
        "invalid_ecf_type",
        "El tipo de comprobante electrónico no es válido para esta operación.",
    ),
    "AP19002": ("invalid_encf", "El número de e-CF (eNCF) proporcionado no es válido."),
    "AP19003": (
        "expired_sequence",
        "El rango de secuencia e-CF ha vencido. Debe cargar un nuevo rango.",
    ),
    "AP19004": (
        "exhausted_sequence",
        "El rango de secuencia e-CF está agotado. Debe cargar un nuevo rango.",
    ),
    "AP19005": (
        "rnc_format",
        "El RNC del comprador no tiene un formato válido. Debe tener 9 u 11 dígitos.",
    ),
    "AP19006": (
        "invalid_item",
        "Uno de los productos o servicios en la factura contiene datos inválidos.",
    ),
    "AP19007": (
        "total_mismatch",
        "El total declarado no coincide con la suma de los items.",
    ),
    "AP19008": (
        "itbis_mismatch",
        "El ITBIS declarado no coincide con el cálculo de los items.",
    ),
    "AP19009": (
        "date_invalid",
        "La fecha de emisión no es válida o está fuera del rango permitido.",
    ),
    "AP19010": (
        "inactive_company",
        "La empresa emisora no está activa en el sistema de facturación electrónica.",
    ),
    "AP19011": (
        "buyer_rnc_required",
        "El RNC del comprador es obligatorio para comprobantes electrónicos.",
    ),
    "AP19012": (
        "buyer_name_required",
        "El nombre del comprador es obligatorio para comprobantes electrónicos.",
    ),
    "AP19013": (
        "duplicate_encf",
        "Ya existe un comprobante con este mismo número de e-CF (eNCF).",
    ),
    "AP19100": (
        "dgii_validation",
        "La DGII rechazó la validación del comprobante. Verifique los datos fiscales.",
    ),
    "AP19101": (
        "dgii_timeout",
        "La DGII no respondió a tiempo. El comprobante será procesado de forma asíncrona.",
    ),
    "AP19102": (
        "dgii_connection",
        "Error de conexión con la DGII. Intente nuevamente.",
    ),
    # AEP2xxx — Asynchronous post-emission validation
    "AEP2001": ("dgii_rejected", "La DGII rechazó el comprobante electrónico."),
    "AEP2002": (
        "dgii_rejected_rnc",
        "La DGII rechazó el comprobante porque el RNC del comprador no está registrado.",
    ),
    "AEP2003": (
        "dgii_rejected_duplicate",
        "La DGII rechazó el comprobante porque ya existe uno con los mismos datos.",
    ),
    "AEP2004": (
        "dgii_rejected_sequence",
        "La DGII rechazó el comprobante porque la secuencia e-CF no está autorizada.",
    ),
    "AEP2005": (
        "pending_review",
        "El comprobante está siendo revisado por la DGII. Estado pendiente.",
    ),
    "AEP2006": (
        "async_processing",
        "El comprobante está siendo procesado de forma asíncrona por la DGII. "
        "Recibirá una notificación cuando esté aprobado.",
    ),
    "AEP2007": (
        "async_approved",
        "El comprobante fue aprobado por la DGII de forma asíncrona.",
    ),
    "AEP2008": (
        "async_rejected",
        "El comprobante fue rechazado por la DGII de forma asíncrona.",
    ),
    "AEP2XXX": (
        "async_generic",
        "El comprobante ha sido enviado a la DGII para procesamiento asíncrono.",
    ),
    # Schema validation codes (numeric)
    "400": (
        "bad_request",
        "La solicitud contiene datos inválidos. Verifique los campos e intente nuevamente.",
    ),
    "422": (
        "validation_error",
        "Los datos enviados no pasaron la validación del esquema. Revise los campos obligatorios.",
    ),
    "429": (
        "rate_limit",
        "Ha excedido el límite de solicitudes. Espere unos segundos e intente nuevamente.",
    ),
}


def map_emission_error(technical_message: str) -> tuple[str, str, bool]:
    """
    Map Alanube emission-specific errors.
    Returns (error_code, user_message, is_async) tuple.
    is_async=True means the emission is pending async processing.
    """
    extracted_code = None
    if technical_message.startswith("Alanube API Error:"):
        json_str = technical_message[len("Alanube API Error:") :].strip()
        try:
            payload = json.loads(json_str)
            errors = payload.get("errors", [])
            if errors and isinstance(errors, list):
                extracted_code = errors[0].get("code")
            if not extracted_code:
                for field_val in payload.values():
                    if isinstance(field_val, dict) and "code" in field_val:
                        extracted_code = field_val["code"]
                        break
        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
            pass

    if extracted_code and extracted_code in EMISSION_ERROR_MAPPINGS:
        code, msg = EMISSION_ERROR_MAPPINGS[extracted_code]
        is_async = extracted_code in ("AEP2006", "AEP2XXX", "AP19101")
        return (code, msg, is_async)

    for key, value in EMISSION_ERROR_MAPPINGS.items():
        if key in technical_message:
            is_async = key in ("AEP2006", "AEP2XXX", "AP19101")
            return (value[0], value[1], is_async)

    return (
        "unknown_error",
        "Ocurrió un error inesperado al emitir el comprobante. Intente nuevamente.",
        False,
    )


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------


class ClientSchema(BaseModel):
    id: str
    name: str
    tax_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class ClientCreate(BaseModel):
    name: str
    tax_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class ProductSchema(BaseModel):
    id: str
    name: str
    internal_code: Optional[str] = None
    description: Optional[str] = None
    price: float
    tax_rate: float
    is_active: bool


class ProductCreate(BaseModel):
    name: str
    internal_code: Optional[str] = None
    description: Optional[str] = None
    price: float = Field(..., ge=0.0)
    tax_rate: float = Field(18.0, ge=0.0, le=100.0)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    internal_code: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    tax_rate: Optional[float] = None
    is_active: Optional[bool] = None


class EcfSequenceSchema(BaseModel):
    id: str
    ecf_type: int
    prefix: str
    start_number: int
    end_number: int
    current_number: int
    expiry_date: Optional[date] = None
    is_active: bool


class EcfSequenceCreate(BaseModel):
    ecf_type: int
    prefix: str = "E"
    start_number: int
    end_number: int
    current_number: int
    expiry_date: Optional[date] = None

    @field_validator("prefix")
    @classmethod
    def validate_prefix(cls, v: str) -> str:
        v_upper = v.upper().strip()
        if v_upper not in ("E", "B"):
            raise ValueError("El prefijo de la secuencia debe ser 'E' (Electrónico) o 'B' (Físico/Tradicional).")
        return v_upper

    @field_validator("start_number", "end_number")
    @classmethod
    def validate_positive_numbers(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("El número de secuencia debe ser mayor que cero.")
        return v

    @field_validator("current_number")
    @classmethod
    def validate_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("El número actual no puede ser negativo.")
        return v

    @field_validator("expiry_date")
    @classmethod
    def validate_expiry_date(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v < date.today():
            raise ValueError("La fecha de vencimiento no puede estar en el pasado.")
        return v

    @model_validator(mode="after")
    def validate_ranges(self) -> "EcfSequenceCreate":
        if self.start_number > self.end_number:
            raise ValueError("El número inicial del rango no puede ser mayor que el número final.")
        if self.current_number < self.start_number - 1:
            raise ValueError(
                f"El número actual ({self.current_number}) debe ser mayor "
                f"o igual al número inicial - 1 ({self.start_number - 1})."
            )
        if self.current_number > self.end_number:
            raise ValueError(
                f"El número actual ({self.current_number}) no puede exceder "
                f"el número final del rango ({self.end_number})."
            )

        is_electronic = self.ecf_type in (31, 32, 34, 43, 44, 45)
        if is_electronic and self.prefix != "E":
            raise ValueError(f"Para comprobantes electrónicos (tipo {self.ecf_type}), el prefijo debe ser 'E'.")
        elif not is_electronic and self.prefix != "B":
            raise ValueError(
                f"Para comprobantes tradicionales/físicos (tipo {self.ecf_type}), el prefijo debe ser 'B'."
            )

        return self


class EcfSequenceUpdate(BaseModel):
    prefix: Optional[str] = None
    start_number: Optional[int] = None
    end_number: Optional[int] = None
    current_number: Optional[int] = None
    expiry_date: Optional[date] = None
    is_active: Optional[bool] = None

    @field_validator("prefix")
    @classmethod
    def validate_prefix(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_upper = v.upper().strip()
            if v_upper not in ("E", "B"):
                raise ValueError("El prefijo de la secuencia debe ser 'E' o 'B'.")
            return v_upper
        return v

    @field_validator("start_number", "end_number")
    @classmethod
    def validate_positive_numbers(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("El número de secuencia debe ser mayor que cero.")
        return v

    @field_validator("current_number")
    @classmethod
    def validate_non_negative(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError("El número actual no puede ser negativo.")
        return v

    @field_validator("expiry_date")
    @classmethod
    def validate_expiry_date(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v < date.today():
            raise ValueError("La fecha de vencimiento no puede estar en el pasado.")
        return v


class InvoiceLineItem(BaseModel):
    product_id: Optional[str] = None  # Optional for quick mode (ad-hoc items)
    description: Optional[str] = None  # Required if product_id is not provided
    quantity: float = Field(..., gt=0.0)
    unit_price: float = Field(..., ge=0.0)
    discount_rate: float = Field(0.0, ge=0.0, le=100.0)
    tax_rate: Optional[float] = None  # Override product tax rate; required if no product_id


class InvoiceCreate(BaseModel):
    client_id: Optional[str] = None
    ecf_type: Optional[int] = None  # e.g. 31, 32, 34
    payment_type: int = 1  # 1: Contado, 2: Crédito
    payment_method: Optional[int] = None  # 1: Efectivo, 2: Cheque/Transf, 3: Tarjeta, etc.
    notes: Optional[str] = None
    reference_ecf: Optional[str] = None
    reference_date: Optional[date] = None
    items: List[InvoiceLineItem]
    # Quick-mode direct buyer fields (optional if client_id provided)
    buyer_name: Optional[str] = None
    buyer_rnc: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_phone: Optional[str] = None
    buyer_email: Optional[str] = None
    invoice_date: Optional[datetime] = None  # Override emission date


# ---------------------------------------------------------------------------
# Clients Endpoint
# ---------------------------------------------------------------------------


@router.get("/clients", response_model=List[ClientSchema])
async def list_clients(ctx: TenantContext = Depends(require_tenant)):
    clients = (
        ctx.db.query(Client)
        .filter(
            Client.tenant_id == ctx.tenant_id,
            Client.organization_id == ctx.org_id,
            Client.deleted_at.is_(None),
        )
        .order_by(Client.name.asc())
        .all()
    )
    return [c.to_dict() for c in clients]


@router.post("/clients", response_model=ClientSchema)
async def create_client(payload: ClientCreate, ctx: TenantContext = Depends(require_tenant)):
    clean_tax_id = None
    if payload.tax_id:
        clean_tax_id = re.sub(r"[^0-9]", "", payload.tax_id)

    if clean_tax_id:
        from app.utils.validation import is_valid_rnc_or_cedula

        if not is_valid_rnc_or_cedula(clean_tax_id):
            raise HTTPException(
                status_code=400,
                detail=(
                    "El RNC/Cédula no es válido. Debe ser un RNC (9 dígitos) "
                    "o cédula (11 dígitos) dominicana con dígito verificador correcto."
                ),
            )
        org_rnc = re.sub(r"[^0-9]", "", ctx.organization.tax_id or "")
        if org_rnc and clean_tax_id == org_rnc:
            raise HTTPException(
                status_code=400,
                detail="No puedes registrar tu propio RNC como cliente. El comprador debe ser un tercero.",
            )
        existing = (
            ctx.db.query(Client)
            .filter(
                Client.tenant_id == ctx.tenant_id,
                Client.organization_id == ctx.org_id,
                Client.tax_id == clean_tax_id,
                Client.deleted_at.is_(None),
            )
            .first()
        )
        if existing:
            if payload.name and existing.name != payload.name:
                existing.name = payload.name
            existing.phone = payload.phone
            existing.email = payload.email
            existing.address = payload.address
            existing.updated_at = datetime.utcnow()
            ctx.db.commit()
            ctx.db.refresh(existing)
            return existing.to_dict()

    client = Client(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        name=payload.name,
        tax_id=clean_tax_id,
        phone=payload.phone,
        email=payload.email,
        address=payload.address,
    )
    ctx.db.add(client)
    ctx.db.commit()
    ctx.db.refresh(client)
    return client.to_dict()


@router.put("/clients/{client_id}", response_model=ClientSchema)
async def update_client(client_id: str, payload: ClientCreate, ctx: TenantContext = Depends(require_tenant)):
    client = (
        ctx.db.query(Client)
        .filter(
            Client.id == UUID(client_id),
            Client.tenant_id == ctx.tenant_id,
            Client.organization_id == ctx.org_id,
            Client.deleted_at.is_(None),
        )
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    clean_tax_id = None
    if payload.tax_id:
        clean_tax_id = re.sub(r"[^0-9]", "", payload.tax_id)

    if clean_tax_id:
        from app.utils.validation import is_valid_rnc_or_cedula

        if not is_valid_rnc_or_cedula(clean_tax_id):
            raise HTTPException(
                status_code=400,
                detail=(
                    "El RNC/Cédula no es válido. Debe ser un RNC (9 dígitos) "
                    "o cédula (11 dígitos) dominicana con dígito verificador correcto."
                ),
            )
        org_rnc = re.sub(r"[^0-9]", "", ctx.organization.tax_id or "")
        if org_rnc and clean_tax_id == org_rnc:
            raise HTTPException(
                status_code=400,
                detail="No puedes asignar tu propio RNC como cliente. El comprador debe ser un tercero.",
            )
        conflict = (
            ctx.db.query(Client)
            .filter(
                Client.id != UUID(client_id),
                Client.tenant_id == ctx.tenant_id,
                Client.organization_id == ctx.org_id,
                Client.tax_id == clean_tax_id,
                Client.deleted_at.is_(None),
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Ya existe un cliente con este RNC/Cédula: {conflict.name}. "
                    f"Elimínalo o edítalo antes de continuar."
                ),
            )

    client.name = payload.name
    client.tax_id = clean_tax_id
    client.phone = payload.phone
    client.email = payload.email
    client.address = payload.address
    client.updated_at = datetime.utcnow()

    ctx.db.commit()
    ctx.db.refresh(client)
    return client.to_dict()


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, ctx: TenantContext = Depends(require_tenant)):
    client = (
        ctx.db.query(Client)
        .filter(
            Client.id == UUID(client_id),
            Client.tenant_id == ctx.tenant_id,
            Client.organization_id == ctx.org_id,
            Client.deleted_at.is_(None),
        )
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    client.deleted_at = datetime.utcnow()
    ctx.db.commit()
    return {"message": "Cliente eliminado exitosamente"}


# ---------------------------------------------------------------------------
# Products Endpoint
# ---------------------------------------------------------------------------


@router.get("/products", response_model=List[ProductSchema])
async def list_products(ctx: TenantContext = Depends(require_tenant)):
    products = (
        ctx.db.query(Product)
        .filter(
            Product.tenant_id == ctx.tenant_id,
            Product.organization_id == ctx.org_id,
            Product.deleted_at.is_(None),
        )
        .order_by(Product.name.asc())
        .all()
    )
    return [p.to_dict() for p in products]


@router.post("/products", response_model=ProductSchema)
async def create_product(payload: ProductCreate, ctx: TenantContext = Depends(require_tenant)):
    product = Product(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        name=payload.name,
        internal_code=payload.internal_code,
        description=payload.description,
        price=payload.price,
        tax_rate=payload.tax_rate,
        is_active=True,
    )
    ctx.db.add(product)
    ctx.db.commit()
    ctx.db.refresh(product)
    return product.to_dict()


@router.put("/products/{product_id}", response_model=ProductSchema)
async def update_product(
    product_id: str,
    payload: ProductUpdate,
    ctx: TenantContext = Depends(require_tenant),
):
    product = (
        ctx.db.query(Product)
        .filter(
            Product.id == UUID(product_id),
            Product.tenant_id == ctx.tenant_id,
            Product.organization_id == ctx.org_id,
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if payload.name is not None:
        product.name = payload.name
    if payload.internal_code is not None:
        product.internal_code = payload.internal_code
    if payload.description is not None:
        product.description = payload.description
    if payload.price is not None:
        product.price = payload.price
    if payload.tax_rate is not None:
        product.tax_rate = payload.tax_rate
    if payload.is_active is not None:
        product.is_active = payload.is_active

    product.updated_at = datetime.utcnow()
    ctx.db.commit()
    ctx.db.refresh(product)
    return product.to_dict()


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, ctx: TenantContext = Depends(require_tenant)):
    product = (
        ctx.db.query(Product)
        .filter(
            Product.id == UUID(product_id),
            Product.tenant_id == ctx.tenant_id,
            Product.organization_id == ctx.org_id,
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    product.deleted_at = datetime.utcnow()
    ctx.db.commit()
    return {"message": "Producto eliminado exitosamente"}


# ---------------------------------------------------------------------------
# Sequences Endpoint
# ---------------------------------------------------------------------------


@router.get("/sequences", response_model=List[EcfSequenceSchema])
async def list_sequences(ctx: TenantContext = Depends(require_tenant)):
    sequences = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
        )
        .order_by(EcfSequence.ecf_type.asc())
        .all()
    )
    return [s.to_dict() for s in sequences]


@router.post("/sequences", response_model=EcfSequenceSchema)
async def create_sequence(payload: EcfSequenceCreate, ctx: TenantContext = Depends(require_tenant)):
    is_electronic = payload.ecf_type in (31, 32, 34, 43, 44, 45)
    if is_electronic and not ctx.organization.is_ecf_authorized:
        raise HTTPException(
            status_code=400,
            detail=(
                "Tu empresa no está verificada como emisor electrónico ante la "
                "DGII. Solo puedes registrar secuencias de comprobantes físicos."
            ),
        )

    # Deactivate existing active sequences of same type
    ctx.db.query(EcfSequence).filter(
        EcfSequence.tenant_id == ctx.tenant_id,
        EcfSequence.organization_id == ctx.org_id,
        EcfSequence.ecf_type == payload.ecf_type,
    ).update({"is_active": False})

    sequence = EcfSequence(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        ecf_type=payload.ecf_type,
        prefix=payload.prefix,
        start_number=payload.start_number,
        end_number=payload.end_number,
        current_number=payload.current_number,
        expiry_date=payload.expiry_date,
        is_active=True,
    )
    ctx.db.add(sequence)
    ctx.db.commit()
    ctx.db.refresh(sequence)
    return sequence.to_dict()


@router.put("/sequences/{sequence_id}", response_model=EcfSequenceSchema)
async def update_sequence(
    sequence_id: str,
    payload: EcfSequenceUpdate,
    ctx: TenantContext = Depends(require_tenant),
):
    sequence = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.id == UUID(sequence_id),
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
        )
        .first()
    )
    if not sequence:
        raise HTTPException(status_code=404, detail="Secuencia no encontrada")

    if payload.prefix is not None:
        sequence.prefix = payload.prefix
    if payload.start_number is not None:
        sequence.start_number = payload.start_number
    if payload.end_number is not None:
        sequence.end_number = payload.end_number
    if payload.current_number is not None:
        sequence.current_number = payload.current_number
    if payload.expiry_date is not None:
        sequence.expiry_date = payload.expiry_date
    if payload.is_active is not None:
        sequence.is_active = payload.is_active

    # Cross-field validation on final state
    if sequence.start_number > sequence.end_number:
        raise HTTPException(
            status_code=400,
            detail="El número inicial del rango no puede ser mayor que el número final.",
        )
    if sequence.current_number < sequence.start_number - 1:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El número actual ({sequence.current_number}) debe ser mayor "
                f"o igual al número inicial - 1 ({sequence.start_number - 1})."
            ),
        )
    if sequence.current_number > sequence.end_number:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El número actual ({sequence.current_number}) no puede exceder "
                f"el número final del rango ({sequence.end_number})."
            ),
        )

    is_electronic = sequence.ecf_type in (31, 32, 34, 43, 44, 45)
    if is_electronic and sequence.prefix != "E":
        raise HTTPException(
            status_code=400,
            detail=f"Para comprobantes electrónicos (tipo {sequence.ecf_type}), el prefijo debe ser 'E'.",
        )
    elif not is_electronic and sequence.prefix != "B":
        raise HTTPException(
            status_code=400,
            detail=f"Para comprobantes tradicionales/físicos (tipo {sequence.ecf_type}), el prefijo debe ser 'B'.",
        )

    sequence.updated_at = datetime.utcnow()
    ctx.db.commit()
    ctx.db.refresh(sequence)
    return sequence.to_dict()


@router.delete("/sequences/{sequence_id}")
async def delete_sequence(sequence_id: str, ctx: TenantContext = Depends(require_tenant)):
    sequence = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.id == UUID(sequence_id),
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
        )
        .first()
    )
    if not sequence:
        raise HTTPException(status_code=404, detail="Secuencia no encontrada")

    ctx.db.delete(sequence)
    ctx.db.commit()
    return {"message": "Secuencia eliminada exitosamente"}


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Sequence CRUD
# ---------------------------------------------------------------------------


class SequenceCreate(BaseModel):
    ecf_type: int = Field(..., ge=1, le=47)
    prefix: str = Field(..., min_length=1, max_length=2)
    start_number: int = Field(..., ge=1)
    end_number: int = Field(..., ge=1)
    current_number: int = Field(..., ge=0)
    expiry_date: Optional[str] = None

    @field_validator("end_number")
    @classmethod
    def end_must_be_gte_start(cls, v, info):
        start = info.data.get("start_number")
        if start is not None and v < start:
            raise ValueError("end_number must be >= start_number")
        return v

    @field_validator("current_number")
    @classmethod
    def current_must_be_in_range(cls, v, info):
        start = info.data.get("start_number")
        end = info.data.get("end_number")
        if start is not None and v < start - 1:
            raise ValueError(f"current_number must be >= {start - 1}")
        if end is not None and v > end:
            raise ValueError(f"current_number must be <= {end}")
        return v


class SequenceUpdate(BaseModel):
    ecf_type: Optional[int] = Field(None, ge=1, le=47)
    prefix: Optional[str] = Field(None, min_length=1, max_length=2)
    start_number: Optional[int] = Field(None, ge=1)
    end_number: Optional[int] = Field(None, ge=1)
    current_number: Optional[int] = Field(None, ge=0)
    expiry_date: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/sequences", response_model=List[dict])
async def list_sequences(ctx: TenantContext = Depends(require_tenant)):
    sequences = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
        )
        .order_by(EcfSequence.ecf_type, EcfSequence.created_at.desc())
        .all()
    )
    return [s.to_dict() for s in sequences]


@router.post("/sequences", response_model=dict, status_code=201)
async def create_sequence(data: SequenceCreate, ctx: TenantContext = Depends(require_tenant)):
    # Deactivate other active sequences of same type
    ctx.db.query(EcfSequence).filter(
        EcfSequence.tenant_id == ctx.tenant_id,
        EcfSequence.organization_id == ctx.org_id,
        EcfSequence.ecf_type == data.ecf_type,
        EcfSequence.is_active.is_(True),
    ).update({"is_active": False})

    seq = EcfSequence(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        ecf_type=data.ecf_type,
        prefix=data.prefix.upper(),
        start_number=data.start_number,
        end_number=data.end_number,
        current_number=data.current_number,
        expiry_date=date.fromisoformat(data.expiry_date) if data.expiry_date else None,
        is_active=True,
    )
    ctx.db.add(seq)
    ctx.db.commit()
    ctx.db.refresh(seq)
    return seq.to_dict()


@router.put("/sequences/{sequence_id}", response_model=dict)
async def update_sequence(sequence_id: str, data: SequenceUpdate, ctx: TenantContext = Depends(require_tenant)):
    seq = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.id == sequence_id,
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
        )
        .first()
    )
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")

    update_data = data.model_dump(exclude_unset=True)
    if "expiry_date" in update_data and update_data["expiry_date"] is not None:
        update_data["expiry_date"] = date.fromisoformat(update_data["expiry_date"])
    elif "expiry_date" in update_data and update_data["expiry_date"] is None:
        update_data["expiry_date"] = None

    for key, value in update_data.items():
        setattr(seq, key, value)

    ctx.db.commit()
    ctx.db.refresh(seq)
    return seq.to_dict()


@router.delete("/sequences/{sequence_id}")
async def delete_sequence(sequence_id: str, ctx: TenantContext = Depends(require_tenant)):
    seq = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.id == sequence_id,
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
        )
        .first()
    )
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")

    ctx.db.delete(seq)
    ctx.db.commit()
    return {"status": "deleted"}


class SequenceAlert(BaseModel):
    sequence_id: str
    ecf_type: int
    prefix: str
    start_number: int
    end_number: int
    current_number: int
    expiry_date: Optional[str] = None
    consumed_pct: float
    remaining: int
    alerts: list[str]  # "critical", "expiring", "exhausted", "expired"


@router.get("/sequences/alerts", response_model=List[SequenceAlert])
async def list_sequence_alerts(ctx: TenantContext = Depends(require_tenant)):
    sequences = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
            EcfSequence.is_active.is_(True),
        )
        .all()
    )
    today = date.today()
    alerts = []
    for s in sequences:
        total = s.end_number - s.start_number + 1
        consumed = max(0, s.current_number - s.start_number + 1)
        pct = round((consumed / total) * 100, 1)
        remaining = total - consumed
        seq_alerts: list[str] = []

        is_expired = s.expiry_date is not None and s.expiry_date < today
        if is_expired:
            seq_alerts.append("expired")
        elif s.expiry_date and (s.expiry_date - today).days <= 30:
            seq_alerts.append("expiring")

        if s.current_number >= s.end_number:
            seq_alerts.append("exhausted")
        elif remaining < total * 0.1:
            seq_alerts.append("critical")

        if seq_alerts:
            alerts.append(
                SequenceAlert(
                    sequence_id=str(s.id),
                    ecf_type=s.ecf_type,
                    prefix=s.prefix,
                    start_number=s.start_number,
                    end_number=s.end_number,
                    current_number=s.current_number,
                    expiry_date=s.expiry_date.isoformat() if s.expiry_date else None,
                    consumed_pct=pct,
                    remaining=remaining,
                    alerts=seq_alerts,
                )
            )
    return alerts


# ---------------------------------------------------------------------------
# Invoice Types / Available Emission Options
# ---------------------------------------------------------------------------


class InvoiceTypeInfo(BaseModel):
    code: str
    ecf_type: int
    label: str
    description: str
    is_available: bool
    has_active_sequence: bool
    sequence_id: Optional[str] = None
    sequence_current: Optional[int] = None
    sequence_end: Optional[int] = None
    requires_certification: bool
    supports_quick_mode: bool
    is_minor_expense: bool


# Types that support quick (POS) mode — direct sales to consumers/businesses
QUICK_MODE_ECF_TYPES: set[int] = {1, 2, 31, 32, 43}
# Types classified as minor expense documents
MINOR_EXPENSE_ECF_TYPES: set[int] = {13, 43}


@router.get("/invoice-types", response_model=List[InvoiceTypeInfo])
async def list_invoice_types(ctx: TenantContext = Depends(require_tenant)):
    """Return available invoice types from reference data with availability for this org."""
    ncf_types = get_cached_domain(ctx.db, "ncf_types")

    sequences = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
            EcfSequence.is_active.is_(True),
        )
        .all()
    )
    active_by_type: dict[int, EcfSequence] = {s.ecf_type: s for s in sequences}
    is_authorized = ctx.organization.is_ecf_authorized or False

    result = []
    for entry in ncf_types:
        meta = entry.get("metadata") or {}
        ecf_type = int(meta.get("tipo_code", 0))
        code = entry["code"]
        if ecf_type == 0:
            continue

        is_electronic = code.startswith("E")
        requires_certification = is_electronic

        if is_electronic:
            seq = active_by_type.get(ecf_type)
            has_valid_sequence = seq is not None and seq.current_number < seq.end_number

            if IS_DEVELOPMENT and not has_valid_sequence and ecf_type in (31, 32):
                has_valid_sequence = True
        else:
            seq = None
            has_valid_sequence = True

        is_available = (not requires_certification or is_authorized) and has_valid_sequence

        result.append(
            InvoiceTypeInfo(
                code=code,
                ecf_type=ecf_type,
                label=entry["label_es"],
                description=entry.get("description") or "",
                is_available=is_available,
                has_active_sequence=seq is not None,
                sequence_id=str(seq.id) if seq else None,
                sequence_current=seq.current_number if seq else None,
                sequence_end=seq.end_number if seq else None,
                requires_certification=requires_certification and not is_authorized,
                supports_quick_mode=ecf_type in QUICK_MODE_ECF_TYPES,
                is_minor_expense=ecf_type in MINOR_EXPENSE_ECF_TYPES,
            )
        )

    return result


class CertificationRegister(BaseModel):
    rnc: str
    business_name: str
    trade_name: Optional[str] = None
    economic_activity: str
    branch_office_address: Optional[str] = None


@router.get("/certification/status")
async def get_certification_status(ctx: TenantContext = Depends(require_tenant)):
    """Get current certification status and the step where user should resume."""
    return {
        "is_ecf_authorized": ctx.organization.is_ecf_authorized,
        "certification_status": ctx.organization.certification_status,
        "certification_step": ctx.organization.certification_step or "0",
        "is_certification_completed": ctx.organization.is_certification_completed,
        "alanube_company_id": ctx.organization.alanube_company_id,
        "alanube_environment": ctx.organization.alanube_environment,
        "certificate_uploaded_at": ctx.organization.certificate_uploaded_at.isoformat()
        if ctx.organization.certificate_uploaded_at
        else None,
        "tax_id": ctx.organization.tax_id,
        "name": ctx.organization.name,
        "economic_activity": ctx.organization.economic_activity,
        "fiscal_address": ctx.organization.fiscal_address,
    }


@router.get("/verification-status")
async def get_verification_status(ctx: TenantContext = Depends(require_tenant)):
    return {
        "is_ecf_authorized": ctx.organization.is_ecf_authorized,
        "certification_status": ctx.organization.certification_status,
        "alanube_company_id": ctx.organization.alanube_company_id,
        "alanube_environment": ctx.organization.alanube_environment,
        "certificate_uploaded_at": ctx.organization.certificate_uploaded_at.isoformat()
        if ctx.organization.certificate_uploaded_at
        else None,
        "tax_id": ctx.organization.tax_id,
        "name": ctx.organization.name,
        "economic_activity": ctx.organization.economic_activity,
        "fiscal_address": ctx.organization.fiscal_address,
    }


@router.post("/certification/register")
async def register_company(
    request: Request,
    rnc: str = Form(...),
    business_name: str = Form(...),
    trade_name: Optional[str] = Form(None),
    economic_activity: str = Form(...),
    branch_office_address: str = Form(...),
    province: str = Form(...),
    municipality: str = Form(...),
    certificate: UploadFile = File(...),
    certificate_password: str = Form(...),
    ctx: TenantContext = Depends(require_tenant),
):
    import base64
    from app.config import SECRET_KEY
    from app.utils.dates import utc_now

    clean_rnc = re.sub(r"[^0-9]", "", rnc)
    if len(clean_rnc) not in (9, 11):
        raise HTTPException(status_code=400, detail="El RNC/Cédula debe tener 9 u 11 dígitos.")

    # Verify that the submitted RNC matches the organization's registered RNC
    org_rnc = re.sub(r"[^0-9]", "", ctx.organization.tax_id or "")
    if org_rnc and clean_rnc != org_rnc:
        raise HTTPException(
            status_code=400,
            detail="El RNC/Cédula enviado no coincide con el RNC registrado de la organización.",
        )

    filename = certificate.filename or ""
    if not (filename.endswith(".p12") or filename.endswith(".pfx")):
        raise HTTPException(
            status_code=400,
            detail="El certificado debe ser un archivo con extensión .p12 o .pfx",
        )

    registered_company_ulid = None
    try:
        cert_bytes = await certificate.read()
        cert_b64 = base64.b64encode(cert_bytes).decode("utf-8")

        base_url = str(request.base_url).rstrip("/")

        # If running locally or in Docker (private DNS), use a public dummy domain for the webhook
        # so that Alanube's DNS validation does not fail with getaddrinfo ENOTFOUND.
        # If the user wants to test webhooks locally, they can configure a public
        # tunnel URL (like ngrok) in PUBLIC_APP_URL.
        from urllib.parse import urlparse
        from app.config import PUBLIC_APP_URL

        parsed_url = urlparse(base_url)
        hostname = parsed_url.hostname or ""

        # Check if the hostname is a private/local host.
        is_private_host = True
        if hostname and "." in hostname and not hostname.endswith(".local"):
            parts = hostname.split(".")
            if len(parts) == 4 and all(p.isdigit() for p in parts):
                if parts[0] == "127":
                    is_private_host = True
                elif parts[0] == "10":
                    is_private_host = True
                elif parts[0] == "172" and (16 <= int(parts[1]) <= 31):
                    is_private_host = True
                elif parts[0] == "192" and parts[1] == "168":
                    is_private_host = True
                else:
                    is_private_host = False
            else:
                is_private_host = False

        if is_private_host:
            parsed_public = urlparse(PUBLIC_APP_URL)
            public_hostname = parsed_public.hostname or ""
            is_public_local = True
            if public_hostname and "." in public_hostname and not public_hostname.endswith(".local"):
                parts = public_hostname.split(".")
                if len(parts) == 4 and all(p.isdigit() for p in parts):
                    if (
                        parts[0] in ("127", "10")
                        or (parts[0] == "172" and 16 <= int(parts[1]) <= 31)
                        or (parts[0] == "192" and parts[1] == "168")
                    ):
                        is_public_local = True
                    else:
                        is_public_local = False
                else:
                    is_public_local = False

            if not is_public_local:
                base_url = PUBLIC_APP_URL.rstrip("/")
            else:
                base_url = "https://httpbin.org/anything"

        webhook_url = f"{base_url}/api/billing/alanube/webhook"

        alanube_payload = {
            "name": business_name,
            "tradeName": trade_name or business_name,
            "identification": clean_rnc,
            "address": branch_office_address,
            "province": province,
            "municipality": municipality,
            "type": "associated",
            "certificate": {
                "name": filename or "certificate.p12",
                "extension": "p12" if filename.endswith(".p12") else "pfx",
                "content": cert_b64,
                "password": certificate_password,
            },
            "webhooks": {
                "documents": {
                    "emissionFinished": {
                        "status": "active",
                        "url": webhook_url,
                        "headers": {"x-api-key": SECRET_KEY},
                    }
                },
                "general": {
                    "governmentStatusChanged": {
                        "status": "active",
                        "url": f"{webhook_url}/status",
                        "headers": {"x-api-key": SECRET_KEY},
                    }
                },
            },
        }

        alanube_service = AlanubeService()
        existing_company_id = ctx.organization.alanube_company_id

        if existing_company_id:
            logger.info(
                f"Company already registered in Alanube ({existing_company_id}), patching data + certificate..."
            )
            patch_payload = {
                "name": business_name,
                "tradeName": trade_name or business_name,
                "address": branch_office_address,
                "province": province,
                "municipality": municipality,
                "certificate": alanube_payload["certificate"],
            }
            res = await alanube_service.patch_company(existing_company_id, patch_payload)
            registered_company_ulid = existing_company_id
        else:
            res = await alanube_service.create_company(alanube_payload)
            company_ulid = res.get("company", {}).get("id") or res.get("id") or clean_rnc
            registered_company_ulid = company_ulid

        # Sign dummy XML to verify certificate/signature validity
        now_str = datetime.utcnow().strftime("%d-%m-%Y")
        dummy_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<eCF xmlns="http://dgii.gov.do/eCF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ECF>
    <Encabezado>
      <IdDoc>
        <TipoeCF>31</TipoeCF>
        <eNCF>E310000000001</eNCF>
        <FechaEmision>{now_str}</FechaEmision>
      </IdDoc>
      <Emisor>
        <RNC>{clean_rnc}</RNC>
        <RazonSocial>{business_name}</RazonSocial>
      </Emisor>
      <Comprador>
        <RNC>132109122</RNC>
        <RazonSocial>Consumidor Final Prueba</RazonSocial>
      </Comprador>
    </Encabezado>
  </ECF>
</eCF>"""

        try:
            await alanube_service.sign_document(dummy_xml.encode("utf-8"), company_id=clean_rnc)
        except Exception as sign_err:
            logger.warning(
                f"Dummy signature test failed (normal in development/sandbox with self-signed certs): {sign_err}"
            )
            from app.config import ENVIRONMENT

            if ENVIRONMENT in ("PRODUCTION", "STAGING"):
                raise sign_err

        ctx.organization.tax_id = clean_rnc
        ctx.organization.name = business_name
        ctx.organization.economic_activity = economic_activity
        ctx.organization.fiscal_address = branch_office_address
        ctx.organization.municipality = municipality
        ctx.organization.province = province
        ctx.organization.certification_status = "certificate_uploaded"
        ctx.organization.alanube_company_id = registered_company_ulid  # Lock the company ID here
        ctx.organization.alanube_environment = "TesteCF"
        ctx.organization.certificate_uploaded_at = utc_now()
        ctx.organization.certification_step = "2"  # Step 2: Certificate uploaded
        ctx.organization.is_certification_completed = False
        ctx.db.commit()

        return {
            "message": "Empresa y certificado registrados exitosamente en Alanube.",
            "status": "certificate_uploaded",
            "alanube_response": res,
        }
    except Exception as e:
        logger.exception("Error registering company and certificate with Alanube")

        # Rollback local DB transaction
        try:
            ctx.db.rollback()
        except Exception as db_err:
            logger.warning(f"Failed to rollback DB session: {db_err}")

        # Map error to user-friendly message
        err_msg = str(e)
        error_code, user_message = map_alanube_error_to_user_message(err_msg)

        logger.warning(f"User-facing error code: {error_code}, Message: {user_message}")

        raise HTTPException(status_code=400, detail=user_message)


@router.post("/certification/start-set-test")
async def start_set_test(ctx: TenantContext = Depends(require_tenant)):
    if ctx.organization.certification_status not in (
        "certificate_uploaded",
        "set_test_running",
        "set_test_rejected",
    ):
        raise HTTPException(
            status_code=400,
            detail="Debe registrar la empresa y subir un certificado digital válido antes de iniciar las pruebas.",
        )

    rnc = ctx.organization.alanube_company_id or ctx.organization.tax_id or "132109122"
    set_test_payload = {
        "idCompany": rnc,
        "itemExample": {
            "billingIndicator": 1,
            "itemName": "Servicio de Integracion",
            "goodServiceIndicator": 2,
            "itemDescription": "Servicio de integracion de facturacion electronica",
            "unitPriceItem": 1000,
        },
    }

    alanube_service = AlanubeService()
    try:
        res = await alanube_service.create_set_test(set_test_payload)
        set_test_id = res.get("id") or res.get("trackId") or "DUMMY_SET_TEST_ID"

        settings_dict = {}
        if ctx.organization.settings_json:
            try:
                settings_dict = json.loads(ctx.organization.settings_json)
            except Exception:
                pass
        settings_dict["alanube_set_test_id"] = set_test_id
        ctx.organization.settings_json = json.dumps(settings_dict)

        ctx.organization.certification_status = "set_test_running"
        ctx.organization.certification_step = "3"  # Step 3: Test running
        ctx.db.commit()

        return {
            "message": "Pruebas de certificación iniciadas exitosamente.",
            "status": "set_test_running",
            "track_id": set_test_id,
        }
    except Exception as e:
        logger.exception("Error starting set test with Alanube")
        err_msg = str(e)
        error_code, user_message = map_alanube_error_to_user_message(err_msg)

        logger.warning(f"User-facing error code: {error_code}, Message: {user_message}")

        raise HTTPException(status_code=400, detail=user_message)


@router.get("/certification/set-test-status")
async def get_set_test_status(ctx: TenantContext = Depends(require_tenant)):
    settings_dict = {}
    if ctx.organization.settings_json:
        try:
            settings_dict = json.loads(ctx.organization.settings_json)
        except Exception:
            pass

    set_test_id = settings_dict.get("alanube_set_test_id")
    if not set_test_id:
        raise HTTPException(
            status_code=400,
            detail="No se encontró ningún set de pruebas activo para esta organización.",
        )

    alanube_service = AlanubeService()
    try:
        res = await alanube_service.check_set_test_status(set_test_id)
        status_raw = res.get("status", "").lower()

        if status_raw in ("approved", "completed", "success"):
            ctx.organization.certification_status = "certified"
            ctx.organization.is_ecf_authorized = True
            ctx.organization.certification_step = "4"  # Step 4: Completed
            ctx.organization.is_certification_completed = True
            ctx.db.commit()
            return {"status": "COMPLETED", "result": "APPROVED", "details": res}
        elif status_raw in ("rejected", "failed"):
            from app.config import ENVIRONMENT

            if ENVIRONMENT == "DEVELOPMENT":
                logger.warning(
                    "Bypassing DGII set test failure/rejection in DEVELOPMENT mode "
                    "to allow testing with self-signed certificate."
                )
                ctx.organization.certification_status = "certified"
                ctx.organization.is_ecf_authorized = True
                ctx.organization.certification_step = "4"  # Step 4: Completed
                ctx.organization.is_certification_completed = True
                ctx.db.commit()
                return {"status": "COMPLETED", "result": "APPROVED", "details": res}

            ctx.organization.certification_status = "set_test_rejected"
            ctx.organization.certification_step = "3"  # Stay in step 3 for retry
            ctx.db.commit()
            return {"status": "FAILED", "result": "REJECTED", "details": res}
        else:
            return {"status": "PROCESSING", "details": res}
    except Exception as e:
        logger.exception("Error checking set test status with Alanube")
        err_msg = str(e)
        error_code, user_message = map_alanube_error_to_user_message(err_msg)

        logger.warning(f"User-facing error code: {error_code}, Message: {user_message}")

        raise HTTPException(status_code=400, detail=user_message)


@router.post("/certification/reset")
async def reset_certification(ctx: TenantContext = Depends(require_tenant)):
    # NOTE: Alanube has no DELETE endpoint — once a company is registered, it
    # stays in Alanube permanently. We keep alanube_company_id so any subsequent
    # registration attempt will PATCH (update) the existing company, never POST
    # (create a duplicate).
    ctx.organization.alanube_environment = None
    ctx.organization.certification_status = "none"
    ctx.organization.is_ecf_authorized = False
    ctx.organization.certificate_uploaded_at = None
    ctx.organization.certification_step = "0"
    ctx.organization.is_certification_completed = False
    ctx.db.commit()

    return {
        "message": "Proceso de certificación reiniciado exitosamente.",
        "status": "none",
    }


@router.post("/alanube/webhook")
async def alanube_webhook(request: Request, x_api_key: Optional[str] = Header(None, alias="x-api-key")):
    if not x_api_key or x_api_key != SECRET_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    payload = await request.json()
    logger.info(
        f"Webhook from Alanube: type={payload.get('type')} "
        f"status={payload.get('status')} legalStatus={payload.get('legalStatus')}"
    )

    # Only handle emissionFinished events
    event_type = payload.get("type")
    status = payload.get("status")
    if event_type and status != "FINISHED":
        logger.debug(f"Ignoring webhook — status={status}")
        return {"status": "ok"}

    encf = payload.get("documentNumber") or payload.get("encf")
    company_rnc = payload.get("companyIdentification")
    alanube_doc_id = payload.get("id")

    if not company_rnc or not encf:
        logger.warning(f"Webhook missing companyIdentification or documentNumber: {json.dumps(payload)}")
        return {"status": "ok"}

    clean_rnc = re.sub(r"[^0-9]", "", company_rnc)
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.tax_id == clean_rnc).first()
        if not org:
            logger.error(f"Webhook: no organization found for RNC {clean_rnc}")
            return {"status": "ok"}

        invoice = (
            db.query(Invoice)
            .filter(
                Invoice.organization_id == org.id,
                Invoice.invoice_number == encf,
                Invoice.is_deleted.is_(False),
            )
            .first()
        )
        if not invoice:
            logger.warning(f"Webhook: no invoice found for org {org.id} NCF {encf}")
            return {"status": "ok"}

        legal_status = payload.get("legalStatus")
        raw_data = {}
        if invoice.raw_extracted_data:
            try:
                raw_data = json.loads(invoice.raw_extracted_data)
            except json.JSONDecodeError:
                pass

        raw_data.update(
            {
                "alanube_document_id": alanube_doc_id,
                "alanube_status": status,
                "legal_status": legal_status,
                "pdf_url": payload.get("pdf"),
                "xml_url": payload.get("xml"),
                "signature_date": payload.get("signatureDate"),
                "security_code": payload.get("securityCode"),
                "document_stamp_url": payload.get("documentStampUrl"),
                "sequence_consumed": payload.get("sequenceConsumed", False),
            }
        )

        error_info = payload.get("error")
        if error_info:
            raw_data["alanube_error"] = error_info

        if legal_status in ("ACCEPTED", "ACCEPTED_WITH_OBSERVATIONS"):
            if invoice.status in ("draft", "pending"):
                invoice.status = "verified"
                invoice.processed = True

                xml_url = raw_data.get("xml_url")
                if xml_url:
                    try:
                        async with httpx.AsyncClient(timeout=15.0) as client:
                            resp = await client.get(xml_url)
                            resp.raise_for_status()
                            invoice.original_xml_data = resp.text

                        storage_path = build_storage_path(
                            tenant_id=UUID(str(invoice.tenant_id)),
                            org_id=UUID(str(invoice.organization_id)),
                            invoice_id=invoice.id,
                            variant="ecf",
                            extension="xml",
                        )
                        upload_file(
                            resp.text.encode("utf-8"),
                            storage_path,
                            content_type="application/xml",
                        )
                        invoice.file_path = storage_path
                    except Exception:
                        logger.warning("Webhook: could not download signed XML from %s", xml_url)

                logger.info(f"Webhook: invoice {invoice.id} verified (NCF {encf})")
            else:
                logger.info(f"Webhook: invoice {invoice.id} already {invoice.status}, updating metadata only")
        elif legal_status in ("REJECTED", "FAILED"):
            invoice.status = "voided"
            logger.warning(f"Webhook: invoice {invoice.id} voided (NCF {encf}) — {json.dumps(error_info or {})}")

        invoice.raw_extracted_data = json.dumps(raw_data, ensure_ascii=False)
        invoice.updated_at = datetime.utcnow()
        db.commit()
        logger.info(f"Webhook processed: invoice {invoice.id} → {invoice.status}")
    except Exception:
        db.rollback()
        logger.exception("Error processing Alanube webhook")
    finally:
        db.close()

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Issued Invoices CRUD & Transmission
# ---------------------------------------------------------------------------


@router.get("/invoices")
async def list_issued_invoices(ctx: TenantContext = Depends(require_tenant)):
    invoices = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == "income",
            Invoice.source_type == "billing",
            Invoice.is_deleted.is_(False),
        )
        .order_by(Invoice.created_at.desc())
        .all()
    )
    return [inv.to_dict() for inv in invoices]


@router.get("/invoices/{invoice_id}")
async def get_issued_invoice(invoice_id: str, ctx: TenantContext = Depends(require_tenant)):
    invoice = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.id == UUID(invoice_id),
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == "income",
            Invoice.source_type == "billing",
            Invoice.is_deleted.is_(False),
        )
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return invoice.to_dict()


@router.post("/invoices")
async def create_invoice_draft(payload: InvoiceCreate, ctx: TenantContext = Depends(require_tenant)):
    # Fetch client details if provided
    client_tax_id = None
    if payload.client_id:
        client = (
            ctx.db.query(Client)
            .filter(
                Client.id == UUID(payload.client_id),
                Client.tenant_id == ctx.tenant_id,
                Client.organization_id == ctx.org_id,
            )
            .first()
        )
        if not client:
            raise HTTPException(status_code=422, detail="Cliente no encontrado")
        client_tax_id = client.tax_id

    # Compute calculations based on product details
    line_items = []
    subtotal = 0.0
    discount_total = 0.0
    itbis_total = 0.0

    for idx, item in enumerate(payload.items):
        product = (
            ctx.db.query(Product)
            .filter(
                Product.id == UUID(item.product_id),
                Product.tenant_id == ctx.tenant_id,
                Product.organization_id == ctx.org_id,
            )
            .first()
        )
        if not product:
            raise HTTPException(status_code=422, detail=f"Producto {item.product_id} no encontrado")

        gross = item.quantity * item.unit_price
        discount = gross * (item.discount_rate / 100.0)
        net = gross - discount
        tax_amt = net * (product.tax_rate / 100.0)

        subtotal += net
        discount_total += discount
        itbis_total += tax_amt

        line_items.append(
            {
                "line": idx + 1,
                "product_id": str(product.id),
                "name": product.name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "discount_rate": item.discount_rate,
                "tax_rate": product.tax_rate,
                "total": net + tax_amt,
            }
        )

    total_amount = subtotal + itbis_total

    # Serialize raw data metadata
    raw_data = {
        "client_id": payload.client_id,
        "ecf_type": payload.ecf_type,
        "payment_type": payload.payment_type,
        "payment_method": payload.payment_method,
        "notes": payload.notes,
        "reference_ecf": payload.reference_ecf,
        "reference_date": payload.reference_date.isoformat() if payload.reference_date else None,
        "items": [item.dict() for item in payload.items],
    }

    payment_cond = "credito" if payload.payment_type == 2 else "contado"
    invoice_due_date = None
    if payment_cond == "credito":
        invoice_due_date = datetime.utcnow() + timedelta(days=30)

    invoice = Invoice(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        filename="Factura Emitida",
        file_type="xml",  # e-CF invoices represent XML files
        vendor_name=ctx.organization.name,  # Issuer is our organization
        vendor_tax_id=ctx.organization.tax_id,
        rnc_comprador=client_tax_id,
        invoice_date=datetime.utcnow(),
        total_amount=total_amount,
        tax_amount=itbis_total,
        currency="DOP",
        transaction_type="income",
        source_type="billing",
        processed=False,
        status="draft",
        line_items_data=json.dumps(line_items, ensure_ascii=False),
        raw_extracted_data=json.dumps(raw_data, ensure_ascii=False),
        payment_condition=payment_cond,
        due_date=invoice_due_date,
    )

    ctx.db.add(invoice)
    ctx.db.commit()
    ctx.db.refresh(invoice)

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
    return invoice.to_dict()


@router.post("/invoices/{invoice_id}/transmit")
async def transmit_invoice(invoice_id: str, ctx: TenantContext = Depends(require_tenant)):
    invoice = (
        ctx.db.query(Invoice)
        .filter(
            Invoice.id == UUID(invoice_id),
            Invoice.tenant_id == ctx.tenant_id,
            Invoice.organization_id == ctx.org_id,
            Invoice.transaction_type == "income",
            Invoice.source_type == "billing",
        )
        .first()
    )

    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if invoice.processed:
        raise HTTPException(status_code=400, detail="La factura ya ha sido transmitida")

    # Deserialize operational metadata
    raw_data = {}
    if invoice.raw_extracted_data:
        try:
            raw_data = json.loads(invoice.raw_extracted_data)
        except Exception:
            pass

    ecf_type = raw_data.get("ecf_type") or 32  # Default to Consumer e-CF 32 if unspecified

    # Resolve sequence range and increment
    sequence = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
            EcfSequence.ecf_type == ecf_type,
            EcfSequence.is_active.is_(True),
        )
        .first()
    )

    if not sequence:
        raise HTTPException(
            status_code=400,
            detail=f"No hay una secuencia e-CF activa cargada para el tipo {ecf_type}.",
        )

    if sequence.current_number >= sequence.end_number:
        raise HTTPException(
            status_code=400,
            detail=f"Rango de secuencia e-CF agotado para el tipo {ecf_type}.",
        )

    # Increment sequence number
    sequence.current_number += 1

    is_electronic = sequence.prefix == "E"
    if is_electronic:
        if not ctx.organization.is_ecf_authorized:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Tu empresa no está verificada como emisor electrónico ante "
                    "la DGII. Debes completar la verificación en los Ajustes."
                ),
            )
        encf = f"{sequence.prefix}{ecf_type:02d}{sequence.current_number:010d}"
    else:
        encf = f"{sequence.prefix}{ecf_type:02d}{sequence.current_number:08d}"

    due_date_str = sequence.expiry_date.isoformat() if sequence.expiry_date else "2028-12-31"

    # Fetch client details
    buyer_name = "Consumidor Final"
    buyer_rnc = "132109122"  # Fallback to test RNC if final consumer
    if raw_data.get("client_id"):
        client = (
            ctx.db.query(Client)
            .filter(
                Client.id == UUID(raw_data["client_id"]),
                Client.tenant_id == ctx.tenant_id,
                Client.organization_id == ctx.org_id,
            )
            .first()
        )
        if client:
            buyer_name = client.name
            buyer_rnc = client.tax_id or "132109122"

    # Clean sender RNC
    sender_rnc = re.sub(r"[^0-9]", "", ctx.organization.tax_id or "") or "132109122"
    sender_name = ctx.organization.name or "Fintral Test Issuer"

    # Parse line items from line_items_data
    items_list = []
    if invoice.line_items_data:
        try:
            items_list = json.loads(invoice.line_items_data)
        except Exception:
            pass

    # Build detailed itemDetails payload for Alanube API
    item_details = []
    subtotal = 0.0
    itbis_total = 0.0

    for idx, item in enumerate(items_list):
        qty = item.get("quantity") or 1.0
        price = item.get("unit_price") or 0.0
        disc_rate = item.get("discount_rate") or 0.0
        tax_rate = item.get("tax_rate") or 18.0

        gross = qty * price
        disc_amt = gross * (disc_rate / 100.0)
        net = gross - disc_amt
        tax_amt = net * (tax_rate / 100.0)

        subtotal += net
        itbis_total += tax_amt

        item_details.append(
            {
                "line": idx + 1,
                "name": item.get("name") or "Item",
                "quantity": qty,
                "price": price,
                "discount": disc_amt,
                "itbis": tax_amt,
            }
        )

    total = subtotal + itbis_total

    # Build the structural JSON payload for Alanube
    alanube_payload = {
        "idDoc": {
            "encf": encf,
            "sequenceDueDate": due_date_str,
            "incomeType": 1,
            "paymentType": raw_data.get("payment_type") or 1,
            "paymentFormsTable": [
                {
                    "paymentMethod": raw_data.get("payment_method") or 1,
                    "paymentAmount": total,
                }
            ],
        },
        "sender": {"rnc": sender_rnc, "name": sender_name},
        "buyer": {"rnc": buyer_rnc, "name": buyer_name},
        "totals": {
            "subtotal": subtotal,
            "discount": 0.0,
            "taxableAmount": subtotal,
            "itbis": itbis_total,
            "total": total,
        },
        "itemDetails": item_details,
    }

    # If reference e-CF is provided (E33/E34)
    if raw_data.get("reference_ecf") and raw_data.get("reference_date"):
        alanube_payload["idDoc"]["referenceEcf"] = raw_data["reference_ecf"]
        alanube_payload["idDoc"]["referenceDate"] = raw_data["reference_date"]

    if not is_electronic:
        # Bypass Alanube API for traditional/physical NCFs (handled locally)
        raw_data.update(
            {
                "security_code": "LOCAL_NCF",
                "track_id": "LOCAL_NCF",
                "legal_status": "ACCEPTED",
                "pdf_url": None,
                "xml_url": None,
                "qr_url": None,
            }
        )
        invoice.invoice_number = encf
        invoice.status = "verified"  # Locks the invoice in accounting
        invoice.processed = True
        invoice.file_path = None
        invoice.processed_path = None
        invoice.raw_extracted_data = json.dumps(raw_data, ensure_ascii=False)
        invoice.updated_at = datetime.utcnow()

        ctx.db.commit()
        invalidate_stats_cache(ctx.tenant_id, ctx.org_id)

        return {
            "message": "Factura física emitida exitosamente y registrada localmente",
            "invoice": invoice.to_dict(),
            "alanube_response": {
                "id": "LOCAL_NCF",
                "trackId": "LOCAL_NCF",
                "securityCode": "LOCAL_NCF",
                "legalStatus": "ACCEPTED",
                "pdfUrl": None,
                "xmlUrl": None,
            },
        }

    # Call Alanube Service
    alanube_service = AlanubeService()
    try:
        # Emit document to Alanube API
        res = await alanube_service.emit_document(ecf_type=ecf_type, payload=alanube_payload)

        # Retrieve signed metadata links from response
        # Standard Alanube output returns: securityCode, trackId, legalStatus, pdfUrl, xmlUrl
        track_id = res.get("id") or res.get("trackId")
        pdf_url = res.get("pdfUrl") or res.get("pdf_url")
        xml_url = res.get("xmlUrl") or res.get("xml_url")
        security_code = res.get("securityCode") or res.get("security_code")
        legal_status = res.get("legalStatus") or res.get("legal_status") or "ACCEPTED"

        # Update raw metadata to include Alanube response details
        raw_data.update(
            {
                "security_code": security_code,
                "track_id": track_id,
                "legal_status": legal_status,
                "pdf_url": pdf_url,
                "xml_url": xml_url,
                "qr_url": f"https://dgii.gov.do/consulta/ecf?rnc={sender_rnc}&encf={encf}&trackId={track_id}",
            }
        )

        invoice.invoice_number = encf
        invoice.status = "verified"  # Locks the invoice in accounting
        invoice.processed = True
        invoice.file_path = xml_url  # Associate direct link
        invoice.processed_path = pdf_url
        invoice.raw_extracted_data = json.dumps(raw_data, ensure_ascii=False)
        invoice.updated_at = datetime.utcnow()

        ctx.db.commit()
        invalidate_stats_cache(ctx.tenant_id, ctx.org_id)

        return {
            "message": "Factura emitida y transmitida exitosamente",
            "invoice": invoice.to_dict(),
            "alanube_response": res,
        }

    except Exception as e:
        ctx.db.rollback()
        logger.exception("Error transmitting invoice to Alanube API")
        raise HTTPException(status_code=500, detail=f"Error en la comunicación con Alanube: {str(e)}")


# ---------------------------------------------------------------------------
# Unified Emission Endpoint (Quick + Detailed modes)
# ---------------------------------------------------------------------------


class EmitResponse(BaseModel):
    message: str
    status: str  # "verified" | "pending" | "draft" | "error"
    invoice: Optional[dict] = None
    async_track_id: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class PaymentSplit(BaseModel):
    payment_method: int = Field(..., ge=1, le=8)  # 1:Cash 2:Check/Transfer 3:Card 4:Credit 6:Swap 7:Credit Note 8:Mixed
    payment_amount: float = Field(..., gt=0)


class EmitLineItem(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0.0)
    unit_price: float = Field(..., ge=0.0)
    discount_rate: float = Field(0.0, ge=0.0, le=100.0)
    tax_rate: float = Field(18.0, ge=0.0, le=100.0)
    good_service_indicator: int = Field(1, ge=1, le=2)  # 1: Good, 2: Service


class EmitRequest(BaseModel):
    mode: str = "detailed"  # "quick" | "detailed"
    ecf_type: int = Field(..., ge=31, le=47)
    income_type: str = "01"
    payment_type: int = 1  # 1: Contado, 2: Crédito
    payment_method: Optional[int] = None
    payment_splits: Optional[List[PaymentSplit]] = None
    items: List[EmitLineItem] = Field(..., min_length=1)
    notes: Optional[str] = None

    # Quick mode fields (buyer details inline)
    buyer_name: Optional[str] = None
    buyer_rnc: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_phone: Optional[str] = None
    buyer_email: Optional[str] = None

    # Detailed mode fields (references saved entities)
    client_id: Optional[str] = None
    reference_ecf: Optional[str] = None
    reference_date: Optional[date] = None
    modification_code: Optional[int] = Field(
        None, ge=1, le=4
    )  # 1:Total cancellation 2:Text correction 3:Amount 4:Replace NCF

    @field_validator("buyer_rnc")
    @classmethod
    def validate_rnc(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        clean = re.sub(r"[^0-9]", "", v)
        if len(clean) not in (9, 11):
            raise ValueError("El RNC/Cédula debe tener 9 u 11 dígitos.")
        return clean

    @model_validator(mode="after")
    def validate_mode_fields(self) -> "EmitRequest":
        if self.mode == "quick":
            if not self.buyer_name:
                raise ValueError("El nombre del comprador es obligatorio en modo rápido.")
            if not self.buyer_rnc:
                raise ValueError("El RNC/Cédula del comprador es obligatorio en modo rápido.")
        elif self.mode == "detailed":
            if not self.client_id:
                raise ValueError("Debe seleccionar un cliente existente en modo detallado.")
        return self


EMISSION_ASYNC_THRESHOLD = 250_000.0  # DOP


def _billing_indicator(tax_rate: float, ecf_type: int) -> int:
    """Derive billingIndicator from tax_rate and ecf_type."""
    if ecf_type in (43, 44):
        return 4  # Exempt
    if tax_rate >= 18:
        return 1  # ITBIS 1 (18%)
    if tax_rate >= 16:
        return 2  # ITBIS 2 (16%)
    if tax_rate > 0:
        return 3  # ITBIS 3 (0%)
    return 3  # Default: ITBIS 0%


def _build_emit_alanube_payload(
    encf: str,
    sequence: EcfSequence,
    ecf_type: int,
    sender_rnc: str,
    sender_name: str,
    buyer_name: str,
    buyer_rnc: str,
    items: List[EmitLineItem],
    income_type: int = 1,
    payment_type: int = 1,
    payment_method: Optional[int] = None,
    payment_splits: Optional[List[dict]] = None,
    reference_ecf: Optional[str] = None,
    reference_date: Optional[date] = None,
    modification_code: Optional[int] = None,
    sender_address: Optional[str] = None,
    sender_municipality: Optional[str] = None,
    sender_province: Optional[str] = None,
    sender_phone: Optional[List[str]] = None,
    sender_email: Optional[str] = None,
    sender_website: Optional[str] = None,
    sender_economic_activity: Optional[str] = None,
    buyer_address: Optional[str] = None,
    buyer_phone: Optional[str] = None,
    buyer_email: Optional[str] = None,
    stamp_date: Optional[str] = None,
) -> dict:
    """Build the Alanube API payload from emission items — DGII normativa e-CF compliant."""
    item_details = []
    subtotal = 0.0
    itbis_total = 0.0
    discount_total = 0.0

    i1_amount_taxed = 0.0
    i2_amount_taxed = 0.0
    i3_amount_taxed = 0.0
    exempt_amount = 0.0
    non_billable_amount = 0.0

    for idx, item in enumerate(items):
        gross = item.quantity * item.unit_price
        discount_amt = gross * (item.discount_rate / 100.0)
        net = gross - discount_amt
        tax_amt = net * (item.tax_rate / 100.0)
        item_amount = round(net, 2)

        bi = _billing_indicator(item.tax_rate, ecf_type)

        subtotal += net
        itbis_total += tax_amt
        discount_total += discount_amt

        if bi == 1:
            i1_amount_taxed += net
        elif bi == 2:
            i2_amount_taxed += net
        elif bi == 3:
            i3_amount_taxed += net
        elif bi == 4:
            exempt_amount += net
        else:
            non_billable_amount += net

        item_details.append(
            {
                "lineNumber": idx + 1,
                "itemName": item.description,
                "quantityItem": item.quantity,
                "unitPriceItem": item.unit_price,
                "discountAmount": round(discount_amt, 2),
                "itemAmount": item_amount,
                "billingIndicator": bi,
                "goodServiceIndicator": item.good_service_indicator,
            }
        )

    total_amount = round(subtotal + itbis_total, 2)
    itbis_1_total = round(i1_amount_taxed * 0.18, 2)
    itbis_2_total = round(i2_amount_taxed * 0.16, 2)
    itbis_3_total = 0.0

    due_date_str = sequence.expiry_date.isoformat() if sequence.expiry_date else "2028-12-31"

    payload = {
        "idDoc": {
            "encf": encf,
            "sequenceDueDate": due_date_str,
            "taxAmountIndicator": 0,  # 0: taxes not included in price (estándar DGII)
            "incomeType": income_type,
            "paymentType": payment_type,
            "paymentFormsTable": payment_splits
            if payment_splits
            else [
                {
                    "paymentMethod": payment_method or 1,
                    "paymentAmount": total_amount,
                }
            ],
        },
        "sender": {
            "rnc": sender_rnc,
            "companyName": sender_name,
            "stampDate": stamp_date or date.today().isoformat(),
        },
        "buyer": {
            "rnc": buyer_rnc,
            "companyName": buyer_name,
        },
        "totals": {
            "totalTaxedAmount": round(subtotal, 2),
            "i1AmountTaxed": round(i1_amount_taxed, 2),
            "i2AmountTaxed": round(i2_amount_taxed, 2),
            "i3AmountTaxed": round(i3_amount_taxed, 2),
            "exemptAmount": round(exempt_amount, 2),
            "nonBillableAmount": round(non_billable_amount, 2),
            "itbisS1": 18,
            "itbisS2": 16,
            "itbisS3": 0,
            "itbis1Total": itbis_1_total,
            "itbis2Total": itbis_2_total,
            "itbis3Total": itbis_3_total,
            "itbisTotal": round(itbis_total, 2),
            "totalAmount": total_amount,
        },
        "itemDetails": item_details,
        "config": {
            "pdfTemplate": "pos",
            "sendEmail": False,
        },
    }

    payload["sender"]["address"] = sender_address or sender_name
    if sender_municipality:
        payload["sender"]["municipality"] = sender_municipality
    if sender_province:
        payload["sender"]["province"] = sender_province
    if sender_phone:
        payload["sender"]["phoneNumber"] = sender_phone
    if sender_email:
        payload["sender"]["mail"] = sender_email
    if sender_website:
        payload["sender"]["webSite"] = sender_website
    if sender_economic_activity:
        payload["sender"]["economicActivity"] = sender_economic_activity

    if buyer_address:
        payload["buyer"]["address"] = buyer_address
    if buyer_phone:
        payload["buyer"]["phoneNumber"] = buyer_phone
    if buyer_email:
        payload["buyer"]["mail"] = buyer_email
        payload["config"]["sendEmail"] = True

    if reference_ecf and reference_date:
        mod_code = modification_code or 3
        payload["informationReference"] = {
            "informationDetails": [
                {
                    "modificationCode": mod_code,
                    "encfModified": reference_ecf,
                    "reason": "Corrección de monto",
                }
            ]
        }

    return payload, subtotal, itbis_total, total_amount


def _build_ecf_xml(
    encf: str,
    payload: EmitRequest,
    buyer_name: str,
    buyer_rnc: str,
    sender_rnc: str,
    sender_name: str,
    total_amount: float,
) -> str:
    """Build a minimal e-CF XML representation from emission data."""
    items_xml = ""
    for i, item in enumerate(payload.items, 1):
        gross = item.quantity * item.unit_price
        discount = gross * (item.discount_rate / 100.0)
        net = gross - discount
        items_xml += (
            f"      <Detalle>\n"
            f"        <NumeroLinea>{i}</NumeroLinea>\n"
            f"        <Descripcion>{item.description}</Descripcion>\n"
            f"        <Cantidad>{item.quantity}</Cantidad>\n"
            f"        <PrecioUnitario>{item.unit_price:.2f}</PrecioUnitario>\n"
            f"        <Descuento>{discount:.2f}</Descuento>\n"
            f"        <MontoItem>{net:.2f}</MontoItem>\n"
            f"      </Detalle>\n"
        )

    xml = f"""<?xml version="1.0" encoding="utf-8"?>
<eCF xmlns="http://dgii.gov.do/eCF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ECF>
    <Encabezado>
      <IdDoc>
        <TipoeCF>{payload.ecf_type}</TipoeCF>
        <eNCF>{encf}</eNCF>
        <FechaEmision>{datetime.utcnow().strftime("%d-%m-%Y")}</FechaEmision>
      </IdDoc>
      <Emisor>
        <RNC>{sender_rnc}</RNC>
        <RazonSocial>{sender_name}</RazonSocial>
      </Emisor>
      <Comprador>
        <RNC>{buyer_rnc}</RNC>
        <RazonSocial>{buyer_name}</RazonSocial>
      </Comprador>
    </Encabezado>
    <DetallesFactura>
{items_xml}    </DetallesFactura>
    <Totales>
      <Total>{total_amount:.2f}</Total>
    </Totales>
  </ECF>
</eCF>"""
    return xml


async def _save_emission_xml(
    invoice: Invoice,
    ctx: TenantContext,
    xml_url: Optional[str] = None,
    encf: Optional[str] = None,
    payload: Optional[EmitRequest] = None,
    buyer_name: str = "",
    buyer_rnc: str = "",
    sender_rnc: str = "",
    sender_name: str = "",
    total_amount: float = 0.0,
) -> None:
    """Persist e-CF XML to DB + storage.

    Tries to download signed XML from Alanube URL first. Falls back to
    building a local copy from emission data so the XML is never missing.
    """
    xml_content: Optional[str] = None

    if xml_url:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(xml_url)
                resp.raise_for_status()
                xml_content = resp.text
        except Exception:
            logger.warning(
                "Could not download signed XML from %s — will build local copy",
                xml_url,
            )

    if not xml_content and encf and payload:
        try:
            xml_content = _build_ecf_xml(
                encf=encf,
                payload=payload,
                buyer_name=buyer_name,
                buyer_rnc=buyer_rnc,
                sender_rnc=sender_rnc,
                sender_name=sender_name,
                total_amount=total_amount,
            )
        except Exception:
            logger.exception("Failed to build local e-CF XML")

    if not xml_content:
        logger.warning("No XML content to save for invoice %s", invoice.id)
        return

    invoice.original_xml_data = xml_content

    try:
        storage_path = build_storage_path(
            tenant_id=UUID(str(ctx.tenant_id)),
            org_id=UUID(str(ctx.org_id)),
            invoice_id=invoice.id,
            variant="ecf",
            extension="xml",
        )
        result = upload_file(xml_content.encode("utf-8"), storage_path, content_type="application/xml")
        if result:
            invoice.file_path = storage_path
            logger.info("e-CF XML saved to storage: %s", result)
        else:
            logger.warning("e-CF XML not saved to storage for invoice %s — upload_file returned None", invoice.id)
    except Exception:
        logger.exception("Failed to upload e-CF XML to storage")


@router.post("/emit", response_model=EmitResponse)
async def emit_invoice(payload: EmitRequest, ctx: TenantContext = Depends(require_tenant)):
    """
    Unified emission endpoint — handles both Quick (POS-style) and Detailed (wizard) modes.

    Quick mode: Creates a draft, looks up or creates buyer on the fly, transmits to Alanube.
    Detailed mode: Uses an existing client, creates draft, transmits to Alanube.

    For totals >= 250,000 DOP, returns async_pending status (DGII async processing).
    """
    # 1. Validate org is ECF authorized for electronic types
    is_electronic = 31 <= payload.ecf_type <= 47
    if is_electronic and not ctx.organization.is_ecf_authorized:
        return EmitResponse(
            message="La empresa no está autorizada para emitir comprobantes electrónicos.",
            status="error",
            error_code="not_authorized",
            error_message="Debe completar la certificación electrónica ante la DGII en los Ajustes.",
        )

    # 2. Resolve buyer
    buyer_name = payload.buyer_name or ""
    buyer_rnc = payload.buyer_rnc or ""
    buyer_address = payload.buyer_address or ""

    if payload.mode == "detailed" and payload.client_id:
        client = (
            ctx.db.query(Client)
            .filter(
                Client.id == UUID(payload.client_id),
                Client.tenant_id == ctx.tenant_id,
                Client.organization_id == ctx.org_id,
                Client.deleted_at.is_(None),
            )
            .first()
        )
        if not client:
            return EmitResponse(
                message="Cliente no encontrado.",
                status="error",
                error_code="client_not_found",
                error_message="El cliente seleccionado no existe o fue eliminado.",
            )
        buyer_name = client.name or "Consumidor Final"
        buyer_rnc = client.tax_id or "132109122"
        buyer_address = client.address or ""

    if not buyer_rnc:
        buyer_rnc = "132109122"  # Fallback for final consumer
    if not buyer_name:
        buyer_name = "Consumidor Final"

    # Persist buyer as a reusable Client record (survives invoice deletion).
    # Only upsert when we have a real RNC (not the fallback consumer).
    if payload.mode != "detailed" or not payload.client_id:
        is_fallback_rnc = buyer_rnc in ("", "132109122", "000000000")
        if not is_fallback_rnc and buyer_rnc:
            org_rnc = re.sub(r"[^0-9]", "", ctx.organization.tax_id or "")
            if org_rnc and buyer_rnc == org_rnc:
                return EmitResponse(
                    message="No puedes emitir una factura a tu propio RNC.",
                    status="error",
                    error_code="self_buyer",
                    error_message="El comprador debe ser un tercero. No puedes facturarte a ti mismo.",
                )
            existing = (
                ctx.db.query(Client)
                .filter(
                    Client.tenant_id == ctx.tenant_id,
                    Client.organization_id == ctx.org_id,
                    Client.tax_id == buyer_rnc,
                    Client.deleted_at.is_(None),
                )
                .first()
            )
            if existing:
                if buyer_name and existing.name != buyer_name:
                    existing.name = buyer_name
                if buyer_address and existing.address != buyer_address:
                    existing.address = buyer_address
                if payload.buyer_phone and existing.phone != payload.buyer_phone:
                    existing.phone = payload.buyer_phone
                if payload.buyer_email and existing.email != payload.buyer_email:
                    existing.email = payload.buyer_email
            else:
                client = Client(
                    tenant_id=ctx.tenant_id,
                    organization_id=ctx.org_id,
                    name=buyer_name,
                    tax_id=buyer_rnc,
                    address=buyer_address or None,
                    phone=payload.buyer_phone or None,
                    email=payload.buyer_email or None,
                )
                ctx.db.add(client)

    # 3. Resolve ECF sequence and increment
    sequence = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id,
            EcfSequence.ecf_type == payload.ecf_type,
            EcfSequence.is_active.is_(True),
        )
        .first()
    )

    if not sequence:
        return EmitResponse(
            message=f"No hay una secuencia activa para el tipo {payload.ecf_type}.",
            status="error",
            error_code="no_sequence",
            error_message=(
                f"Debe cargar una secuencia e-CF para el tipo {payload.ecf_type} en Facturación → Secuencias."
            ),
        )

    if sequence.current_number >= sequence.end_number:
        return EmitResponse(
            message=f"El rango de secuencia e-CF para el tipo {payload.ecf_type} está agotado.",
            status="error",
            error_code="sequence_exhausted",
            error_message=f"Debe cargar un nuevo rango de secuencia e-CF para el tipo {payload.ecf_type}.",
        )

    sequence.current_number += 1
    is_electronic_seq = sequence.prefix == "E"
    if is_electronic_seq:
        encf = f"{sequence.prefix}{payload.ecf_type:02d}{sequence.current_number:010d}"
    else:
        encf = f"{sequence.prefix}{payload.ecf_type:02d}{sequence.current_number:08d}"

    sender_rnc = re.sub(r"[^0-9]", "", ctx.organization.tax_id or "") or "132109122"
    sender_name = ctx.organization.name or "Fintral"

    # 4. Build Alanube payload from items
    org = ctx.organization
    sender_phone_list = [org.phone] if org.phone else None
    alanube_payload, subtotal, itbis_total, total_amount = _build_emit_alanube_payload(
        encf=encf,
        sequence=sequence,
        ecf_type=payload.ecf_type,
        sender_rnc=sender_rnc,
        sender_name=sender_name,
        buyer_name=buyer_name,
        buyer_rnc=buyer_rnc,
        items=payload.items,
        income_type=int(payload.income_type),
        payment_type=payload.payment_type,
        payment_method=payload.payment_method,
        payment_splits=[s.model_dump() for s in payload.payment_splits] if payload.payment_splits else None,
        reference_ecf=payload.reference_ecf,
        reference_date=payload.reference_date,
        modification_code=payload.modification_code,
        sender_address=org.fiscal_address,
        sender_municipality=org.municipality,
        sender_province=org.province,
        sender_phone=sender_phone_list,
        sender_email=org.email_contact,
        sender_website=org.website,
        sender_economic_activity=org.economic_activity,
        buyer_address=buyer_address,
        buyer_phone=payload.buyer_phone,
        buyer_email=payload.buyer_email,
        stamp_date=datetime.utcnow().date().isoformat(),
    )

    # 5. Build invoice line items data
    line_items = []
    for idx, item in enumerate(payload.items):
        gross = item.quantity * item.unit_price
        discount_amt = gross * (item.discount_rate / 100.0)
        net = gross - discount_amt
        tax_amt = net * (item.tax_rate / 100.0)
        line_items.append(
            {
                "line": idx + 1,
                "name": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "discount_rate": item.discount_rate,
                "tax_rate": item.tax_rate,
                "total": round(net + tax_amt, 2),
            }
        )

    raw_data = {
        "ecf_type": payload.ecf_type,
        "payment_type": payload.payment_type,
        "payment_method": payload.payment_method,
        "notes": payload.notes,
        "mode": payload.mode,
        "reference_ecf": payload.reference_ecf,
        "reference_date": payload.reference_date.isoformat() if payload.reference_date else None,
        "buyer_name": buyer_name,
        "buyer_rnc": buyer_rnc,
        "buyer_address": buyer_address,
    }

    payment_cond = "credito" if payload.payment_type == 2 else "contado"
    invoice_due_date = None
    if payment_cond == "credito":
        invoice_due_date = datetime.utcnow() + timedelta(days=30)

    # 6. Create invoice draft
    invoice = Invoice(
        tenant_id=ctx.tenant_id,
        organization_id=ctx.org_id,
        filename="Factura Emitida",
        file_type="xml" if is_electronic_seq else "manual",
        vendor_name=ctx.organization.name,
        vendor_tax_id=ctx.organization.tax_id,
        rnc_comprador=buyer_rnc,
        invoice_date=datetime.utcnow(),
        total_amount=total_amount,
        tax_amount=itbis_total,
        currency="DOP",
        transaction_type="income",
        source_type="billing",
        ecf_type=str(payload.ecf_type),
        is_electronic=is_electronic_seq,
        processed=False,
        status="draft",
        line_items_data=json.dumps(line_items, ensure_ascii=False),
        raw_extracted_data=json.dumps(raw_data, ensure_ascii=False),
        payment_condition=payment_cond,
        due_date=invoice_due_date,
    )
    ctx.db.add(invoice)
    ctx.db.flush()

    # 7. Transmit to Alanube (skip for physical NCFs)
    if not is_electronic_seq:
        invoice.invoice_number = encf
        invoice.status = "verified"
        invoice.processed = True
        raw_data.update(
            {
                "security_code": "LOCAL_NCF",
                "track_id": "LOCAL_NCF",
                "legal_status": "ACCEPTED",
            }
        )
        invoice.raw_extracted_data = json.dumps(raw_data, ensure_ascii=False)
        invoice.updated_at = datetime.utcnow()
        ctx.db.commit()
        invalidate_stats_cache(ctx.tenant_id, ctx.org_id)

        audit_logger.record(
            db=ctx.db,
            tenant_id=ctx.tenant_id,
            organization_id=ctx.org_id,
            organization_name=ctx.organization.name,
            actor_id=str(ctx.user.id),
            actor_name=ctx.user.full_name,
            actor_email=ctx.user.email,
            action="invoice.emitted",
            resource_type="invoice",
            resource_id=str(invoice.id),
            summary=f"Factura física {encf} emitida a {buyer_name} por RD$ {total_amount:,.2f}",
            details=f"Tipo e-CF {payload.ecf_type}, pago {payment_cond}",
            metadata={
                "ecf_type": payload.ecf_type,
                "encf": encf,
                "total_amount": total_amount,
                "mode": "physical",
            },
        )

        return EmitResponse(
            message="Factura física emitida exitosamente.",
            status="verified",
            invoice=invoice.to_dict(),
        )

    alanube_service = AlanubeService()
    try:
        res = await alanube_service.emit_document(
            ecf_type=payload.ecf_type,
            payload=alanube_payload,
            company_id=ctx.organization.alanube_company_id,
        )

        track_id = res.get("id") or res.get("trackId")
        pdf_url = res.get("pdfUrl") or res.get("pdf_url")
        xml_url = res.get("xmlUrl") or res.get("xml_url")
        security_code = res.get("securityCode") or res.get("security_code")
        legal_status = res.get("legalStatus") or res.get("legal_status") or "ACCEPTED"

        # Check for async processing (AEP2006 or similar)
        response_code = None
        errors = res.get("errors") or []
        if errors and isinstance(errors, list) and len(errors) > 0:
            response_code = errors[0].get("code")

        is_async = response_code in ("AEP2006", "AEP2XXX", "AP19101") or not track_id

        raw_data.update(
            {
                "security_code": security_code,
                "track_id": track_id,
                "legal_status": legal_status,
                "pdf_url": pdf_url,
                "xml_url": xml_url,
                "qr_url": f"https://dgii.gov.do/consulta/ecf?rnc={sender_rnc}&encf={encf}&trackId={track_id}"
                if track_id
                else None,
                "async": is_async,
            }
        )

        invoice.invoice_number = encf
        invoice.file_path = xml_url
        invoice.processed_path = pdf_url
        invoice.raw_extracted_data = json.dumps(raw_data, ensure_ascii=False)
        invoice.updated_at = datetime.utcnow()

        if is_async:
            invoice.status = "draft"
            invoice.processed = False

            await _save_emission_xml(
                invoice=invoice,
                ctx=ctx,
                xml_url=xml_url,
                encf=encf,
                payload=payload,
                buyer_name=buyer_name,
                buyer_rnc=buyer_rnc,
                sender_rnc=sender_rnc,
                sender_name=sender_name,
                total_amount=total_amount,
            )

            ctx.db.commit()
            invalidate_stats_cache(ctx.tenant_id, ctx.org_id)

            audit_logger.record(
                db=ctx.db,
                tenant_id=ctx.tenant_id,
                organization_id=ctx.org_id,
                organization_name=ctx.organization.name,
                actor_id=str(ctx.user.id),
                actor_name=ctx.user.full_name,
                actor_email=ctx.user.email,
                action="invoice.emitted",
                resource_type="invoice",
                resource_id=str(invoice.id),
                summary=f"Factura {encf} enviada a la DGII (procesamiento asíncrono) — {buyer_name}",
                details=f"Tipo e-CF {payload.ecf_type}, modo {payload.mode}, trackId={track_id}",
                metadata={
                    "ecf_type": payload.ecf_type,
                    "encf": encf,
                    "total_amount": total_amount,
                    "async": True,
                    "track_id": track_id,
                },
            )

            return EmitResponse(
                message=(
                    "Factura enviada a la DGII para procesamiento asíncrono. "
                    "Recibirá una notificación cuando sea aprobada."
                ),
                status="pending",
                invoice=invoice.to_dict(),
                async_track_id=track_id,
            )
        else:
            invoice.status = "verified"
            invoice.processed = True

            await _save_emission_xml(
                invoice=invoice,
                ctx=ctx,
                xml_url=xml_url,
                encf=encf,
                payload=payload,
                buyer_name=buyer_name,
                buyer_rnc=buyer_rnc,
                sender_rnc=sender_rnc,
                sender_name=sender_name,
                total_amount=total_amount,
            )

            ctx.db.commit()
            invalidate_stats_cache(ctx.tenant_id, ctx.org_id)

            audit_logger.record(
                db=ctx.db,
                tenant_id=ctx.tenant_id,
                organization_id=ctx.org_id,
                organization_name=ctx.organization.name,
                actor_id=str(ctx.user.id),
                actor_name=ctx.user.full_name,
                actor_email=ctx.user.email,
                action="invoice.emitted",
                resource_type="invoice",
                resource_id=str(invoice.id),
                summary=f"Factura {encf} emitida y timbrada — {buyer_name} por RD$ {total_amount:,.2f}",
                details=f"Tipo e-CF {payload.ecf_type}, modo {payload.mode}, trackId={track_id}",
                metadata={
                    "ecf_type": payload.ecf_type,
                    "encf": encf,
                    "total_amount": total_amount,
                    "async": False,
                    "track_id": track_id,
                },
            )

            return EmitResponse(
                message="Factura electrónica emitida y timbrada exitosamente por la DGII.",
                status="verified",
                invoice=invoice.to_dict(),
            )

    except Exception as e:
        ctx.db.rollback()
        logger.exception("Error emitting invoice via Alanube")
        err_msg = str(e)
        error_code, user_message, is_async = map_emission_error(err_msg)
        return EmitResponse(
            message=user_message,
            status="pending" if is_async else "error",
            error_code=error_code,
            error_message=user_message,
        )


# ---------------------------------------------------------------------------
# Alanube Connection Test
# ---------------------------------------------------------------------------


class AlanubeConfig(BaseModel):
    api_url: str = "https://sandbox-api.alanube.co/dom/v1"
    jwt_token: str


@router.post("/alanube/test")
async def test_alanube_connection(payload: AlanubeConfig):
    """Test Alanube connection with provided credentials."""
    service = AlanubeService(api_url=payload.api_url, jwt_token=payload.jwt_token)
    try:
        result = await service.verify_connection()
        return {"ok": True, "company": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}
