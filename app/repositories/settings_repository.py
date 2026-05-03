from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Setting, UserSetting


class SettingsRepository:
    def list_org_settings(self, db: Session, tenant_id: UUID, org_id: UUID) -> list[Setting]:
        return (
            db.query(Setting)
            .filter(Setting.tenant_id == tenant_id, Setting.organization_id == org_id)
            .all()
        )

    def list_user_settings(self, db: Session, user_id: UUID) -> list[UserSetting]:
        return db.query(UserSetting).filter(UserSetting.user_id == user_id).all()

    def get_org_setting(self, db: Session, tenant_id: UUID, org_id: UUID, key: str) -> Optional[Setting]:
        return (
            db.query(Setting)
            .filter(
                Setting.tenant_id == tenant_id,
                Setting.organization_id == org_id,
                Setting.key == key,
            )
            .first()
        )

    def get_user_setting(self, db: Session, user_id: UUID, key: str) -> Optional[UserSetting]:
        return (
            db.query(UserSetting)
            .filter(UserSetting.user_id == user_id, UserSetting.key == key)
            .first()
        )

    def upsert_user_setting(
        self,
        db: Session,
        user_id: UUID,
        key: str,
        value: str,
        value_type: str,
        category: str,
        description: str,
    ) -> UserSetting:
        setting = self.get_user_setting(db, user_id, key)
        if setting:
            setting.value = value
            setting.type = value_type
            setting.category = category
            setting.description = description
            return setting

        setting = UserSetting(
            user_id=user_id,
            key=key,
            value=value,
            type=value_type,
            category=category,
            description=description,
        )
        db.add(setting)
        return setting
