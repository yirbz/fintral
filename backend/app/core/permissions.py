PERMISSIONS: dict[str, str] = {
    "invoices.read": "Ver facturas",
    "invoices.create": "Crear facturas manuales",
    "invoices.import": "Subir/importar facturas",
    "invoices.update": "Editar facturas",
    "invoices.delete": "Mover a papelera",
    "invoices.restore": "Restaurar de papelera",
    "invoices.permanent_delete": "Eliminar permanentemente",
    "invoices.cancel": "Anular facturas (608)",
    "invoices.export": "Exportar facturas",
    "reports.read": "Ver reportes",
    "reports.export": "Exportar reportes",
    "dgii.read": "Ver reportes DGII",
    "dgii.export": "Exportar reportes DGII (606/607/608)",
    "users.read": "Ver miembros",
    "users.invite": "Invitar miembros",
    "users.manage_roles": "Cambiar roles/permisos",
    "users.remove": "Eliminar miembros",
    "org.settings.read": "Ver configuración de organización",
    "org.settings.update": "Modificar configuración",
    "org.create": "Crear organizaciones bajo el mismo tenant",
    "org.delete": "Eliminar organización",
    "integrations.read": "Ver integraciones",
    "integrations.manage": "Gestionar conexiones",
    "integrations.push": "Enviar facturas a integraciones",
    "audit.read": "Ver historial de actividad",
    "settings.all": "Acceder a configuración del sistema",
}

OWNER_BYPASS = True

ROLE_DEFAULT_PERMISSIONS: dict[str, list[str]] = {
    "admin": [
        "invoices.read", "invoices.create", "invoices.import", "invoices.update",
        "invoices.delete", "invoices.restore", "invoices.permanent_delete",
        "invoices.cancel", "invoices.export",
        "reports.read", "reports.export",
        "dgii.read", "dgii.export",
        "users.read", "users.invite", "users.manage_roles", "users.remove",
        "org.settings.read", "org.settings.update",
        "integrations.read", "integrations.manage", "integrations.push",
        "audit.read",
        "settings.all",
    ],
    "member": [
        "invoices.read", "invoices.create", "invoices.import", "invoices.update",
        "invoices.delete", "invoices.restore", "invoices.cancel",
        "invoices.export",
        "reports.read", "reports.export",
        "dgii.read", "dgii.export",
        "integrations.read", "integrations.push",
        "audit.read",
    ],
    "viewer": [
        "invoices.read",
        "reports.read",
        "dgii.read",
        "audit.read",
    ],
}


def has_permission(
    role: str,
    permissions: list[str] | None,
    required: str,
) -> bool:
    if role == "owner":
        return True
    effective = permissions if permissions is not None else ROLE_DEFAULT_PERMISSIONS.get(role, [])
    return required in effective
