import json
import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

_ACTOR_ACTIONS = {
    "invoice.created", "invoice.uploaded", "invoice.processed",
    "invoice.exported", "invoice.deleted", "invoice.bulk_cancelled",
    "invoice.restored", "invoice.bulk_restored", "invoice.cancelled",
    "invoice.uncancelled", "invoice.permanent_deleted",
    "invoice.bulk_permanent_deleted", "invoice.updated",
    "integration.connected", "integration.disconnected",
    "integration.pushed", "export.downloaded",
    "settings.updated", "webhook.created", "webhook.deleted",
    "user.login", "user.logout", "user.created",
}

_VISIBLE_TO_CLIENT = {
    "invoice.created", "invoice.uploaded", "invoice.processed",
    "invoice.exported", "invoice.deleted", "invoice.bulk_cancelled",
    "invoice.restored", "invoice.bulk_restored", "invoice.cancelled",
    "invoice.uncancelled", "invoice.updated",
    "invoice.permanent_deleted", "invoice.bulk_permanent_deleted",
    "integration.connected", "integration.disconnected",
    "integration.pushed", "export.downloaded",
    "settings.updated", "webhook.created", "webhook.deleted",
    "user.login", "user.logout", "user.created",
}


def record(
    db: Session,
    *,
    tenant_id: UUID,
    organization_id: UUID,
    organization_name: Optional[str] = None,
    actor_id: str,
    actor_name: Optional[str] = None,
    actor_email: Optional[str] = None,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    summary: str,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
    metadata: Optional[dict] = None,
    snapshot_before: Optional[dict[str, Any]] = None,
    snapshot_after: Optional[dict[str, Any]] = None,
    request_id: Optional[str] = None,
) -> AuditLog:
    if action not in _ACTOR_ACTIONS:
        logger.warning("Unregistered audit action: %s", action)

    visibility = "client" if action in _VISIBLE_TO_CLIENT else "internal"

    entry = AuditLog(
        tenant_id=tenant_id,
        organization_id=organization_id,
        organization_name=organization_name,
        actor_id=actor_id,
        actor_name=actor_name,
        actor_email=actor_email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        summary=summary,
        details=details,
        ip_address=ip_address,
        visibility=visibility,
        snapshot_before=snapshot_before,
        snapshot_after=snapshot_after,
        request_id=request_id,
        metadata_json=json.dumps(metadata) if metadata else None,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    logger.info(
        "AuditLog %s actor=%s action=%s resource=%s/%s visibility=%s",
        entry.id, actor_id, action, resource_type or "-", resource_id or "-", visibility,
    )
    return entry


def query(
    db: Session,
    *,
    tenant_id: UUID,
    organization_id: UUID,
    action: Optional[str] = None,
    actor_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    visibility: Optional[str] = "client",
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    q = db.query(AuditLog).filter(
        AuditLog.tenant_id == tenant_id,
        AuditLog.organization_id == organization_id,
    )
    if visibility == "client":
        q = q.filter((AuditLog.visibility == "client") | (AuditLog.visibility.is_(None)))
    elif visibility:
        q = q.filter(AuditLog.visibility == visibility)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor_id:
        q = q.filter(AuditLog.actor_id == actor_id)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)

    total = q.count()
    rows = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return rows, total


def query_admin(
    db: Session,
    *,
    tenant_id: Optional[UUID] = None,
    organization_id: Optional[UUID] = None,
    action: Optional[str] = None,
    actor_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    visibility: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    q = db.query(AuditLog)
    if tenant_id:
        q = q.filter(AuditLog.tenant_id == tenant_id)
    if organization_id:
        q = q.filter(AuditLog.organization_id == organization_id)
    if visibility == "client":
        q = q.filter((AuditLog.visibility == "client") | (AuditLog.visibility.is_(None)))
    elif visibility:
        q = q.filter(AuditLog.visibility == visibility)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor_id:
        q = q.filter(AuditLog.actor_id == actor_id)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)

    total = q.count()
    rows = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return rows, total
