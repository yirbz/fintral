from app.services.cost_control import CostControlService
from app.services.export import ExportService
from app.services.llm_processor import LLMInvoiceProcessor
from app.services.webhook_sender import WebhookSender
from app.services.whatsapp import WhatsAppService

openai_processor = LLMInvoiceProcessor()
whatsapp_service = WhatsAppService()
cost_control = CostControlService()
webhook_sender = WebhookSender()
export_service = ExportService()
