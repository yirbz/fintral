from collections.abc import Callable

from fastapi import Depends, HTTPException

from app.core.permissions import PERMISSIONS, has_permission
from app.dependencies.tenant import TenantContext, require_tenant


def require_permission(permission: str) -> Callable:
    if permission not in PERMISSIONS:
        raise ValueError(f"Permiso desconocido: {permission!r}")

    async def checker(ctx: TenantContext = Depends(require_tenant)) -> TenantContext:
        if not has_permission(ctx.role, ctx.permissions, permission):
            raise HTTPException(
                status_code=403,
                detail=f"No tienes permiso para esta acción ({permission})",
            )
        return ctx

    return checker
