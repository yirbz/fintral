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
