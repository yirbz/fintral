"""
AI Chat router — Grounded fiscal data chat endpoint.

POST /api/ai/chat
  Accepts: { "message": "user question" }
  Requires: TenantContext (auth cookie)
  Returns: { "response": "natural language answer" }

Rate-limited and quota-checked via PlanService.
"""
import logging

from fastapi import APIRouter, Depends

from app.dependencies.tenant import TenantContext, require_tenant
from app.services.ai_chat_service import AIChatService
from app.services.plan_service import PlanService, PlanLimitExceeded
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

chat_service = AIChatService()


class ConversationMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation: list[ConversationMessage] = []


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

    # ── Plan enforcement: check AI query quota and rate limit ────
    plan_svc = PlanService(ctx.db)
    try:
        # Per-minute rate limit
        plan_svc.check_rate_limit(ctx.org_id, "ai")
        # Monthly quota
        plan_svc.check_ai_query_limit(ctx.org_id, amount=1)
    except PlanLimitExceeded as e:
        usage = e.usage if hasattr(e, 'usage') else {}
        limit_val = usage.get("limit", 0)
        current = usage.get("used", 0)
        retry_after = usage.get("retry_after", 60)

        if "rate_limit" in e.reason:
            return ChatResponse(
                response=f"⏳ Demasiadas consultas. Espera {retry_after} segundos antes de preguntar de nuevo."
            )
        elif "ai_query_limit_exceeded" in e.reason:
            return ChatResponse(
                response=f"🔒 Has alcanzado el límite mensual de {limit_val} consultas del AI Chat. "
                f"Contrata un add-on o mejora tu plan en Configuración → Plan. "
                f"Usadas: {current}/{limit_val}"
            )
        else:
            return ChatResponse(
                response="❌ No se pudo procesar la consulta. Verifica tu plan de suscripción."
            )

    # ── Process the AI query with conversation context ──────────
    conversation = [{"role": m.role, "content": m.content} for m in body.conversation]
    result = chat_service.process_message(body.message.strip(), ctx, conversation=conversation)

    # ── Record usage ────────────────────────────────────────────
    plan_svc.record_ai_query(ctx.org_id)

    return ChatResponse(response=result["response"])
