"""
AI Chat router — Grounded fiscal data chat endpoint.

POST /api/ai/chat
  Accepts: { "message": "user question" }
  Requires: TenantContext (auth cookie)
  Returns: { "response": "natural language answer" }
"""

import logging

from fastapi import APIRouter, Depends

from app.dependencies.tenant import TenantContext, require_tenant
from app.services.ai_chat_service import AIChatService
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

chat_service = AIChatService()


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    """
    Process a natural language question and return a grounded response
    based on real fiscal data from the database.
    """
    if not body.message or not body.message.strip():
        return ChatResponse(
            response="Por favor escribe una pregunta. Por ejemplo:\n"
            "• ¿Cuál es el resumen de facturas del mes?\n"
            "• ¿A qué proveedores hay que pagar?\n"
            "• ¿Cuál fue el último reporte DGII?"
        )

    result = chat_service.process_message(body.message.strip(), ctx)
    return ChatResponse(response=result["response"])
