import abc
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Alert:
    title: str
    message: str
    severity: str = "warning"
    source: str = "system"
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseAlertHook(abc.ABC):
    @abc.abstractmethod
    async def send(self, alert: Alert) -> None: ...


class LoggingAlertHook(BaseAlertHook):
    async def send(self, alert: Alert) -> None:
        logger.warning(
            "ALERT [%s] %s: %s | metadata=%s",
            alert.severity.upper(),
            alert.title,
            alert.message,
            alert.metadata,
        )


class TelegramAlertHook(BaseAlertHook):
    """Sends alert messages to a Telegram chat via a bot."""

    API_BASE = "https://api.telegram.org/bot"

    async def send(self, alert: Alert) -> None:
        from app.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
            logger.debug("TelegramAlertHook: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping.")
            return

        text = (
            f"🚨 *{alert.title}*\n"
            f"_{alert.severity.upper()}_\n\n"
            f"{alert.message}\n"
        )
        if alert.metadata:
            lines = "\n".join(f"• `{k}`: {v}" for k, v in alert.metadata.items())
            text += f"\n{lines}"

        url = f"{self.API_BASE}{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "Markdown",
        }

        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.error(
                    "Telegram API error: %s %s", resp.status_code, resp.text
                )


class EmailAlertHook(BaseAlertHook):
    async def send(self, alert: Alert) -> None:
        import asyncio
        from app.config import ADMIN_EMAIL
        from app.services.email_service import send_admin_alert_email

        if not ADMIN_EMAIL:
            logger.warning("EmailAlertHook: ADMIN_EMAIL not set, skipping email alert.")
            return

        await asyncio.to_thread(
            send_admin_alert_email,
            email=ADMIN_EMAIL,
            title=alert.title,
            message=alert.message,
            severity=alert.severity,
            source=alert.source,
            metadata=alert.metadata,
        )


class AlertManager:
    def __init__(self) -> None:
        self._hooks: list[BaseAlertHook] = []

    def register(self, hook: BaseAlertHook) -> None:
        self._hooks.append(hook)
        logger.info("AlertHook registered: %s", type(hook).__name__)

    def unregister(self, hook: BaseAlertHook) -> None:
        self._hooks.remove(hook)

    async def dispatch(self, alert: Alert) -> None:
        logger.warning(
            "ALERT [%s] %s: %s | metadata=%s",
            alert.severity.upper(),
            alert.title,
            alert.message,
            alert.metadata,
        )
        for hook in self._hooks:
            try:
                await hook.send(alert)
            except Exception as exc:
                logger.exception("AlertHook %s failed: %s", type(hook).__name__, exc)


alert_manager = AlertManager()
alert_manager.register(LoggingAlertHook())
alert_manager.register(EmailAlertHook())
alert_manager.register(TelegramAlertHook())

