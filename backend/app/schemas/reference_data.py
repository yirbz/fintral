from typing import Any, Optional

from pydantic import BaseModel


class ReferenceDataCreate(BaseModel):
    domain: str
    code: str
    label_es: str
    description: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True
    metadata: Optional[dict[str, Any]] = None


class ReferenceDataUpdate(BaseModel):
    code: Optional[str] = None
    label_es: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None


class ReferenceDataResponse(BaseModel):
    id: str
    domain: str
    code: str
    label_es: str
    description: Optional[str] = None
    sort_order: int
    is_active: bool
    metadata: Optional[Any] = None
