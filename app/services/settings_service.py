import os
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.repositories import SettingsRepository
from app.schemas import SettingUpdate
from app.models import User
from app.core.redis import invalidate_cache_pattern


class SettingsService:
    def __init__(self, repo: Optional[SettingsRepository] = None):
        self.repo = repo or SettingsRepository()

    @staticmethod
    def _typed_value(value: str, value_type: str):
        if value_type == "boolean":
            return str(value).lower() == "true"
        if value_type == "int":
            try:
                return int(value)
            except Exception:  # noqa: BLE001
                return 0
        if value_type == "float":
            try:
                return float(value)
            except Exception:  # noqa: BLE001
                return 0.0
        return value

    @staticmethod
    def _to_storage_value(value, value_type: str) -> str:
        if isinstance(value, bool) or value_type == "boolean":
            return str(value).lower()
        return str(value)

    def resolve_setting(
        self,
        db: Session,
        key: str,
        *,
        user: Optional[User] = None,
        tenant_id: Optional[UUID] = None,
        org_id: Optional[UUID] = None,
        env_key: Optional[str] = None,
        default: Optional[str] = None,
    ) -> Optional[str]:
        # 1) User override
        if user:
            user_setting = self.repo.get_user_setting(db, user.id, key)
            if user_setting and user_setting.value not in (None, ""):
                return user_setting.value

        # 2) Organization setting
        if tenant_id and org_id:
            org_setting = self.repo.get_org_setting(db, tenant_id, org_id, key)
            if org_setting and org_setting.value not in (None, ""):
                return org_setting.value

        # 3) Env fallback
        if env_key:
            env_value = os.getenv(env_key)
            if env_value not in (None, ""):
                return env_value

        # 4) Default
        return default

    def get_settings_payload(self, db: Session, user: User, tenant_id: UUID, org_id: UUID) -> dict:
        settings = self.repo.list_org_settings(db, tenant_id, org_id)
        user_settings = self.repo.list_user_settings(db, user.id)
        user_settings_map = {s.key: s for s in user_settings}

        payload: dict = {}

        for setting in settings:
            category = setting.category or "general"
            payload.setdefault(category, [])

            resolved = user_settings_map.get(setting.key) or setting
            value = self._typed_value(resolved.value, resolved.type or setting.type or "string")

            payload[category].append(
                {
                    "key": setting.key,
                    "value": value,
                    "type": resolved.type or setting.type,
                    "description": resolved.description or setting.description,
                    "category": resolved.category or setting.category,
                    "source": "user" if setting.key in user_settings_map else "default",
                }
            )

        known_keys = {s.key for s in settings}
        for setting in user_settings:
            if setting.key in known_keys:
                continue
            category = setting.category or "general"
            payload.setdefault(category, [])
            payload[category].append(
                {
                    "key": setting.key,
                    "value": self._typed_value(setting.value, setting.type or "string"),
                    "type": setting.type,
                    "description": setting.description or "Configuración personalizada",
                    "category": category,
                    "source": "user",
                }
            )

        return payload

    def update_settings(self, db: Session, user: User, tenant_id: UUID, org_id: UUID, updates: list[SettingUpdate]) -> int:
        updated_count = 0

        for update in updates:
            default_setting = self.repo.get_org_setting(db, tenant_id, org_id, update.key)
            value_type = update.type or (default_setting.type if default_setting else "string")
            category = update.category or (default_setting.category if default_setting else "general")
            description = (
                default_setting.description
                if default_setting
                else f"Configuración creada automáticamente: {update.key}"
            )

            self.repo.upsert_user_setting(
                db,
                user_id=user.id,
                key=update.key,
                value=self._to_storage_value(update.value, value_type),
                value_type=value_type,
                category=category,
                description=description,
            )
            updated_count += 1

        db.commit()
        invalidate_cache_pattern("settings:*")
        invalidate_cache_pattern("stats:*")
        return updated_count
