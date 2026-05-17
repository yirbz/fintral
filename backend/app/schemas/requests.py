from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class LineItem(BaseModel):
    description: str = ""
    quantity: float = 1.0
    unit_price: float = 0.0
    subtotal: float = 0.0


class ManualInvoiceCreate(BaseModel):
    vendor_name: str
    invoice_number: str
    invoice_date: str = ""  # YYYY-MM-DD
    total_amount: float = 0.0
    tax_amount: float | None = None
    currency: str = "DOP"
    transaction_type: str = "expense"
    category: str | None = None
    description: str | None = None
    vendor_tax_id: str | None = None
    vendor_country: str | None = None
    goods_services_type: str | None = None
    line_items: list[LineItem] = []


class ChatRequest(BaseModel):
    query: str


class SettingUpdate(BaseModel):
    key: str
    value: Union[str, int, float, bool]
    category: Optional[str] = "general"
    type: Optional[str] = "string"


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str = ""
    company_name: str = ""
    tax_id: str = ""
    phone: str = ""


class VerifyCodeRequest(BaseModel):
    email: str
    code: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    password: str


class BulkActionRequest(BaseModel):
    invoice_ids: List[str]  # UUID strings


class ExportRequest(BaseModel):
    invoice_ids: List[str]  # UUID strings
    format: str = "csv"


class WebhookPushRequest(BaseModel):
    invoice_ids: List[str]  # UUID strings
    event: Optional[str] = "invoices.exported"


class WebhookCreate(BaseModel):
    url: str
    description: Optional[str] = None
    events: List[str]


class EvolutionContact(BaseModel):
    profile: Optional[Dict[str, str]] = None
    wa_id: str


class EvolutionMessage(BaseModel):
    from_: str = Field(alias="from")
    id: str
    timestamp: str
    type: str
    text: Optional[Dict[str, str]] = None
    image: Optional[Dict[str, Any]] = None
    document: Optional[Dict[str, Any]] = None


class EvolutionWebhookValue(BaseModel):
    messaging_product: str = "whatsapp"
    metadata: Dict[str, Any]
    contacts: Optional[List[EvolutionContact]] = None
    messages: Optional[List[EvolutionMessage]] = None


class EvolutionWebhookChange(BaseModel):
    field: str
    value: EvolutionWebhookValue


class EvolutionWebhookEntry(BaseModel):
    id: str
    changes: List[EvolutionWebhookChange]


class EvolutionWebhook(BaseModel):
    object: str = "whatsapp_business_account"
    entry: List[EvolutionWebhookEntry]
