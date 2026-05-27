import json
import logging
import re
from datetime import date, datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header, Request, UploadFile, File, Form
from pydantic import BaseModel, Field, field_validator, model_validator

from app.dependencies.tenant import TenantContext, require_tenant
from app.models import Client, Product, EcfSequence, Invoice
from app.services.alanube import AlanubeService
from app.core.redis import invalidate_stats_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])

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
            raise ValueError(f"El número actual ({self.current_number}) debe ser mayor o igual al número inicial - 1 ({self.start_number - 1}).")
        if self.current_number > self.end_number:
            raise ValueError(f"El número actual ({self.current_number}) no puede exceder el número final del rango ({self.end_number}).")
        
        is_electronic = self.ecf_type in (31, 32, 34, 43, 44, 45)
        if is_electronic and self.prefix != "E":
            raise ValueError(f"Para comprobantes electrónicos (tipo {self.ecf_type}), el prefijo debe ser 'E'.")
        elif not is_electronic and self.prefix != "B":
            raise ValueError(f"Para comprobantes tradicionales/físicos (tipo {self.ecf_type}), el prefijo debe ser 'B'.")
            
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
    product_id: str
    quantity: float = Field(..., gt=0.0)
    unit_price: float = Field(..., ge=0.0)
    discount_rate: float = Field(0.0, ge=0.0, le=100.0)

class InvoiceCreate(BaseModel):
    client_id: Optional[str] = None
    ecf_type: Optional[int] = None  # e.g. 31, 32, 34
    payment_type: int = 1  # 1: Contado, 2: Crédito
    payment_method: Optional[int] = None # 1: Efectivo, 2: Cheque/Transf, 3: Tarjeta, etc.
    notes: Optional[str] = None
    reference_ecf: Optional[str] = None
    reference_date: Optional[date] = None
    items: List[InvoiceLineItem]

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
            Client.deleted_at.is_(None)
        )
        .order_by(Client.name.asc())
        .all()
    )
    return [c.to_dict() for c in clients]

@router.post("/clients", response_model=ClientSchema)
async def create_client(payload: ClientCreate, ctx: TenantContext = Depends(require_tenant)):
    # Clean tax_id (RNC/Cedula)
    clean_tax_id = None
    if payload.tax_id:
        clean_tax_id = re.sub(r"[^0-9]", "", payload.tax_id)

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
            Client.deleted_at.is_(None)
        )
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    clean_tax_id = None
    if payload.tax_id:
        clean_tax_id = re.sub(r"[^0-9]", "", payload.tax_id)

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
            Client.deleted_at.is_(None)
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
            Product.deleted_at.is_(None)
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
        is_active=True
    )
    ctx.db.add(product)
    ctx.db.commit()
    ctx.db.refresh(product)
    return product.to_dict()

@router.put("/products/{product_id}", response_model=ProductSchema)
async def update_product(product_id: str, payload: ProductUpdate, ctx: TenantContext = Depends(require_tenant)):
    product = (
        ctx.db.query(Product)
        .filter(
            Product.id == UUID(product_id),
            Product.tenant_id == ctx.tenant_id,
            Product.organization_id == ctx.org_id,
            Product.deleted_at.is_(None)
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
            Product.deleted_at.is_(None)
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
            EcfSequence.organization_id == ctx.org_id
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
            detail="Tu empresa no está verificada como emisor electrónico ante la DGII. Solo puedes registrar secuencias de comprobantes físicos."
        )

    # Deactivate existing active sequences of same type
    ctx.db.query(EcfSequence).filter(
        EcfSequence.tenant_id == ctx.tenant_id,
        EcfSequence.organization_id == ctx.org_id,
        EcfSequence.ecf_type == payload.ecf_type
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
        is_active=True
    )
    ctx.db.add(sequence)
    ctx.db.commit()
    ctx.db.refresh(sequence)
    return sequence.to_dict()

@router.put("/sequences/{sequence_id}", response_model=EcfSequenceSchema)
async def update_sequence(sequence_id: str, payload: EcfSequenceUpdate, ctx: TenantContext = Depends(require_tenant)):
    sequence = (
        ctx.db.query(EcfSequence)
        .filter(
            EcfSequence.id == UUID(sequence_id),
            EcfSequence.tenant_id == ctx.tenant_id,
            EcfSequence.organization_id == ctx.org_id
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
        raise HTTPException(status_code=400, detail="El número inicial del rango no puede ser mayor que el número final.")
    if sequence.current_number < sequence.start_number - 1:
        raise HTTPException(status_code=400, detail=f"El número actual ({sequence.current_number}) debe ser mayor o igual al número inicial - 1 ({sequence.start_number - 1}).")
    if sequence.current_number > sequence.end_number:
        raise HTTPException(status_code=400, detail=f"El número actual ({sequence.current_number}) no puede exceder el número final del rango ({sequence.end_number}).")
    
    is_electronic = sequence.ecf_type in (31, 32, 34, 43, 44, 45)
    if is_electronic and sequence.prefix != "E":
        raise HTTPException(status_code=400, detail=f"Para comprobantes electrónicos (tipo {sequence.ecf_type}), el prefijo debe ser 'E'.")
    elif not is_electronic and sequence.prefix != "B":
        raise HTTPException(status_code=400, detail=f"Para comprobantes tradicionales/físicos (tipo {sequence.ecf_type}), el prefijo debe ser 'B'.")

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
            EcfSequence.organization_id == ctx.org_id
        )
        .first()
    )
    if not sequence:
        raise HTTPException(status_code=404, detail="Secuencia no encontrada")

    ctx.db.delete(sequence)
    ctx.db.commit()
    return {"message": "Secuencia eliminada exitosamente"}

class CertificationRegister(BaseModel):
    rnc: str
    business_name: str
    trade_name: Optional[str] = None
    economic_activity: str
    branch_office_address: Optional[str] = None

@router.get("/verification-status")
async def get_verification_status(ctx: TenantContext = Depends(require_tenant)):
    return {
        "is_ecf_authorized": ctx.organization.is_ecf_authorized,
        "certification_status": ctx.organization.certification_status,
        "alanube_company_id": ctx.organization.alanube_company_id,
        "alanube_environment": ctx.organization.alanube_environment,
        "certificate_uploaded_at": ctx.organization.certificate_uploaded_at.isoformat() if ctx.organization.certificate_uploaded_at else None,
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
    ctx: TenantContext = Depends(require_tenant)
):
    import base64
    from app.config import SECRET_KEY
    from app.utils.dates import utc_now
    
    clean_rnc = re.sub(r"[^0-9]", "", rnc)
    if len(clean_rnc) not in (9, 11):
        raise HTTPException(
            status_code=400,
            detail="El RNC/Cédula debe tener 9 u 11 dígitos."
        )

    # Verify that the submitted RNC matches the organization's registered RNC
    org_rnc = re.sub(r"[^0-9]", "", ctx.organization.tax_id or "")
    if org_rnc and clean_rnc != org_rnc:
        raise HTTPException(
            status_code=400,
            detail="El RNC/Cédula enviado no coincide con el RNC registrado de la organización."
        )

    filename = certificate.filename or ""
    if not (filename.endswith(".p12") or filename.endswith(".pfx")):
        raise HTTPException(
            status_code=400,
            detail="El certificado debe ser un archivo con extensión .p12 o .pfx"
        )

    try:
        cert_bytes = await certificate.read()
        cert_b64 = base64.b64encode(cert_bytes).decode("utf-8")

        base_url = str(request.base_url).rstrip("/")
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
                "password": certificate_password
            },
            "webhooks": {
                "documents": {
                    "emissionFinished": {
                        "status": "active",
                        "url": webhook_url,
                        "headers": {
                            "x-api-key": SECRET_KEY
                        }
                    }
                },
                "general": {
                    "governmentStatusChanged": {
                        "status": "active",
                        "url": f"{webhook_url}/status",
                        "headers": {
                            "x-api-key": SECRET_KEY
                        }
                    }
                }
            }
        }

        alanube_service = AlanubeService()
        res = await alanube_service.create_company(alanube_payload)

        # Sign dummy XML to verify certificate/signature validity
        now_str = datetime.utcnow().strftime('%d-%m-%Y')
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

        await alanube_service.sign_document(dummy_xml.encode('utf-8'))

        ctx.organization.tax_id = clean_rnc
        ctx.organization.name = business_name
        ctx.organization.economic_activity = economic_activity
        ctx.organization.fiscal_address = branch_office_address
        ctx.organization.certification_status = "certificate_uploaded"
        ctx.organization.alanube_company_id = clean_rnc
        ctx.organization.alanube_environment = "TesteCF"
        ctx.organization.certificate_uploaded_at = utc_now()
        ctx.db.commit()

        return {
            "message": "Empresa y certificado registrados exitosamente en Alanube.",
            "status": "certificate_uploaded",
            "alanube_response": res
        }
    except Exception as e:
        logger.exception("Error registering company and certificate with Alanube")
        err_msg = str(e)
        if "Unauthorized" in err_msg or "401" in err_msg:
            detail_msg = "Error de autorización con el proveedor fiscal (Alanube). Verifique que las credenciales (JWT) en la configuración del servidor sean correctas."
        elif "address" in err_msg or "province" in err_msg or "municipality" in err_msg:
            detail_msg = "La API de Alanube requiere que proporciones dirección, provincia y municipio completos."
        elif "contraseña" in err_msg.lower() or "password" in err_msg.lower() or "signature" in err_msg.lower():
            detail_msg = "La contraseña del certificado digital es incorrecta o el archivo está dañado."
        elif "Timeout" in err_msg or "timeout" in err_msg:
            detail_msg = "Se agotó el tiempo de espera al conectar con el proveedor fiscal. Por favor, intente de nuevo."
        elif "Network" in err_msg or "connection" in err_msg.lower():
            detail_msg = "Error de conexión con el proveedor fiscal. Verifique el estado del servidor."
        else:
            detail_msg = f"Error al procesar el registro fiscal: {err_msg}"
        raise HTTPException(
            status_code=500,
            detail=detail_msg
        )

@router.post("/certification/start-set-test")
async def start_set_test(ctx: TenantContext = Depends(require_tenant)):
    if ctx.organization.certification_status not in ("certificate_uploaded", "set_test_running", "set_test_rejected"):
        raise HTTPException(
            status_code=400,
            detail="Debe registrar la empresa y subir un certificado digital válido antes de iniciar las pruebas."
        )

    rnc = ctx.organization.alanube_company_id or ctx.organization.tax_id or "132109122"
    set_test_payload = {
        "identification": rnc,
        "environment": "TesteCF"
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
        ctx.db.commit()

        return {
            "message": "Pruebas de certificación iniciadas exitosamente.",
            "status": "set_test_running",
            "track_id": set_test_id
        }
    except Exception as e:
        logger.exception("Error starting set test with Alanube")
        err_msg = str(e)
        if "Unauthorized" in err_msg or "401" in err_msg:
            detail_msg = "Error de autorización con el proveedor fiscal. El token es inválido o no tiene permisos."
        elif "Timeout" in err_msg or "timeout" in err_msg:
            detail_msg = "Se agotó el tiempo de espera al iniciar el set de pruebas ante la DGII."
        else:
            detail_msg = "No se pudo iniciar el set de pruebas automáticas. Verifique que la empresa esté registrada y el certificado esté cargado."
        raise HTTPException(
            status_code=500,
            detail=detail_msg
        )

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
            detail="No se encontró ningún set de pruebas activo para esta organización."
        )

    alanube_service = AlanubeService()
    try:
        res = await alanube_service.check_set_test_status(set_test_id)
        status_raw = res.get("status", "").lower()

        if status_raw in ("approved", "completed", "success"):
            ctx.organization.certification_status = "certified"
            ctx.organization.is_ecf_authorized = True
            ctx.db.commit()
            return {
                "status": "COMPLETED",
                "result": "APPROVED",
                "details": res
            }
        elif status_raw in ("rejected", "failed"):
            ctx.organization.certification_status = "set_test_rejected"
            ctx.db.commit()
            return {
                "status": "FAILED",
                "result": "REJECTED",
                "details": res
            }
        else:
            return {
                "status": "PROCESSING",
                "details": res
            }
    except Exception as e:
        logger.exception("Error checking set test status with Alanube")
        err_msg = str(e)
        if "Unauthorized" in err_msg or "401" in err_msg:
            detail_msg = "Error de autorización al consultar el estado de las pruebas en Alanube."
        elif "Timeout" in err_msg or "timeout" in err_msg:
            detail_msg = "Se agotó el tiempo de espera al consultar el estado de las pruebas con la DGII."
        else:
            detail_msg = "No se pudo obtener el estado de las pruebas automáticas. Intente de nuevo en unos momentos."
        raise HTTPException(
            status_code=500,
            detail=detail_msg
        )

@router.post("/alanube/webhook")
async def alanube_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    from app.config import SECRET_KEY
    if not x_api_key or x_api_key != SECRET_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    payload = await request.json()
    logger.info(f"Received webhook from Alanube: {json.dumps(payload)}")
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
            Invoice.deleted_at.is_(None)
        )
        .order_by(Invoice.created_at.desc())
        .all()
    )
    return [inv.to_dict() for inv in invoices]

@router.post("/invoices")
async def create_invoice_draft(payload: InvoiceCreate, ctx: TenantContext = Depends(require_tenant)):
    # Fetch client details if provided
    client_tax_id = None
    if payload.client_id:
        client = ctx.db.query(Client).filter(
            Client.id == UUID(payload.client_id),
            Client.tenant_id == ctx.tenant_id,
            Client.organization_id == ctx.org_id
        ).first()
        if not client:
            raise HTTPException(status_code=422, detail="Cliente no encontrado")
        client_tax_id = client.tax_id

    # Compute calculations based on product details
    line_items = []
    subtotal = 0.0
    discount_total = 0.0
    itbis_total = 0.0

    for idx, item in enumerate(payload.items):
        product = ctx.db.query(Product).filter(
            Product.id == UUID(item.product_id),
            Product.tenant_id == ctx.tenant_id,
            Product.organization_id == ctx.org_id
        ).first()
        if not product:
            raise HTTPException(status_code=422, detail=f"Producto {item.product_id} no encontrado")

        gross = item.quantity * item.unit_price
        discount = gross * (item.discount_rate / 100.0)
        net = gross - discount
        tax_amt = net * (product.tax_rate / 100.0)

        subtotal += net
        discount_total += discount
        itbis_total += tax_amt

        line_items.append({
            "line": idx + 1,
            "product_id": str(product.id),
            "name": product.name,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "discount_rate": item.discount_rate,
            "tax_rate": product.tax_rate,
            "total": net + tax_amt
        })

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
        "items": [item.dict() for item in payload.items]
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
        vendor_name=ctx.organization.name, # Issuer is our organization
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
        due_date=invoice_due_date
    )

    ctx.db.add(invoice)
    ctx.db.commit()
    ctx.db.refresh(invoice)

    invalidate_stats_cache(ctx.tenant_id, ctx.org_id)
    return invoice.to_dict()

@router.post("/invoices/{invoice_id}/transmit")
async def transmit_invoice(invoice_id: str, ctx: TenantContext = Depends(require_tenant)):
    invoice = ctx.db.query(Invoice).filter(
        Invoice.id == UUID(invoice_id),
        Invoice.tenant_id == ctx.tenant_id,
        Invoice.organization_id == ctx.org_id,
        Invoice.transaction_type == "income",
        Invoice.source_type == "billing"
    ).first()

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

    ecf_type = raw_data.get("ecf_type") or 32 # Default to Consumer e-CF 32 if unspecified

    # Resolve sequence range and increment
    sequence = ctx.db.query(EcfSequence).filter(
        EcfSequence.tenant_id == ctx.tenant_id,
        EcfSequence.organization_id == ctx.org_id,
        EcfSequence.ecf_type == ecf_type,
        EcfSequence.is_active.is_(True)
    ).first()

    if not sequence:
        raise HTTPException(
            status_code=400,
            detail=f"No hay una secuencia e-CF activa cargada para el tipo {ecf_type}."
        )

    if sequence.current_number >= sequence.end_number:
        raise HTTPException(
            status_code=400,
            detail=f"Rango de secuencia e-CF agotado para el tipo {ecf_type}."
        )

    # Increment sequence number
    sequence.current_number += 1
    
    is_electronic = sequence.prefix == "E"
    if is_electronic:
        if not ctx.organization.is_ecf_authorized:
            raise HTTPException(
                status_code=400,
                detail="Tu empresa no está verificada como emisor electrónico ante la DGII. Debes completar la verificación en los Ajustes."
            )
        encf = f"{sequence.prefix}{ecf_type:02d}{sequence.current_number:010d}"
    else:
        encf = f"{sequence.prefix}{ecf_type:02d}{sequence.current_number:08d}"

    due_date_str = sequence.expiry_date.isoformat() if sequence.expiry_date else "2028-12-31"

    # Fetch client details
    buyer_name = "Consumidor Final"
    buyer_rnc = "132109122"  # Fallback to test RNC if final consumer
    if raw_data.get("client_id"):
        client = ctx.db.query(Client).filter(
            Client.id == UUID(raw_data["client_id"]),
            Client.tenant_id == ctx.tenant_id,
            Client.organization_id == ctx.org_id
        ).first()
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

        item_details.append({
            "line": idx + 1,
            "name": item.get("name") or "Item",
            "quantity": qty,
            "price": price,
            "discount": disc_amt,
            "itbis": tax_amt
        })

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
                    "paymentAmount": total
                }
            ]
        },
        "sender": {
            "rnc": sender_rnc,
            "name": sender_name
        },
        "buyer": {
            "rnc": buyer_rnc,
            "name": buyer_name
        },
        "totals": {
            "subtotal": subtotal,
            "discount": 0.0,
            "taxableAmount": subtotal,
            "itbis": itbis_total,
            "total": total
        },
        "itemDetails": item_details
    }

    # If reference e-CF is provided (E33/E34)
    if raw_data.get("reference_ecf") and raw_data.get("reference_date"):
        alanube_payload["idDoc"]["referenceEcf"] = raw_data["reference_ecf"]
        alanube_payload["idDoc"]["referenceDate"] = raw_data["reference_date"]

    if not is_electronic:
        # Bypass Alanube API for traditional/physical NCFs (handled locally)
        raw_data.update({
            "security_code": "LOCAL_NCF",
            "track_id": "LOCAL_NCF",
            "legal_status": "ACCEPTED",
            "pdf_url": None,
            "xml_url": None,
            "qr_url": None
        })
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
                "xmlUrl": None
            }
        }

    # Call Alanube Service
    alanube_service = AlanubeService()
    try:
        # Emit document to Alanube API
        res = await alanube_service.emit_document(
            ecf_type=ecf_type,
            payload=alanube_payload
        )

        # Retrieve signed metadata links from response
        # Standard Alanube output returns: securityCode, trackId, legalStatus, pdfUrl, xmlUrl
        track_id = res.get("id") or res.get("trackId")
        pdf_url = res.get("pdfUrl") or res.get("pdf_url")
        xml_url = res.get("xmlUrl") or res.get("xml_url")
        security_code = res.get("securityCode") or res.get("security_code")
        legal_status = res.get("legalStatus") or res.get("legal_status") or "ACCEPTED"

        # Update raw metadata to include Alanube response details
        raw_data.update({
            "security_code": security_code,
            "track_id": track_id,
            "legal_status": legal_status,
            "pdf_url": pdf_url,
            "xml_url": xml_url,
            "qr_url": f"https://dgii.gov.do/consulta/ecf?rnc={sender_rnc}&encf={encf}&trackId={track_id}"
        })

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
            "alanube_response": res
        }

    except Exception as e:
        ctx.db.rollback()
        logger.exception("Error transmitting invoice to Alanube API")
        raise HTTPException(
            status_code=500,
            detail=f"Error en la comunicación con Alanube: {str(e)}"
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
