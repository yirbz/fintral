import base64
import logging
from typing import Optional

import requests
from sqlalchemy.orm import Session

from app.config import (
    EVOLUTION_API_KEY,
    EVOLUTION_API_URL,
    EVOLUTION_INSTANCE_NAME,
    EVOLUTION_INSTANCE_TOKEN,
)
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)


class EvolutionService:
    def __init__(self, settings_service: Optional[SettingsService] = None, whatsapp_service=None):
        self.settings_service = settings_service or SettingsService()
        self.whatsapp_service = whatsapp_service

    def _resolve_config(self, db: Session, org_id: Optional[int], user=None) -> dict:
        return {
            "url": self.settings_service.resolve_setting(
                db,
                "evolution_url",
                user=user,
                org_id=org_id,
                env_key="EVOLUTION_API_URL",
                default="http://localhost:8080",
            ),
            "apikey": self.settings_service.resolve_setting(
                db,
                "evolution_apikey",
                user=user,
                org_id=org_id,
                env_key="EVOLUTION_API_KEY",
                default="",
            ),
            "instance": self.settings_service.resolve_setting(
                db,
                "evolution_instance",
                user=user,
                org_id=org_id,
                env_key="EVOLUTION_INSTANCE_NAME",
                default="default",
            ),
            "authorized_number": self.settings_service.resolve_setting(
                db,
                "authorized_whatsapp_number",
                user=user,
                org_id=org_id,
                env_key="AUTHORIZED_WHATSAPP_NUMBER",
                default="15555550100",
            ),
        }

    async def process_webhook(self, payload: dict, db: Session) -> dict:
        return await self.whatsapp_service.process_webhook(payload, db)

    async def send_message(
        self,
        instance_name: str,
        phone: str,
        message: str,
        *,
        evolution_api_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> dict:
        url = evolution_api_url or EVOLUTION_API_URL
        key = api_key if api_key is not None else EVOLUTION_API_KEY

        headers = {"Content-Type": "application/json"}
        if key:
            headers["apikey"] = key

        payload = {"number": phone, "text": message}

        try:
            response = requests.post(
                f"{url}/message/sendText/{instance_name}",
                json=payload,
                headers=headers,
                timeout=10,
            )
            if response.status_code == 200:
                return {"status": "success", "message": "Mensaje enviado exitosamente", "response": response.json()}
            return {
                "status": "error",
                "message": f"Error al enviar mensaje: {response.status_code}",
                "details": response.text,
            }
        except Exception as exc:  # noqa: BLE001
            return {"status": "error", "error": str(exc)}

    async def get_instance_status(self, instance_name: str, *, evolution_api_url: Optional[str] = None, api_key: Optional[str] = None) -> dict:
        url = evolution_api_url or EVOLUTION_API_URL
        key = api_key if api_key is not None else EVOLUTION_API_KEY

        headers = {"apikey": key} if key else {}
        try:
            response = requests.get(f"{url}/instance/connectionState/{instance_name}", headers=headers, timeout=10)
            if response.status_code == 200:
                return {"status": "success", "instance_status": response.json()}
            return {"status": "error", "message": f"Error obteniendo estado: {response.status_code}"}
        except Exception as exc:  # noqa: BLE001
            return {"status": "error", "error": str(exc)}

    def security_config(self, authorized_number: str) -> dict:
        return {
            "status": "success",
            "security_enabled": True,
            "authorized_number": authorized_number,
            "description": "Solo el número autorizado puede enviar facturas al sistema",
            "note": "Los mensajes de otros números serán automáticamente rechazados",
        }

    def proxy_status(self, db: Session, org_id: int, user=None) -> dict:
        config = self._resolve_config(db, org_id, user=user)
        if not config["url"] or not config["apikey"] or not config["instance"]:
            return {"status": "not_configured"}

        try:
            response = requests.get(
                f"{config['url']}/instance/connectionState/{config['instance']}",
                headers={"apikey": config["apikey"]},
                timeout=5,
            )
            if response.status_code == 200:
                return response.json()
            if response.status_code == 404:
                return {"status": "instance_not_found"}
            return {"status": "error", "code": response.status_code}
        except Exception as exc:  # noqa: BLE001
            return {"status": "error", "detail": str(exc)}

    def proxy_qr(self, db: Session, org_id: int, user=None) -> dict:
        config = self._resolve_config(db, org_id, user=user)
        if not config["url"] or not config["apikey"]:
            return {"error": "Configuración incompleta"}

        try:
            response = requests.get(
                f"{config['url']}/instance/connect/{config['instance']}",
                headers={"apikey": config["apikey"]},
                timeout=10,
            )
            if response.status_code == 200:
                return response.json()
            return {"error": "Error obteniendo QR", "details": response.text}
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)}

    def proxy_create(self, db: Session, org_id: int, user=None) -> dict:
        config = self._resolve_config(db, org_id, user=user)
        instance_token = EVOLUTION_INSTANCE_TOKEN
        if not instance_token:
            return {"error": "EVOLUTION_INSTANCE_TOKEN no configurado"}

        payload = {
            "instanceName": config["instance"],
            "token": instance_token,
            "qrcode": True,
        }

        try:
            response = requests.post(
                f"{config['url']}/instance/create",
                json=payload,
                headers={"apikey": config["apikey"], "Content-Type": "application/json"},
                timeout=15,
            )
            return response.json()
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)}

    def get_base64_from_evolution_api(
        self,
        message_key_id: str,
        *,
        instance_name: Optional[str] = None,
        evolution_api_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> Optional[str]:
        url = evolution_api_url or EVOLUTION_API_URL
        key = api_key if api_key is not None else EVOLUTION_API_KEY
        instance = instance_name or EVOLUTION_INSTANCE_NAME

        if not url or not key or not instance:
            logger.error("Evolution API URL, API Key o Instance Name no configurados")
            return None

        headers = {"apikey": key, "Content-Type": "application/json"}
        payload = {"message": {"key": {"id": message_key_id}}, "convertToMp4": False}

        try:
            response = requests.post(
                f"{url}/chat/getBase64FromMediaMessage/{instance}",
                json=payload,
                headers=headers,
                timeout=30,
            )

            if response.status_code not in (200, 201):
                logger.error("Error en Evolution API getBase64: %s - %s", response.status_code, response.text[:200])
                return None

            result = response.json()
            base64_data = None

            if isinstance(result, dict):
                for field in ["base64", "mediaBase64", "media", "data", "content"]:
                    if result.get(field):
                        base64_data = result[field]
                        break
                if not base64_data and isinstance(result.get("message"), dict):
                    for field in ["base64", "mediaBase64", "media", "data", "content"]:
                        if result["message"].get(field):
                            base64_data = result["message"][field]
                            break
            elif isinstance(result, str):
                base64_data = result

            if not base64_data:
                return None

            try:
                base64.b64decode(base64_data)
                return base64_data
            except Exception:  # noqa: BLE001
                return None

        except Exception as exc:  # noqa: BLE001
            logger.error("Error obteniendo base64 desde Evolution API: %s", exc)
            return None

    def build_test_get_base64_response(self, message_id: str, instance_name: Optional[str] = None) -> dict:
        instance = instance_name or EVOLUTION_INSTANCE_NAME
        base64_result = self.get_base64_from_evolution_api(message_id, instance_name=instance)

        if not base64_result:
            return {
                "status": "error",
                "message": "No se pudo obtener base64 desde Evolution API",
                "message_id": message_id,
                "instance_name": instance,
            }

        try:
            decoded = base64.b64decode(base64_result)
            return {
                "status": "success",
                "message": "Base64 obtenido exitosamente",
                "base64_length": len(base64_result),
                "decoded_bytes": len(decoded),
                "preview": base64_result[:100] + "..." if len(base64_result) > 100 else base64_result,
                "instance_used": instance,
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "status": "error",
                "message": "Base64 obtenido pero inválido",
                "error": str(exc),
                "raw_response": base64_result[:200] + "..." if len(base64_result) > 200 else base64_result,
            }
