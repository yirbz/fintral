"""TelegramNotifier — sends billing notifications to admin Telegram chat."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app import config as settings

logger = logging.getLogger(__name__)


class TelegramNotifier:
    """Sends formatted billing notifications to a Telegram chat via bot.

    Uses the Telegram Bot API with InlineKeyboardMarkup for quick actions.
    Falls back to logging if TELEGRAM_BOT_TOKEN is not configured.
    """

    def __init__(self):
        self.bot_token = settings.TELEGRAM_BOT_TOKEN
        self.chat_id = settings.TELEGRAM_CHAT_ID
        self.api_base = f"https://api.telegram.org/bot{self.bot_token}" if self.bot_token else None

    def _is_configured(self) -> bool:
        return bool(self.bot_token and self.chat_id)

    async def _send_message(
        self,
        text: str,
        parse_mode: str = "HTML",
        reply_markup: dict[str, Any] | None = None,
    ) -> bool:
        """Send a message to the configured Telegram chat."""
        if not self._is_configured():
            logger.info(f"[Telegram] Not configured. Would send: {text[:100]}...")
            return False

        payload: dict[str, Any] = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(f"{self.api_base}/sendMessage", json=payload)
                resp.raise_for_status()
                result = resp.json()
                if result.get("ok"):
                    logger.info("[Telegram] Message sent successfully")
                    return True
                else:
                    logger.warning(f"[Telegram] API error: {result}")
                    return False
        except Exception as e:
            logger.error(f"[Telegram] Failed to send message: {e}")
            return False

    def _payment_proof_text(
        self,
        org_name: str,
        amount_dop: float,
        plan_name: str,
        user_email: str,
        proof_id: str,
    ) -> str:
        return (
            f"💳 NUEVA TRANSFERENCIA BANCARIA\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"Organización: {org_name}\n"
            f"Plan: {plan_name}\n"
            f"Monto: RD$ {amount_dop:,.2f}\n"
            f"Usuario: {user_email}\n"
            f"ID: {proof_id[:8]}...\n"
            f"─────────────────────────"
        )

    def _payment_proof_keyboard(self, proof_id: str) -> dict[str, Any]:
        return {
            "inline_keyboard": [
                [
                    {"text": "✅ Verificar", "callback_data": f"verify:{proof_id}"},
                    {"text": "❌ Rechazar", "callback_data": f"reject:{proof_id}"},
                ],
                [
                    {"text": "👁 Ver detalle", "callback_data": f"view:{proof_id}"},
                ],
            ]
        }

    async def notify_payment_proof(
        self,
        org_name: str,
        amount_dop: float,
        plan_name: str,
        user_email: str,
        proof_id: str,
    ) -> bool:
        """Notify admins about a new bank transfer payment proof."""
        text = self._payment_proof_text(org_name, amount_dop, plan_name, user_email, proof_id)
        keyboard = self._payment_proof_keyboard(proof_id)
        return await self._send_message(text, reply_markup=keyboard)

    async def notify_payment_proof_verified(
        self,
        org_name: str,
        amount_dop: float,
        admin_name: str,
    ) -> bool:
        """Notify that a payment proof was verified by an admin."""
        text = (
            f"✅ TRANSFERENCIA VERIFICADA\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"Organización: {org_name}\n"
            f"Monto: RD$ {amount_dop:,.2f}\n"
            f"Verificado por: {admin_name}\n"
            f"─────────────────────────"
        )
        return await self._send_message(text)

    async def notify_payment_proof_rejected(
        self,
        org_name: str,
        amount_dop: float,
        admin_name: str,
        reason: str | None = None,
    ) -> bool:
        """Notify that a payment proof was rejected by an admin."""
        text = (
            f"❌ TRANSFERENCIA RECHAZADA\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"Organización: {org_name}\n"
            f"Monto: RD$ {amount_dop:,.2f}\n"
            f"Rechazado por: {admin_name}\n"
        )
        if reason:
            text += f"Motivo: {reason}\n"
        text += "─────────────────────────"
        return await self._send_message(text)

    async def notify_card_payment(
        self,
        org_name: str,
        amount_dop: float,
        plan_name: str,
    ) -> bool:
        """Notify admins about a successful card payment."""
        text = (
            f"💳 PAGO CON TARJETA EXITOSO\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"Organización: {org_name}\n"
            f"Plan: {plan_name}\n"
            f"Monto: RD$ {amount_dop:,.2f}\n"
            f"─────────────────────────"
        )
        return await self._send_message(text)

    async def notify_subscription_ending(
        self,
        org_name: str,
        plan_name: str,
        days_remaining: int,
    ) -> bool:
        """Notify that a subscription is about to end."""
        text = (
            f"⚠️ SUSCRIPCIÓN PRÓXIMA A VENCER\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"Organización: {org_name}\n"
            f"Plan: {plan_name}\n"
            f"Días restantes: {days_remaining}\n"
            f"─────────────────────────"
        )
        return await self._send_message(text)

    async def notify_charge_failed(
        self,
        org_name: str,
        amount_dop: float,
        reason: str,
        user_email: str,
    ) -> bool:
        """Notify that a recurring charge failed."""
        text = (
            f"❌ COBRO RECURRENTE FALLIDO\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"Organización: {org_name}\n"
            f"Usuario: {user_email}\n"
            f"Monto: RD$ {amount_dop:,.2f}\n"
            f"Razón: {reason}\n"
            f"─────────────────────────\n"
            f"Se requiere atención de soporte."
        )
        return await self._send_message(text)

    async def notify_test(self) -> bool:
        """Send a test message to verify configuration."""
        text = (
            f"🔔 Notificación de prueba\n"
            f"━━━━━━━━━━━━━━━━━━━\n"
            f"El bot de Telegram está configurado correctamente.\n"
            f"Ambiente: {settings.ENVIRONMENT}\n"
            f"Timestamp: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"─────────────────────────"
        )
        return await self._send_message(text)
