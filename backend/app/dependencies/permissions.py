from collections.abc import Callable

from fastapi import Depends, HTTPException

from app.core.permissions import PERMISSIONS, has_permission
from app.dependencies.tenant import TenantContext, require_tenant


def require_permission(permission: str) -> Callable:
    if permission not in PERMISSIONS:
        raise ValueError(f"Permiso desconocido: {permission!r}")

    async def checker(ctx: TenantContext = Depends(require_tenant)) -> TenantContext:
        if ctx.organization and getattr(ctx.organization, "is_deleted", False):
            allowed_deleted_permissions = {
                "invoices.read",
                "invoices.export",
                "reports.read",
                "reports.export",
                "dgii.read",
                "dgii.export",
                "org.settings.read",
                "users.read",
                "audit.read",
            }
            if permission not in allowed_deleted_permissions:
                raise HTTPException(
                    status_code=403,
                    detail="La organización está eliminada y solo se permite descargar e inspeccionar información fiscal.",
                )

        if not has_permission(ctx.role, ctx.permissions, permission):
            raise HTTPException(
                status_code=403,
                detail=f"No tienes permiso para esta acción ({permission})",
            )
        return ctx

    return checker
