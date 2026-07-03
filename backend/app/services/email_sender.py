from __future__ import annotations

import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class EmailSender(ABC):
    @abstractmethod
    def send(
        self,
        from_: str,
        to: list[str],
        subject: str,
        html: str,
        reply_to: str | None = None,
    ) -> dict | None: ...


class ResendEmailSender(EmailSender):
    def send(
        self,
        from_: str,
        to: list[str],
        subject: str,
        html: str,
        reply_to: str | None = None,
    ) -> dict | None:
        import resend
        from app.config import RESEND_API_KEY

        if not RESEND_API_KEY:
            logger.warning("Resend not configured — skipping email to %s", to)
            return None

        resend.api_key = RESEND_API_KEY
        params: dict = {"from": from_, "to": to, "subject": subject, "html": html}
        if reply_to:
            params["reply_to"] = reply_to

        try:
            response = resend.Emails.send(params)
            logger.info("Email sent to %s — id=%s", to, response.get("id"))
            return response
        except Exception as e:
            logger.warning("Failed to send email to %s: %s", to, e)
            return None


class FakeEmailSender(EmailSender):
    def send(
        self,
        from_: str,
        to: list[str],
        subject: str,
        html: str,
        reply_to: str | None = None,
    ) -> dict | None:
        logger.info("[FAKE EMAIL] To: %s | Subject: %s", to, subject)
        return {"id": "00000000-0000-0000-0000-000000000000"}


class NoopEmailSender(EmailSender):
    def send(
        self,
        from_: str,
        to: list[str],
        subject: str,
        html: str,
        reply_to: str | None = None,
    ) -> dict | None:
        return {"id": "noop"}
