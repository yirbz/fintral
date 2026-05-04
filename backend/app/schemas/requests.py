from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str


class SettingUpdate(BaseModel):
    key: str
    value: Union[str, int, float, bool]
    category: Optional[str] = "general"
    type: Optional[str] = "string"


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
