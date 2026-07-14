import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import AI_ASSISTANT_KEY, AI_ASSISTANT_MODEL
from app.dependencies.tenant import TenantContext, require_tenant
from app.services.websocket import websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/support", tags=["support"])

SUPPORT_SYSTEM_PROMPT = """Eres un asistente de soporte técnico de Fintral, una plataforma de facturación electrónica y cumplimiento fiscal para República Dominicana.

## SOBRE LA PLATAFORMA:
Fintral es un HUB Contable que procesa facturas desde cualquier fuente (DGII e-CF XML, imágenes, PDFs, Excel) mediante un pipeline multimodal. Actúa como auditor de salud financiera para contadores que manejan múltiples clientes.

## CAPACIDADES DE LA PLATAFORMA:
- **Hub Contable**: Carga centralizada de facturas desde WhatsApp, email o web para proveedores que NO usan Fintral
- **Pipeline de extracción**: OCR (imágenes), PDF parsing, XML/e-CF parsing, XLSX processing
- **Clasificación automática**: Categorización DGII por proveedor con 3 capas (reglas, directorio global, LLM)
- **Cumplimiento DGII**: Validación RNC/NCF, cálculo ITBIS, exportación Formatos 606/607/608
- **Chat financiero**: Asistente IA para consultas sobre facturas, pagos, ITBIS y reportes
- **Notificaciones en tiempo real**: WebSocket para eventos del pipeline
- **Multi-facturador**: Próximamente emisión digital de facturas

## GUÍA DE USO:
- Para subir facturas: ve a Pipeline, arrastra archivos o usa WhatsApp
- Para ver facturas procesadas: ve a Facturas
- Para reportes DGII: ve a DGII → Exportaciones
- Para configurar la empresa: ve a Ajustes

## REGLAS:
1. Responde en español, sé amable y profesional
2. Si no sabes algo, dilo honestamente y ofrece contactar al equipo de soporte
3. No inventes información sobre la plataforma
4. Sé conciso y directo
5. Si el usuario necesita contacto humano o el problema es complejo, dile que puede escalarlo y pregúntale si desea contactar al equipo de soporte
"""


class SupportChatRequest(BaseModel):
    message: str


class SupportChatResponse(BaseModel):
    response: str
    needs_escalation: bool = False


class EscalationRequest(BaseModel):
    subject: str
    message: str
    email: Optional[str] = None


class EscalationResponse(BaseModel):
    success: bool
    message: str


@router.post("/chat", response_model=SupportChatResponse)
async def support_chat(
    body: SupportChatRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    if not body.message or not body.message.strip():
        return SupportChatResponse(
            response="Hola, soy el asistente de soporte de Fintral. ¿En qué puedo ayudarte?\n\n"
            "Puedes preguntarme sobre:\n"
            "• Cómo subir y procesar facturas\n"
            "• Formatos DGII (606/607/608)\n"
            "• El pipeline de extracción\n"
            "• Configuración de la cuenta\n"
            "• Solución de problemas\n\n"
            "Si necesitas ayuda más especializada, puedo escalar tu caso a un agente humano."
        )

    try:
        response_text = _call_llm(body.message.strip(), SUPPORT_SYSTEM_PROMPT)
        needs_escalation = _detect_escalation(response_text, body.message)

        return SupportChatResponse(
            response=response_text or "Lo siento, no pude procesar tu consulta. ¿Quieres que escale tu caso a un agente humano?",
            needs_escalation=needs_escalation,
        )
    except Exception as e:
        logger.error("Support chat error: %s", e)
        return SupportChatResponse(
            response="Ocurrió un error interno. Por favor, intenta de nuevo o contacta al soporte directamente.",
            needs_escalation=True,
        )


@router.post("/chat/escalate", response_model=EscalationResponse)
async def escalate_to_human(
    body: EscalationRequest,
    ctx: TenantContext = Depends(require_tenant),
):
    try:
        org_name = ctx.organization.name if ctx.organization else "Desconocida"
        user_name = ctx.user.full_name if ctx.user else "Desconocido"
        user_email = body.email or (ctx.user.email if ctx.user else "No especificado")

        notification = {
            "type": "support_escalation",
            "title": f"Escalamiento de soporte: {body.subject}",
            "message": f"Usuario: {user_name} ({user_email})\n"
                       f"Organización: {org_name}\n"
                       f"Asunto: {body.subject}\n"
                       f"Mensaje: {body.message}",
            "organization": org_name,
            "user": user_name,
            "email": user_email,
            "subject": body.subject,
            "details": body.message,
        }

        await websocket_manager.broadcast(notification)

        # Send Telegram notification for support escalation
        try:
            from app.services.telegram_notifier import TelegramSupportNotifier
            notifier = TelegramSupportNotifier()
            await notifier.notify_support_escalation(
                user_name=user_name,
                user_email=user_email,
                org_name=org_name,
                subject=body.subject,
                message=body.message,
            )
        except Exception as telegram_err:
            logger.warning("Failed to send Telegram support escalation: %s", telegram_err)

        logger.info(
            "Support escalation from org=%s user=%s subject=%s",
            ctx.org_id, ctx.user.id if ctx.user else "?", body.subject,
        )

        return EscalationResponse(
            success=True,
            message="Tu solicitud ha sido enviada al equipo de soporte. Te responderemos pronto.",
        )
    except Exception as e:
        logger.error("Escalation error: %s", e)
        return EscalationResponse(
            success=False,
            message="Error al enviar la solicitud. Intenta de nuevo o escribe a support@fintral.app",
        )


def _call_llm(prompt: str, system_prompt: str = "") -> Optional[str]:
    if not AI_ASSISTANT_KEY or AI_ASSISTANT_KEY.startswith("demo"):
        logger.warning("No valid API key for support chat")
        return None

    if AI_ASSISTANT_KEY.startswith("AIza"):
        return _call_gemini(prompt, system_prompt)

    try:
        import openai
        client = openai.OpenAI(api_key=AI_ASSISTANT_KEY)
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = client.chat.completions.create(
            model=os.getenv("AI_ASSISTANT_MODEL", "gpt-4o-mini"),
            messages=messages,
            temperature=0.3,
            max_tokens=800,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error("LLM call failed: %s", e)
        return None


def _call_gemini(prompt: str, system_prompt: str = "") -> Optional[str]:
    import requests

    model = AI_ASSISTANT_MODEL or "gemini-2.0-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={AI_ASSISTANT_KEY}"

    contents = []
    if system_prompt:
        contents.append({"role": "user", "parts": [{"text": system_prompt}]})
        contents.append({"role": "model", "parts": [{"text": "Entendido. Estoy listo para ayudar."}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    payload = {"contents": contents}

    try:
        resp = requests.post(url, json=payload, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text")
            )
        logger.error("Gemini error: %s %s", resp.status_code, resp.text[:200])
        return None
    except Exception as e:
        logger.error("Gemini call failed: %s", e)
        return None


def _detect_escalation(response: Optional[str], user_message: str) -> bool:
    if not response:
        return True
    escalation_keywords = [
        "contactar al equipo", "escalar", "agente humano",
        "hablar con un humano", "soporte humano",
        "no puedo resolver", "no estoy seguro",
    ]
    user_lower = user_message.lower()
    if any(kw in user_lower for kw in ["humano", "agente", "escalar", "contactar", "soporte humano", "persona"]):
        return True
    response_lower = response.lower()
    if any(kw in response_lower for kw in escalation_keywords):
        return True
    return False
