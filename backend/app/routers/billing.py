import json
import logging
import re
from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, EmailStr

from app.database import get_db
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

class EcfSequenceUpdate(BaseModel):
    prefix: Optional[str] = None
    start_number: Optional[int] = None
    end_number: Optional[int] = None
    current_number: Optional[int] = None
    expiry_date: Optional[date] = None
    is_active: Optional[bool] = None

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
    client_name = "Consumidor Final"
    client_tax_id = None
    if payload.client_id:
        client = ctx.db.query(Client).filter(
            Client.id == UUID(payload.client_id),
            Client.tenant_id == ctx.tenant_id,
            Client.organization_id == ctx.org_id
        ).first()
        if not client:
            raise HTTPException(status_code=422, detail="Cliente no encontrado")
        client_name = client.name
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
        "payment_method": payload.payment_method,
        "notes": payload.notes,
        "reference_ecf": payload.reference_ecf,
        "reference_date": payload.reference_date.isoformat() if payload.reference_date else None,
        "items": [item.dict() for item in payload.items]
    }

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
        raw_extracted_data=json.dumps(raw_data, ensure_ascii=False)
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
    encf = f"{sequence.prefix}{ecf_type:02d}{sequence.current_number:010d}"
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
